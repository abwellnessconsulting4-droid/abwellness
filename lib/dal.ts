import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { recordAudit } from "@/lib/audit";
import { getAuth } from "@/lib/auth";
import type { AuthContext } from "@/lib/authz";
import { systemToken } from "@/lib/db/phi-guard";
import { connectToDatabase } from "@/lib/mongodb";
import { isStaff, ROLES, sessionPolicyFor, type Role } from "@/lib/rbac";
import { Patient, StaffProfile } from "@/models/people";

/**
 * Data Access Layer entry point (per the Next.js auth guide): every Server
 * Component, Server Action, and Route Handler that touches PHI calls
 * requireSession() first. proxy.ts only does an optimistic cookie check.
 */

const PROFILE_LOOKUP = systemToken("session-profile-lookup");

export type SessionProblem = "signed_out" | "inactive_account" | "mfa_required" | "idle_timeout" | "session_expired";

export class SessionError extends Error {
  constructor(readonly problem: SessionProblem) {
    super(problem);
    this.name = "SessionError";
  }
}

async function endSession(token: string, actor: Partial<AuthContext>, problem: SessionProblem) {
  const ctx = await getAuth().$context;
  await ctx.internalAdapter.deleteSession(token);
  await recordAudit(
    { actorId: actor.userId, actorRole: actor.role ?? "USER", sessionId: actor.sessionId },
    { action: "SESSION_TIMEOUT", resourceType: "Session", resourceId: actor.sessionId, metadata: { problem } },
  );
}

/**
 * Resolve and validate the current session. Throws SessionError; use
 * requireSession() in pages to redirect instead.
 */
export const getAuthContext = cache(async (allowMfaSetup = false): Promise<AuthContext> => {
  const requestHeaders = await headers();
  const result = await getAuth().api.getSession({ headers: requestHeaders });
  if (!result) throw new SessionError("signed_out");

  const { session, user } = result;
  const role = user.role as Role;
  if (!ROLES.includes(role) || user.status !== "ACTIVE") throw new SessionError("inactive_account");

  const policy = sessionPolicyFor(role);
  const now = Date.now();
  const base = { userId: user.id, role, sessionId: session.id };

  // Sessions slide on activity (lib/auth.ts); updatedAt is the last refresh.
  if (now - new Date(session.updatedAt).getTime() > policy.idleMinutes * 60_000) {
    await endSession(session.token, base, "idle_timeout");
    throw new SessionError("idle_timeout");
  }
  if (now - new Date(session.createdAt).getTime() > policy.absoluteHours * 3_600_000) {
    await endSession(session.token, base, "session_expired");
    throw new SessionError("session_expired");
  }

  const mfaVerified = Boolean(user.twoFactorEnabled);
  if (!mfaVerified && !allowMfaSetup) throw new SessionError("mfa_required");

  await connectToDatabase();
  const [patient, staff] = await Promise.all([
    role === "PATIENT" ? Patient.findOne({ userId: user.id }, { _id: 1 }).setOptions({ authz: PROFILE_LOOKUP }).lean() : null,
    isStaff(role) ? StaffProfile.findOne({ userId: user.id }, { _id: 1 }).lean() : null,
  ]);

  return {
    userId: user.id,
    actorId: user.id,
    role,
    actorRole: role,
    patientId: patient ? String(patient._id) : undefined,
    staffProfileId: staff ? String(staff._id) : undefined,
    sessionId: session.id,
    ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? session.ipAddress ?? undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
    requestId: requestHeaders.get("x-vercel-id") ?? undefined,
    mfaVerified,
  };
});

const REDIRECT_FOR: Record<SessionProblem, string> = {
  signed_out: "/login",
  inactive_account: "/login?reason=inactive",
  mfa_required: "/account/security/setup",
  idle_timeout: "/login?reason=timeout",
  session_expired: "/login?reason=expired",
};

/** For pages and layouts: returns the context or redirects. */
export async function requireSession(options: { roles?: readonly Role[]; allowMfaSetup?: boolean } = {}) {
  let ctx: AuthContext;
  try {
    ctx = await getAuthContext(options.allowMfaSetup ?? false);
  } catch (error) {
    if (error instanceof SessionError) redirect(REDIRECT_FOR[error.problem]);
    throw error;
  }
  if (options.roles && !options.roles.includes(ctx.role)) {
    await recordAudit(ctx, {
      action: "UNAUTHORIZED_ACCESS_ATTEMPT",
      outcome: "DENIED",
      resourceType: "Route",
      metadata: { requiredRoles: options.roles },
    });
    redirect(ctx.role === "PATIENT" ? "/portal" : "/dashboard");
  }
  return ctx;
}

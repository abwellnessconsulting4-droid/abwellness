import "server-only";

import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { AuditedDenial, recordAudit } from "@/lib/audit";
import { getAuth } from "@/lib/auth";
import { authorize, type AuthContext } from "@/lib/authz";
import { systemToken } from "@/lib/db/phi-guard";
import { connectToDatabase } from "@/lib/mongodb";
import { ROLES, STAFF_ROLES, type Role } from "@/lib/rbac";
import { AuditLog, StaffProfile } from "@/models";

/**
 * Account administration (SUPER_ADMIN). Every change is authorized against the
 * RBAC matrix, requires a reason, and is audited with the field names changed.
 * Safeguards: an admin can't demote, deactivate, or reset their own account, and
 * the last active SUPER_ADMIN can't be removed.
 */

const LOOKUP = systemToken("user-admin-lookup");

export class AdminActionError extends Error {}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
  credentials?: string;
}

const users = () => mongoose.connection.db!.collection("user");
const userObjectId = (id: string) => {
  if (!mongoose.isValidObjectId(id)) throw new AdminActionError("Unknown user.");
  return new mongoose.Types.ObjectId(id);
};

function requireReason(reason: string | undefined) {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 5) throw new AdminActionError("Please give a reason (at least 5 characters). It's recorded in the audit trail.");
  return trimmed.slice(0, 500);
}

async function lastLogins(ids: string[]) {
  if (ids.length === 0) return new Map<string, Date>();
  const rows = await AuditLog.aggregate<{ _id: string; at: Date }>([
    { $match: { action: "LOGIN", actorId: { $in: ids } } },
    { $group: { _id: "$actorId", at: { $max: "$timestamp" } } },
  ]).option({ authz: LOOKUP });
  return new Map(rows.map((r) => [r._id, r.at]));
}

export async function listUsers(ctx: AuthContext, filters: { role?: string; status?: string; q?: string } = {}): Promise<AdminUser[]> {
  await connectToDatabase();
  await authorize(ctx, "user", "read");

  const query: Record<string, unknown> = {};
  if (filters.role && (ROLES as readonly string[]).includes(filters.role)) query.role = filters.role;
  if (filters.status && ["ACTIVE", "SUSPENDED", "DEACTIVATED", "INVITED"].includes(filters.status)) query.status = filters.status;
  if (filters.q) {
    const pattern = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 80), "i");
    query.$or = [{ name: pattern }, { email: pattern }];
  }

  const docs = await users().find(query).sort({ role: 1, name: 1 }).limit(500).toArray();
  const ids = docs.map((d) => String(d._id));
  const [logins, profiles] = await Promise.all([
    lastLogins(ids),
    StaffProfile.find({ userId: { $in: docs.map((d) => d._id) } }, { userId: 1, credentials: 1 }).lean(),
  ]);
  const credentials = new Map(profiles.map((p) => [String(p.userId), p.credentials ?? undefined]));

  await recordAudit(ctx, { action: "VIEW", resourceType: "UserList", metadata: { results: docs.length } });

  return docs.map((d) => ({
    id: String(d._id),
    name: d.name,
    email: d.email,
    role: d.role,
    status: d.status ?? "ACTIVE",
    twoFactorEnabled: Boolean(d.twoFactorEnabled),
    emailVerified: Boolean(d.emailVerified),
    createdAt: d.createdAt,
    lastLoginAt: logins.get(String(d._id)),
    credentials: credentials.get(String(d._id)),
  }));
}

export async function getUser(ctx: AuthContext, id: string) {
  await connectToDatabase();
  await authorize(ctx, "user", "read", { resourceId: id });
  const doc = await users().findOne({ _id: userObjectId(id) });
  if (!doc) return null;
  const [logins, profile, activeSessions, recent] = await Promise.all([
    lastLogins([id]),
    StaffProfile.findOne({ userId: doc._id }).lean(),
    mongoose.connection.db!.collection("session").countDocuments({ userId: doc._id, expiresAt: { $gt: new Date() } }),
    AuditLog.find({ actorId: id }).sort({ seq: -1 }).limit(15).setOptions({ authz: LOOKUP }).lean(),
  ]);
  await recordAudit(ctx, { action: "VIEW", resourceType: "User", resourceId: id });
  return {
    user: {
      id,
      name: doc.name as string,
      email: doc.email as string,
      role: doc.role as Role,
      status: (doc.status as string) ?? "ACTIVE",
      twoFactorEnabled: Boolean(doc.twoFactorEnabled),
      emailVerified: Boolean(doc.emailVerified),
      createdAt: doc.createdAt as Date,
      lastLoginAt: logins.get(id),
    },
    profile: profile ? { displayName: profile.displayName, credentials: profile.credentials, npi: profile.npi, specialty: profile.specialty } : null,
    activeSessions,
    recent: recent.map((e) => ({ seq: e.seq, timestamp: e.timestamp, action: e.action, outcome: e.outcome, resource: [e.resourceType, e.resourceId].filter(Boolean).join(" ") })),
  };
}

async function activeAdminCount() {
  return users().countDocuments({ role: "SUPER_ADMIN", status: "ACTIVE" });
}

async function loadTarget(ctx: AuthContext, id: string) {
  await connectToDatabase();
  await authorize(ctx, "user", "update", { resourceId: id });
  const target = await users().findOne({ _id: userObjectId(id) });
  if (!target) throw new AdminActionError("That user no longer exists.");
  return target as unknown as { _id: mongoose.Types.ObjectId; role: string; status?: string; email: string };
}

async function denyIfSelf(ctx: AuthContext, id: string, what: string) {
  if (id !== ctx.userId) return;
  await recordAudit(ctx, { action: "UNAUTHORIZED_ACCESS_ATTEMPT", outcome: "DENIED", resourceType: "User", resourceId: id, metadata: { attempted: what, reason: "own account" } });
  throw new AdminActionError(`You can't ${what} your own account. Ask another administrator.`);
}

async function protectLastAdmin(target: { role: string; status?: string }, nextRole: string, nextStatus: string) {
  const losingAdmin = target.role === "SUPER_ADMIN" && (target.status ?? "ACTIVE") === "ACTIVE" && (nextRole !== "SUPER_ADMIN" || nextStatus !== "ACTIVE");
  if (losingAdmin && (await activeAdminCount()) <= 1) {
    throw new AdminActionError("This is the only active administrator. Add another administrator first.");
  }
}

export async function changeRole(ctx: AuthContext, id: string, role: string, reasonInput: string) {
  const reason = requireReason(reasonInput);
  if (!(ROLES as readonly string[]).includes(role)) throw new AdminActionError("Unknown role.");
  await denyIfSelf(ctx, id, "change the role of");
  const target = await loadTarget(ctx, id);
  if (target.role === role) return;
  if ((target.role === "PATIENT") !== (role === "PATIENT")) {
    throw new AdminActionError("Client and staff accounts can't be converted into each other. Create a separate account instead.");
  }
  await protectLastAdmin(target, role, target.status ?? "ACTIVE");

  const auth = await getAuth().$context;
  await auth.internalAdapter.updateUser(id, { role });
  await auth.internalAdapter.deleteUserSessions(id); // new permissions take effect at next sign-in
  await recordAudit(ctx, { action: "UPDATE", resourceType: "User", resourceId: id, reason, changedFields: ["role"], metadata: { from: target.role, to: role } });
}

export async function setStatus(ctx: AuthContext, id: string, status: "ACTIVE" | "DEACTIVATED", reasonInput: string) {
  const reason = requireReason(reasonInput);
  await denyIfSelf(ctx, id, status === "ACTIVE" ? "reactivate" : "deactivate");
  const target = await loadTarget(ctx, id);
  if ((target.status ?? "ACTIVE") === status) return;
  await protectLastAdmin(target, target.role, status);

  const auth = await getAuth().$context;
  await auth.internalAdapter.updateUser(id, { status });
  if (status !== "ACTIVE") await auth.internalAdapter.deleteUserSessions(id);
  await recordAudit(ctx, { action: "UPDATE", resourceType: "User", resourceId: id, reason, changedFields: ["status"], metadata: { from: target.status ?? "ACTIVE", to: status } });
}

/** Lost phone / email: turn off two-step login so the person re-enrolls at next sign-in. */
export async function resetTwoFactor(ctx: AuthContext, id: string, reasonInput: string) {
  const reason = requireReason(reasonInput);
  await denyIfSelf(ctx, id, "reset two-step verification for");
  await loadTarget(ctx, id);

  const auth = await getAuth().$context;
  await auth.internalAdapter.updateUser(id, { twoFactorEnabled: false });
  await mongoose.connection.db!.collection("twoFactor").deleteMany({ userId: userObjectId(id) });
  await auth.internalAdapter.deleteUserSessions(id);
  await recordAudit(ctx, { action: "UPDATE", resourceType: "User", resourceId: id, reason, changedFields: ["twoFactorEnabled", "backupCodes"] });
}

export async function signOutEverywhere(ctx: AuthContext, id: string, reasonInput: string) {
  const reason = requireReason(reasonInput);
  await loadTarget(ctx, id);
  const auth = await getAuth().$context;
  await auth.internalAdapter.deleteUserSessions(id);
  await recordAudit(ctx, { action: "UPDATE", resourceType: "Session", resourceId: id, reason, changedFields: ["sessions"], metadata: { revoked: "all" } });
}

/** Email a link to set (or reset) the password. Invitations and resets share Better Auth's reset flow. */
export async function sendPasswordLink(ctx: AuthContext | null, email: string, kind: "invite" | "reset") {
  const redirectTo = kind === "invite" ? "/reset-password?invite=1" : "/reset-password";
  await getAuth().api.requestPasswordReset({ body: { email, redirectTo } });
  if (ctx) await recordAudit(ctx, { action: "UPDATE", resourceType: "User", metadata: { passwordLink: kind } });
}

export interface InviteInput {
  name: string;
  email: string;
  role: string;
  credentials?: string;
  npi?: string;
  specialty?: string;
  reason: string;
}

/** Create a staff account (no usable password yet) and email an invitation to set one. */
export async function inviteStaff(ctx: AuthContext, input: InviteInput) {
  const reason = requireReason(input.reason);
  await connectToDatabase();
  await authorize(ctx, "user", "create");

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new AdminActionError("Enter the person's full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AdminActionError("Enter a valid email address.");
  if (!(STAFF_ROLES as readonly string[]).includes(input.role)) throw new AdminActionError("Choose a staff role. Client accounts are created from the client's record.");
  const npi = input.npi?.trim() || undefined;
  if (npi && !/^\d{10}$/.test(npi)) throw new AdminActionError("An NPI has exactly 10 digits.");

  const auth = await getAuth().$context;
  if (await auth.internalAdapter.findUserByEmail(email)) throw new AdminActionError("An account with that email already exists.");

  const user = await auth.internalAdapter.createUser(
    { name, email, emailVerified: true, role: input.role, status: "ACTIVE" },
    { method: "admin" },
  );
  // Credential account with a random password nobody knows; the invite link sets the real one.
  await auth.internalAdapter.linkAccount({
    providerId: "credential",
    accountId: user.id,
    userId: user.id,
    password: await auth.password.hash(randomBytes(32).toString("base64url")),
  });
  await StaffProfile.create({
    userId: new mongoose.Types.ObjectId(user.id),
    displayName: input.credentials ? `${name}, ${input.credentials.trim()}` : name,
    credentials: input.credentials?.trim() || undefined,
    npi,
    specialty: input.specialty?.trim() || undefined,
  });

  await recordAudit(ctx, {
    action: "CREATE",
    resourceType: "User",
    resourceId: user.id,
    reason,
    changedFields: ["name", "email", "role", ...(npi ? ["npi"] : [])],
    metadata: { role: input.role },
  });
  await sendPasswordLink(null, email, "invite");
  return user.id;
}

export { AuditedDenial };

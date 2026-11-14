import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { MongoClient } from "mongodb";
import { recordAudit } from "@/lib/audit";
import { SITE_NAME } from "@/lib/constants";
import { sendEmailVerification, sendInvitation, sendPasswordReset, sendSignInCode } from "@/lib/email/security";
import { connectToDatabase } from "@/lib/mongodb";
import { SESSION_POLICY } from "@/lib/rbac";

/**
 * Better Auth: email + password, mandatory second factor (TOTP or emailed
 * code, plus backup codes), database sessions in MongoDB.
 *
 * Sessions slide: each request refreshes expiresAt (at most once a minute),
 * so expiresIn acts as the inactivity timeout. It's set to the longest policy
 * (patients, 30 min); lib/dal.ts enforces the shorter staff timeout (15 min)
 * and the absolute lifetimes, and blocks users who haven't enrolled in MFA.
 *
 * `role` can't be set by clients (input: false): self sign-up always creates a
 * PATIENT, and staff accounts are created server-side by an admin.
 */

let client: MongoClient | undefined;

const FAILURE_AUDITED_PATHS = new Set([
  "/sign-in/email",
  "/two-factor/verify-totp",
  "/two-factor/verify-otp",
  "/two-factor/verify-backup-code",
]);

function roleOf(user: unknown) {
  return String((user as { role?: string } | null)?.role ?? "USER");
}

function requestIp(request: Request | undefined) {
  return request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request?.headers.get("x-real-ip") || undefined;
}

function createAuth() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI.");
  if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET) {
    throw new Error("Missing BETTER_AUTH_SECRET.");
  }

  client = new MongoClient(uri); // connects lazily on first use
  const isProduction = process.env.NODE_ENV === "production";

  return betterAuth({
    appName: SITE_NAME,
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
    database: mongodbAdapter(client.db(), { client }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      // Staff invitations reuse the reset flow (redirect carries ?invite=1), so links last a working day.
      resetPasswordTokenExpiresIn: 24 * 60 * 60,
      sendResetPassword: async ({ user, url }) =>
        /invite(%3D|=)1/.test(url) ? sendInvitation(user.email, user.name, url) : sendPasswordReset(user.email, url),
      onPasswordReset: async ({ user }) => {
        await connectToDatabase();
        await recordAudit({ actorId: user.id, actorRole: roleOf(user) }, { action: "UPDATE", resourceType: "User", resourceId: user.id, changedFields: ["password"], metadata: { via: "reset link" } });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => sendEmailVerification(user.email, url),
    },

    user: {
      additionalFields: {
        role: { type: "string", required: true, defaultValue: "PATIENT", input: false },
        status: { type: "string", required: true, defaultValue: "ACTIVE", input: false },
      },
    },

    session: {
      expiresIn: SESSION_POLICY.patient.idleMinutes * 60,
      updateAge: 60,
      cookieCache: { enabled: false }, // always validate against the database
    },

    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
        "/two-factor/verify-otp": { window: 60, max: 5 },
        "/forget-password": { window: 300, max: 3 },
      },
    },

    advanced: {
      cookiePrefix: "abw",
      useSecureCookies: isProduction,
    },

    hooks: {
      // Record sign-outs while the session still exists.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-out") return;
        const current = await getSessionFromCtx(ctx);
        if (!current) return;
        await connectToDatabase();
        await recordAudit(
          {
            actorId: current.user.id,
            actorRole: String((current.user as { role?: string }).role ?? "USER"),
            sessionId: current.session.id,
            ipAddress: requestIp(ctx.request),
            userAgent: ctx.request?.headers.get("user-agent") ?? undefined,
          },
          { action: "LOGOUT", resourceType: "Session", resourceId: current.session.id },
        );
      }),
      // Sign-in outcomes. LOGIN only once authentication fully completes (password, plus the
      // second step when enrolled). Better Auth clears newSession while a code is pending.
      after: createAuthMiddleware(async (ctx) => {
        if (!FAILURE_AUDITED_PATHS.has(ctx.path)) return;
        const returned = ctx.context.returned;
        const actorBase = { ipAddress: requestIp(ctx.request), userAgent: ctx.request?.headers.get("user-agent") ?? undefined };

        if (isAPIError(returned)) {
          // Email never stored; the user id is recorded when the address matches an account.
          const email = typeof ctx.body?.email === "string" ? ctx.body.email.toLowerCase() : undefined;
          const user = email ? await ctx.context.internalAdapter.findUserByEmail(email).then((r) => r?.user) : undefined;
          await connectToDatabase();
          await recordAudit(
            { ...actorBase, actorId: user?.id, actorRole: user ? roleOf(user) : "ANONYMOUS" },
            { action: "LOGIN_FAILED", outcome: "DENIED", resourceType: "Session", metadata: { step: ctx.path, code: String(returned.body?.code ?? returned.status) } },
          );
          return;
        }

        // This hook can run before the two-factor plugin discards the password-step session, so
        // decide from the account: with 2FA on, the password step is only ever a challenge
        // (device trust is not enabled).
        const created = ctx.context.newSession;
        const challenge = ctx.path === "/sign-in/email" && (!created || Boolean(created.user.twoFactorEnabled));
        await connectToDatabase();
        if (created && !challenge) {
          await recordAudit(
            { ...actorBase, actorId: created.user.id, actorRole: roleOf(created.user), sessionId: created.session.id },
            { action: "LOGIN", resourceType: "Session", resourceId: created.session.id, metadata: { step: ctx.path } },
          );
        } else if (challenge) {
          const email = typeof ctx.body?.email === "string" ? ctx.body.email.toLowerCase() : undefined;
          const user = email ? await ctx.context.internalAdapter.findUserByEmail(email).then((r) => r?.user) : undefined;
          await recordAudit(
            { ...actorBase, actorId: user?.id, actorRole: user ? roleOf(user) : "ANONYMOUS" },
            { action: "MFA_CHALLENGE", resourceType: "Session", metadata: { step: "password accepted; second step pending" } },
          );
        }
      }),
    },

    databaseHooks: {
      session: {
        create: {
          // Deactivated or suspended accounts never get a session. This runs after the password
          // (or code) has been verified, so it reveals nothing to someone guessing.
          before: async (session, ctx) => {
            const user = ctx ? await ctx.context.internalAdapter.findUserById(String(session.userId)) : null;
            if (user && (user as { status?: string }).status !== "ACTIVE") return false;
          },
        },
      },
    },

    plugins: [
      twoFactor({
        issuer: SITE_NAME,
        otpOptions: {
          period: 5,
          sendOTP: async ({ user, otp }) => sendSignInCode(user.email, otp),
        },
        backupCodeOptions: { amount: 10 },
      }),
      nextCookies(), // must be last
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Lazily created so builds don't need database credentials. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

/** Close Better Auth's own MongoDB connection (scripts and tests; servers keep it open). */
export async function closeAuth() {
  await client?.close();
  client = undefined;
  instance = undefined;
}

export const SESSION_COOKIE_PREFIX = "abw";

import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { MongoClient } from "mongodb";
import { recordAudit } from "@/lib/audit";
import { SITE_NAME } from "@/lib/constants";
import { sendEmailVerification, sendPasswordReset, sendSignInCode } from "@/lib/email/security";
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
      sendResetPassword: async ({ user, url }) => sendPasswordReset(user.email, url),
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

    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            await recordAudit(
              {
                actorId: String(session.userId),
                actorRole: "USER",
                ipAddress: session.ipAddress ?? undefined,
                userAgent: session.userAgent ?? undefined,
                sessionId: String(session.id),
              },
              { action: "LOGIN", resourceType: "Session", resourceId: String(session.id) },
            );
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

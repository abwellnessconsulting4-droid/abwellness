import mongoose from "mongoose";
import { beforeAll } from "vitest";
import type { AuthContext } from "@/lib/authz";
import type { Role } from "@/lib/rbac";
import { setupTestDatabase } from "./helpers";

/**
 * Seeded test database (scripts/seed/emr.ts) plus a way to act as any seeded
 * account, mirroring what lib/dal.ts builds from a real session.
 */
export function setupSeededDatabase(name: string) {
  const db = setupTestDatabase(name);
  beforeAll(async () => {
    process.env.MONGODB_URI = db.uri();
    process.env.BETTER_AUTH_SECRET = "test-secret-at-least-32-characters-long!!";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    const { seedEmr } = await import("@/scripts/seed/emr");
    await seedEmr({ password: "seed-test-password-123" });
  });

  async function as(email: string): Promise<AuthContext> {
    const db = mongoose.connection.db!;
    const user = await db.collection("user").findOne({ email });
    if (!user) throw new Error(`No seeded user ${email}`);
    const role = user.role as Role;
    const [patient, staff] = await Promise.all([
      db.collection("patients").findOne({ userId: user._id }, { projection: { _id: 1 } }),
      db.collection("staffprofiles").findOne({ userId: user._id }, { projection: { _id: 1 } }),
    ]);
    const id = String(user._id);
    return {
      userId: id,
      actorId: id,
      role,
      actorRole: role,
      patientId: patient ? String(patient._id) : undefined,
      staffProfileId: staff ? String(staff._id) : undefined,
      mfaVerified: true,
      displayName: user.name,
      ipAddress: "203.0.113.5",
    };
  }
  return { db, as };
}

export const EMAIL = {
  admin: "admin@example.com",
  thorne: "aris.thorne@example.com",
  ellis: "jordan.ellis@example.com",
  billing: "billing@example.com",
  frontDesk: "frontdesk@example.com",
  elena: "elena.vance@example.com",
};

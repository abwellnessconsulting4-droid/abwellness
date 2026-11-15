import mongoose from "mongoose";
import { beforeAll, describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/authz";
import { systemToken } from "@/lib/db/phi-guard";
import { AuditLog, StaffProfile } from "@/models";
import { setupTestDatabase } from "./helpers";

const db = setupTestDatabase("admin_users");
const SYS = systemToken("test");
type Admin = typeof import("@/lib/admin/users");
let admin: Admin;
let getAuth: (typeof import("@/lib/auth"))["getAuth"];
const ids: Record<string, string> = {};

const ctxFor = (id: string): AuthContext => ({ userId: id, actorId: id, role: "SUPER_ADMIN", actorRole: "SUPER_ADMIN", mfaVerified: true });

async function makeUser(key: string, role: string) {
  const auth = await getAuth().$context;
  const user = await auth.internalAdapter.createUser({ name: key, email: `${key}@example.com`, emailVerified: true, role, status: "ACTIVE" }, { method: "admin" });
  ids[key] = user.id;
  await auth.internalAdapter.createSession(user.id, false); // an active session to revoke
}
const sessionsOf = (id: string) => mongoose.connection.collection("session").countDocuments({ userId: new mongoose.Types.ObjectId(id) });
const userDoc = (id: string) => mongoose.connection.collection("user").findOne({ _id: new mongoose.Types.ObjectId(id) });

beforeAll(async () => {
  process.env.MONGODB_URI = db.uri();
  process.env.BETTER_AUTH_SECRET = "test-secret-at-least-32-characters-long!!";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  ({ getAuth } = await import("@/lib/auth"));
  admin = await import("@/lib/admin/users");
  await makeUser("camila", "SUPER_ADMIN");
  await makeUser("marcus", "BILLING_STAFF");
  await makeUser("elena", "PATIENT");
});

describe("safeguards", () => {
  it("requires a reason for every change", async () => {
    await expect(admin.setStatus(ctxFor(ids.camila), ids.marcus, "DEACTIVATED", "")).rejects.toThrow(/reason/);
  });

  it("refuses changes to your own account, and audits the attempt", async () => {
    await expect(admin.changeRole(ctxFor(ids.camila), ids.camila, "PROVIDER", "testing self change")).rejects.toThrow(/your own account/);
    await expect(admin.setStatus(ctxFor(ids.camila), ids.camila, "DEACTIVATED", "testing self change")).rejects.toThrow(/your own account/);
    expect(await AuditLog.countDocuments({ action: "UNAUTHORIZED_ACCESS_ATTEMPT", resourceId: ids.camila }).setOptions({ authz: SYS })).toBe(2);
  });

  it("protects the last active administrator", async () => {
    // A second admin acting on Camila, the only active SUPER_ADMIN... first make the actor exist.
    await makeUser("ops", "FRONT_DESK");
    await expect(admin.changeRole(ctxFor(ids.ops), ids.camila, "PROVIDER", "demote the only admin")).rejects.toThrow(/only active administrator/);
    await expect(admin.setStatus(ctxFor(ids.ops), ids.camila, "DEACTIVATED", "remove the only admin")).rejects.toThrow(/only active administrator/);
  });

  it("won't convert client and staff accounts into each other", async () => {
    await expect(admin.changeRole(ctxFor(ids.camila), ids.elena, "PROVIDER", "make client a provider")).rejects.toThrow(/can't be converted/);
  });
});

describe("account actions", () => {
  it("changes a role, signs the person out, and audits from/to", async () => {
    expect(await sessionsOf(ids.marcus)).toBeGreaterThan(0);
    await admin.changeRole(ctxFor(ids.camila), ids.marcus, "FRONT_DESK", "moved to front desk");
    expect((await userDoc(ids.marcus))?.role).toBe("FRONT_DESK");
    expect(await sessionsOf(ids.marcus)).toBe(0);
    const entry = await AuditLog.findOne({ resourceId: ids.marcus, changedFields: "role" }).setOptions({ authz: SYS }).lean();
    expect(entry).toMatchObject({ reason: "moved to front desk", metadata: { from: "BILLING_STAFF", to: "FRONT_DESK" } });
  });

  it("deactivates (ending sessions) and reactivates", async () => {
    await getAuth().$context.then((a) => a.internalAdapter.createSession(ids.marcus, false));
    await admin.setStatus(ctxFor(ids.camila), ids.marcus, "DEACTIVATED", "left the practice");
    expect((await userDoc(ids.marcus))?.status).toBe("DEACTIVATED");
    expect(await sessionsOf(ids.marcus)).toBe(0);
    await admin.setStatus(ctxFor(ids.camila), ids.marcus, "ACTIVE", "returned from leave");
    expect((await userDoc(ids.marcus))?.status).toBe("ACTIVE");
  });

  it("resets two-step verification so the person re-enrolls", async () => {
    await mongoose.connection.collection("user").updateOne({ _id: new mongoose.Types.ObjectId(ids.elena) }, { $set: { twoFactorEnabled: true } });
    await mongoose.connection.collection("twoFactor").insertOne({ userId: new mongoose.Types.ObjectId(ids.elena), secret: "x", backupCodes: "y", verified: true });
    await admin.resetTwoFactor(ctxFor(ids.camila), ids.elena, "lost phone, identity confirmed by phone");
    expect((await userDoc(ids.elena))?.twoFactorEnabled).toBe(false);
    expect(await mongoose.connection.collection("twoFactor").countDocuments({ userId: new mongoose.Types.ObjectId(ids.elena) })).toBe(0);
  });
});

describe("invitations", () => {
  it("creates the account and staff profile, audits it, and emails a set-password link", async () => {
    const id = await admin.inviteStaff(ctxFor(ids.camila), {
      name: "Jordan Ellis", email: "Jordan.Ellis@Example.com", role: "PROVIDER", credentials: "LCSW", npi: "", reason: "new hire starting 12/1",
    });
    const user = await userDoc(id);
    expect(user).toMatchObject({ email: "jordan.ellis@example.com", role: "PROVIDER", status: "ACTIVE", emailVerified: true, twoFactorEnabled: false });
    expect(await StaffProfile.findOne({ userId: new mongoose.Types.ObjectId(id) }).lean()).toMatchObject({ displayName: "Jordan Ellis, LCSW", credentials: "LCSW" });
    expect(await mongoose.connection.collection("verification").countDocuments({ identifier: /^reset-password/ })).toBe(1);
    expect(await AuditLog.findOne({ action: "CREATE", resourceType: "User", resourceId: id }).setOptions({ authz: SYS }).lean()).toMatchObject({ reason: "new hire starting 12/1" });
  });

  it("rejects duplicates, client roles, and bad NPIs", async () => {
    const base = { name: "X Y", role: "PROVIDER", reason: "testing validation" };
    await expect(admin.inviteStaff(ctxFor(ids.camila), { ...base, email: "jordan.ellis@example.com" })).rejects.toThrow(/already exists/);
    await expect(admin.inviteStaff(ctxFor(ids.camila), { ...base, email: "new@example.com", role: "PATIENT" })).rejects.toThrow(/staff role/);
    await expect(admin.inviteStaff(ctxFor(ids.camila), { ...base, email: "new@example.com", npi: "123" })).rejects.toThrow(/10 digits/);
  });
});

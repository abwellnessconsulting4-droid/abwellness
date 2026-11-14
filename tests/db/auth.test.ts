import mongoose from "mongoose";
import { beforeAll, describe, expect, it } from "vitest";
import { systemToken } from "@/lib/db/phi-guard";
import { AuditLog } from "@/models";
import { setupTestDatabase } from "./helpers";

const db = setupTestDatabase("auth");
const SYS = systemToken("test");
type AuthModule = typeof import("@/lib/auth");
let getAuth: AuthModule["getAuth"];

const email = "elena.vance@example.com";
const password = "correct-horse-battery-staple";

beforeAll(async () => {
  process.env.MONGODB_URI = db.uri();
  process.env.BETTER_AUTH_SECRET = "test-secret-at-least-32-characters-long!!";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  ({ getAuth } = await import("@/lib/auth"));
});

describe("Better Auth configuration", () => {
  it("self sign-up creates a PATIENT and ignores any role sent by the client", async () => {
    await getAuth().api.signUpEmail({
      body: { email: "mallory@example.com", password, name: "Mallory", role: "SUPER_ADMIN" } as never,
    });
    const mallory = await mongoose.connection.collection("user").findOne({ email: "mallory@example.com" });
    expect(mallory?.role).toBe("PATIENT");

    await getAuth().api.signUpEmail({ body: { email, password, name: "Elena Vance" } });
    const user = await mongoose.connection.collection("user").findOne({ email });
    expect(user).toMatchObject({ role: "PATIENT", status: "ACTIVE", emailVerified: false });
  });

  it("blocks sign-in until the email is verified", async () => {
    await expect(getAuth().api.signInEmail({ body: { email, password } })).rejects.toThrow(/not verified/i);
  });

  it("audits a successful sign-in", async () => {
    await mongoose.connection.collection("user").updateOne({ email }, { $set: { emailVerified: true } });
    const result = await getAuth().api.signInEmail({ body: { email, password } });
    expect(result.token).toBeTruthy();

    const login = await AuditLog.findOne({ action: "LOGIN" }).setOptions({ authz: SYS }).lean();
    expect(login).toMatchObject({ resourceType: "Session", outcome: "SUCCESS" });
  });

  it("rejects short passwords", async () => {
    await expect(getAuth().api.signUpEmail({ body: { email: "short@example.com", password: "tooshort", name: "S" } })).rejects.toThrow();
  });
});

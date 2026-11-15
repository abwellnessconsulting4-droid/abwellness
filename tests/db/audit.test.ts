import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { changedFields, recordAudit, verifyAuditChain, withAudit } from "@/lib/audit";
import { systemToken } from "@/lib/db/phi-guard";
import { AuditLog } from "@/models";
import { setupTestDatabase } from "./helpers";

setupTestDatabase("audit");

const actor = { actorId: "user-1", actorRole: "PROVIDER", ipAddress: "10.0.0.5", userAgent: "vitest" };
const SYS = systemToken("test");

describe("audit chain", () => {
  it("links entries and verifies", async () => {
    await recordAudit(actor, { action: "VIEW", resourceType: "Patient", resourceId: "p1", patientId: "p1" });
    await recordAudit(actor, { action: "UPDATE", resourceType: "Patient", resourceId: "p1", patientId: "p1", changedFields: ["phone"] });
    const result = await verifyAuditChain();
    expect(result).toEqual({ ok: true, checked: 2 });
  });

  it("stays consistent under 30 concurrent writers", async () => {
    await Promise.all(
      Array.from({ length: 30 }, (_, i) => recordAudit(actor, { action: "VIEW", resourceType: "ClinicalNote", resourceId: `n${i}` })),
    );
    const seqs = (await AuditLog.find({}, { seq: 1 }).sort({ seq: 1 }).setOptions({ authz: SYS }).lean()).map((d) => d.seq);
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1));
    expect((await verifyAuditChain()).ok).toBe(true);
  });

  it("detects an entry edited directly in the database", async () => {
    // Bypass the app (as an attacker with database access would).
    await mongoose.connection.collection("auditlogs").updateOne({ seq: 5 }, { $set: { actorId: "someone-else" } });
    expect(await verifyAuditChain()).toMatchObject({ ok: false, brokenAtSeq: 5, problem: "hash_mismatch" });
    await mongoose.connection.collection("auditlogs").updateOne({ seq: 5 }, { $set: { actorId: "user-1" } });
    expect((await verifyAuditChain()).ok).toBe(true);
  });

  it("detects a deleted entry", async () => {
    const victim = await mongoose.connection.collection("auditlogs").findOne({ seq: 7 });
    await mongoose.connection.collection("auditlogs").deleteOne({ seq: 7 });
    expect(await verifyAuditChain()).toMatchObject({ ok: false, brokenAtSeq: 8, problem: "gap" });
    await mongoose.connection.collection("auditlogs").insertOne(victim!);
  });
});

describe("withAudit", () => {
  it("logs success and errors, rethrowing failures", async () => {
    await withAudit(actor, { action: "EXPORT", resourceType: "AuditLog", reason: "compliance review" }, async () => "ok");
    await expect(
      withAudit(actor, { action: "VIEW", resourceType: "Claim", resourceId: "c1" }, async () => {
        throw new TypeError("boom");
      }),
    ).rejects.toThrow("boom");

    const last = await AuditLog.find({}).sort({ seq: -1 }).limit(2).setOptions({ authz: SYS }).lean();
    expect(last.map((e) => [e.action, e.outcome])).toEqual([
      ["VIEW", "ERROR"],
      ["EXPORT", "SUCCESS"],
    ]);
    expect((await verifyAuditChain()).ok).toBe(true);
  });
});

describe("changedFields", () => {
  it("returns field names only", () => {
    expect(changedFields({ phone: "+12125550148", email: "a@x.com", updatedAt: 1 }, { phone: "+12125550199", email: "a@x.com", updatedAt: 2 })).toEqual(["phone"]);
    expect(changedFields(null, { firstName: "Elena" })).toEqual(["firstName"]);
  });
});

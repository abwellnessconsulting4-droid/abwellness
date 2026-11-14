import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { beforeAll, describe, expect, it } from "vitest";
import { AuditedDenial } from "@/lib/audit";
import { authorize, authzToken, isAllowed, scopeFilter, type AuthContext } from "@/lib/authz";
import { createScoped, systemToken } from "@/lib/db/phi-guard";
import type { Role } from "@/lib/rbac";
import { AuditLog, ClinicalNote, nextMrn, Patient } from "@/models";
import { setupTestDatabase } from "./helpers";

setupTestDatabase("authz");

const SYS = systemToken("test");
const providerA = new Types.ObjectId(); // Dr. Thorne
const providerB = new Types.ObjectId();
let elena: { _id: Types.ObjectId };
let david: { _id: Types.ObjectId };
const notes: Record<string, { _id: Types.ObjectId; patientId: Types.ObjectId; providerId: Types.ObjectId; noteType: string; status: string }> = {};

function ctx(role: Role, extra: Partial<AuthContext> = {}): AuthContext {
  const userId = new Types.ObjectId().toString();
  return { userId, actorId: userId, role, actorRole: role, mfaVerified: true, ...extra };
}

function signature() {
  const now = new Date();
  return {
    signerId: providerA,
    signerName: "Dr. Aris Thorne, PsyD",
    signerRole: "PROVIDER",
    method: "TYPED",
    contentHash: createHash("sha256").update("x").digest("hex"),
    signatureHash: createHash("sha256").update("y").digest("hex"),
    ipAddress: "127.0.0.1",
    signedAt: now,
  };
}

beforeAll(async () => {
  elena = await createScoped(Patient, SYS, { mrn: await nextMrn(), firstName: "Elena", lastName: "Vance", dob: new Date("1989-04-18"), assignedProviderId: providerA });
  david = await createScoped(Patient, SYS, { mrn: await nextMrn(), firstName: "David", lastName: "Morales", dob: new Date("1978-11-02"), assignedProviderId: providerB });

  const make = async (key: string, patientId: Types.ObjectId, providerId: Types.ObjectId, noteType: string, signed: boolean) => {
    const note = await createScoped(ClinicalNote, SYS, {
      patientId,
      providerId,
      noteType,
      status: signed ? "SIGNED_LOCKED" : "DRAFT",
      signature: signed ? signature() : undefined,
    });
    notes[key] = { _id: note._id, patientId, providerId, noteType, status: note.status };
  };
  await make("elenaSoap", elena._id, providerA, "SOAP", true);
  await make("elenaDraft", elena._id, providerA, "PROGRESS", false);
  await make("elenaPsych", elena._id, providerA, "PSYCHOTHERAPY", true);
  await make("davidSoap", david._id, providerB, "SOAP", true);
});

const target = (key: string) => ({
  resourceId: String(notes[key]._id),
  patientId: notes[key].patientId,
  providerId: notes[key].providerId,
  noteType: notes[key].noteType,
  noteStatus: notes[key].status,
});

describe("single-record decisions", () => {
  it("providers see assigned patients only", async () => {
    const thorne = ctx("PROVIDER", { staffProfileId: String(providerA) });
    expect(await isAllowed(thorne, "clinicalNote", "read", target("elenaSoap"))).toBe(true);
    expect(await isAllowed(thorne, "clinicalNote", "read", target("davidSoap"))).toBe(false);
  });

  it("Use Case 6: billing staff opening a SOAP note gets 403 and an audited attempt", async () => {
    const marcus = ctx("BILLING_STAFF");
    await expect(authorize(marcus, "clinicalNote", "read", target("elenaSoap"))).rejects.toBeInstanceOf(AuditedDenial);

    const entry = await AuditLog.findOne({ actorId: marcus.userId }).setOptions({ authz: SYS }).lean();
    expect(entry).toMatchObject({
      action: "UNAUTHORIZED_ACCESS_ATTEMPT",
      outcome: "DENIED",
      actorRole: "BILLING_STAFF",
      patientId: String(elena._id),
      resourceId: String(notes.elenaSoap._id),
    });
  });

  it("psychotherapy notes: author only, unless an unexpired grant exists", async () => {
    const author = ctx("PROVIDER", { staffProfileId: String(providerA) });
    const colleague = ctx("PROVIDER", { staffProfileId: String(providerB) });
    const admin = ctx("SUPER_ADMIN");
    const psych = target("elenaPsych");

    expect(await isAllowed(author, "psychotherapyNote", "read", psych)).toBe(true);
    expect(await isAllowed(author, "clinicalNote", "read", psych)).toBe(false); // must use the stricter resource
    expect(await isAllowed(colleague, "psychotherapyNote", "read", psych)).toBe(false);
    expect(await isAllowed(admin, "psychotherapyNote", "read", psych)).toBe(false);

    const future = new Date(Date.now() + 3_600_000);
    const past = new Date(Date.now() - 1000);
    expect(await isAllowed(admin, "psychotherapyNote", "read", { ...psych, accessGrants: [{ userId: admin.userId, expiresAt: future }] })).toBe(true);
    expect(await isAllowed(admin, "psychotherapyNote", "read", { ...psych, accessGrants: [{ userId: admin.userId, expiresAt: past }] })).toBe(false);
  });

  it("patients see their own signed notes only", async () => {
    const patient = ctx("PATIENT", { patientId: String(elena._id) });
    expect(await isAllowed(patient, "clinicalNote", "read", target("elenaSoap"))).toBe(true);
    expect(await isAllowed(patient, "clinicalNote", "read", target("elenaDraft"))).toBe(false);
    expect(await isAllowed(patient, "clinicalNote", "read", target("davidSoap"))).toBe(false);
    expect(await isAllowed(patient, "psychotherapyNote", "read", target("elenaPsych"))).toBe(false);
  });

  it("staff document access is limited by category", async () => {
    const billing = ctx("BILLING_STAFF");
    const frontDesk = ctx("FRONT_DESK");
    expect(await isAllowed(billing, "document", "read", { documentCategory: "INSURANCE_CARD_FRONT" })).toBe(true);
    expect(await isAllowed(billing, "document", "read", { documentCategory: "LAB_RESULT" })).toBe(false);
    expect(await isAllowed(frontDesk, "document", "read", { documentCategory: "GOVERNMENT_ID" })).toBe(true);
    expect(await isAllowed(frontDesk, "document", "read", { documentCategory: "EXTERNAL_RECORD" })).toBe(false);
  });
});

describe("list filters return only permitted records", () => {
  async function visibleNotes(c: AuthContext, resource: "clinicalNote" | "psychotherapyNote" = "clinicalNote") {
    const filter = await scopeFilter(c, resource);
    const rows = await ClinicalNote.find(filter, { _id: 1 }).setOptions({ authz: authzToken(c) }).lean();
    return rows.map((r) => String(r._id)).sort();
  }
  const ids = (...keys: string[]) => keys.map((k) => String(notes[k]._id)).sort();

  it("provider: assigned patients' notes, psychotherapy excluded", async () => {
    expect(await visibleNotes(ctx("PROVIDER", { staffProfileId: String(providerA) }))).toEqual(ids("elenaSoap", "elenaDraft"));
  });

  it("provider: own psychotherapy notes through the dedicated resource", async () => {
    expect(await visibleNotes(ctx("PROVIDER", { staffProfileId: String(providerA) }), "psychotherapyNote")).toEqual(ids("elenaPsych"));
    expect(await visibleNotes(ctx("PROVIDER", { staffProfileId: String(providerB) }), "psychotherapyNote")).toEqual([]);
  });

  it("patient: own signed notes only", async () => {
    expect(await visibleNotes(ctx("PATIENT", { patientId: String(elena._id) }))).toEqual(ids("elenaSoap"));
  });

  it("billing and front desk: no clinical notes", async () => {
    expect(await visibleNotes(ctx("BILLING_STAFF"))).toEqual([]);
    expect(await visibleNotes(ctx("FRONT_DESK"))).toEqual([]);
  });
});

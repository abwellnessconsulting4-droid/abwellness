import { createHash } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { ENC, encrypt } from "@/lib/crypto";
import { authorizeDoc, createScoped, systemToken, UnscopedQueryError } from "@/lib/db/phi-guard";
import {
  AppointmentSlot,
  AuditLog,
  Claim,
  ClinicalNote,
  ConsentTemplate,
  Invoice,
  nextMrn,
  Patient,
  PaymentPlan,
  SignedConsent,
  slotStartsFor,
  splitInstallments,
} from "@/models";
import { setupTestDatabase } from "./helpers";

setupTestDatabase("models");

const SYS = systemToken("test");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function signature(signerName = "Dr. Test") {
  const signedAt = new Date();
  const contentHash = sha("content");
  return {
    signerId: new Types.ObjectId(),
    signerName,
    signerRole: "PROVIDER",
    method: "TYPED",
    contentHash,
    signatureHash: sha(`${contentHash}|signer|127.0.0.1|${signedAt.toISOString()}`),
    ipAddress: "127.0.0.1",
    signedAt,
  };
}

async function makePatient(overrides: Record<string, unknown> = {}) {
  return createScoped(Patient, SYS, {
    mrn: await nextMrn(2026),
    firstName: "Elena",
    lastName: "Vance",
    dob: new Date("1989-04-18"),
    ...overrides,
  });
}

describe("indexes", () => {
  it("builds every collection and index on a real MongoDB", async () => {
    const counts = await Promise.all(Object.values(mongoose.models).map(async (m) => (await m.listIndexes()).length));
    expect(Object.keys(mongoose.models).length).toBeGreaterThanOrEqual(28);
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(80);
  });
});

describe("PHI guard", () => {
  it("refuses queries without an authorization token", async () => {
    await expect(Patient.find({}).exec()).rejects.toBeInstanceOf(UnscopedQueryError);
    await expect(ClinicalNote.countDocuments({}).exec()).rejects.toBeInstanceOf(UnscopedQueryError);
    await expect(Patient.aggregate([{ $match: {} }]).exec()).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it("refuses saves without a token", async () => {
    const doc = new Patient({ mrn: "ABW-X", firstName: "A", lastName: "B", dob: new Date() });
    await expect(doc.save()).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it("allows scoped queries", async () => {
    const patient = await makePatient();
    const found = await Patient.findById(patient._id).setOptions({ authz: SYS }).lean();
    expect(found?.lastNameLower).toBe("vance");
  });
});

describe("encrypted fields", () => {
  it("reject plaintext and keep ciphertext out of default reads", async () => {
    await expect(makePatient({ ssnEnc: "123-45-6789" })).rejects.toThrow(/must be encrypted/);

    const patient = await makePatient({ ssnEnc: encrypt("123-45-6789", ENC.patientSsn), ssnLast4: "6789" });
    const plain = await Patient.findById(patient._id).setOptions({ authz: SYS }).lean();
    expect(plain).not.toHaveProperty("ssnEnc");
    const withSecret = await Patient.findById(patient._id).select("+ssnEnc").setOptions({ authz: SYS }).lean();
    expect(withSecret?.ssnEnc?.startsWith("enc:v1:")).toBe(true);
  });
});

describe("MRNs", () => {
  it("are sequential per year and unique", async () => {
    const a = await nextMrn(2030);
    const b = await nextMrn(2030);
    expect(a).toBe("ABW-2030-0001");
    expect(b).toBe("ABW-2030-0002");
  });
});

describe("clinical notes", () => {
  async function signedNote() {
    const patient = await makePatient();
    const note = await createScoped(ClinicalNote, SYS, {
      patientId: patient._id,
      providerId: new Types.ObjectId(),
      noteType: "SOAP",
      subjectiveEnc: encrypt("Work-related stress.", ENC.noteSection("subjective")),
      diagnosisCodes: ["F41.1", "Z73.0"],
      serviceLines: [{ cptCode: "90791", units: 1 }],
      status: "SIGNED_LOCKED",
      signature: signature(),
    });
    return ClinicalNote.findById(note._id).setOptions({ authz: SYS }).orFail();
  }

  it("lock after signing: content edits are refused", async () => {
    const note = authorizeDoc(await signedNote(), SYS);
    note.subjectiveEnc = encrypt("Edited after signing", ENC.noteSection("subjective"));
    await expect(note.save()).rejects.toThrow(/signed and locked/);
  });

  it("allow addenda on a locked note", async () => {
    const note = authorizeDoc(await signedNote(), SYS);
    note.addenda.push({
      authorId: note.providerId,
      textEnc: encrypt("Addendum: patient called to clarify sleep hours.", ENC.noteAddendum),
      signature: signature(),
    });
    await expect(note.save()).resolves.toBeTruthy();
  });

  it("refuse query-level updates that would bypass the lock", async () => {
    const note = await signedNote();
    await expect(
      ClinicalNote.updateOne({ _id: note._id }, { $set: { diagnosisCodes: [] } }).setOptions({ authz: SYS }).exec(),
    ).rejects.toThrow(/loaded document/);
  });

  it("require a signature to be marked signed", async () => {
    const patient = await makePatient();
    await expect(
      createScoped(ClinicalNote, SYS, { patientId: patient._id, providerId: new Types.ObjectId(), noteType: "SOAP", status: "SIGNED_LOCKED" }),
    ).rejects.toThrow(/requires a signature/);
  });
});

describe("consents", () => {
  it("published templates are immutable", async () => {
    const template = await ConsentTemplate.create({
      type: "TELEHEALTH_CONSENT",
      version: "v1.4-2026",
      title: "Telehealth Informed Consent",
      bodyMarkdown: "I consent to receive services by video.",
      contentHash: sha("I consent to receive services by video."),
      status: "PUBLISHED",
    });
    const loaded = await ConsentTemplate.findById(template._id).orFail();
    loaded.bodyMarkdown = "Changed";
    await expect(loaded.save()).rejects.toThrow(/immutable/);
  });

  it("signed consents can be revoked but never edited", async () => {
    const patient = await makePatient();
    const signed = await createScoped(SignedConsent, SYS, {
      patientId: patient._id,
      templateId: new Types.ObjectId(),
      consentType: "HIPAA_PRIVACY_NOTICE",
      version: "v2.1-2026",
      signature: { ...signature("Elena Vance"), signerRole: "PATIENT" },
    });
    const loaded = authorizeDoc(await SignedConsent.findById(signed._id).setOptions({ authz: SYS }).orFail(), SYS);
    loaded.version = "v9";
    await expect(loaded.save()).rejects.toThrow(/immutable/);

    const again = authorizeDoc(await SignedConsent.findById(signed._id).setOptions({ authz: SYS }).orFail(), SYS);
    again.revokedAt = new Date();
    again.revocationReason = "Patient request";
    await expect(again.save()).resolves.toBeTruthy();
  });

  it("a release of information needs recipient, scope, and expiry", async () => {
    const patient = await makePatient();
    await expect(
      createScoped(SignedConsent, SYS, {
        patientId: patient._id,
        templateId: new Types.ObjectId(),
        consentType: "RELEASE_OF_INFORMATION",
        version: "v1",
        signature: signature("Elena Vance"),
      }),
    ).rejects.toThrow(/recipient, scope, and expiration/);
  });
});

describe("claims", () => {
  async function draftClaim() {
    const patient = await makePatient();
    return createScoped(Claim, SYS, {
      claimNumber: `CLM-T-${new Types.ObjectId()}`,
      patientId: patient._id,
      providerId: new Types.ObjectId(),
      payerName: "BlueCross BlueShield of NY",
      lines: [{ serviceDate: new Date(), cptCode: "90791", modifiers: ["95"], units: 1, icdPointers: ["F41.1", "Z73.0"], chargeCents: 21000 }],
    });
  }

  it("computes the billed total from its lines", async () => {
    const claim = await draftClaim();
    expect(claim.totalBilledCents).toBe(21000);
    expect(claim.statusHistory.map((h) => h.status)).toEqual(["DRAFT"]);
  });

  it("follows the claim lifecycle and refuses illegal jumps", async () => {
    const claim = await draftClaim();
    const loaded = authorizeDoc(await Claim.findById(claim._id).setOptions({ authz: SYS }).orFail(), SYS);
    loaded.status = "PAID";
    await expect(loaded.save()).rejects.toThrow(/cannot move from DRAFT to PAID/);

    for (const status of ["READY_TO_SUBMIT", "SUBMITTED", "DENIED", "SUBMITTED", "PAID"] as const) {
      const step = authorizeDoc(await Claim.findById(claim._id).setOptions({ authz: SYS }).orFail(), SYS);
      step.status = status;
      await step.save();
    }
    const final = await Claim.findById(claim._id).setOptions({ authz: SYS }).lean();
    expect(final?.statusHistory.map((h) => h.status)).toEqual(["DRAFT", "READY_TO_SUBMIT", "SUBMITTED", "DENIED", "SUBMITTED", "PAID"]);
  });
});

describe("invoices and payment plans", () => {
  it("derive amount due and status from line items and payments", async () => {
    const patient = await makePatient();
    const invoice = await createScoped(Invoice, SYS, {
      invoiceNumber: `INV-T-${new Types.ObjectId()}`,
      patientId: patient._id,
      kind: "CLAIM_PATIENT_RESPONSIBILITY",
      lineItems: [
        { description: "Copay", amountCents: 3000 },
        { description: "Deductible", amountCents: 2000 },
      ],
      status: "UNPAID",
    });
    expect(invoice.amountDueCents).toBe(5000);

    const loaded = authorizeDoc(await Invoice.findById(invoice._id).setOptions({ authz: SYS }).orFail(), SYS);
    loaded.amountPaidCents = 5000;
    await loaded.save();
    expect(loaded.status).toBe("PAID");
    expect(loaded.paidAt).toBeInstanceOf(Date);
  });

  it("split $240 into three $80 installments and require the schedule to add up", async () => {
    expect(splitInstallments(24000, 3)).toEqual([8000, 8000, 8000]);
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);

    const patient = await makePatient();
    await expect(
      createScoped(PaymentPlan, SYS, {
        patientId: patient._id,
        invoiceIds: [new Types.ObjectId()],
        totalCents: 24000,
        installmentCount: 3,
        schedule: [
          { dueDate: new Date(), amountCents: 8000 },
          { dueDate: new Date(), amountCents: 8000 },
        ],
      }),
    ).rejects.toThrow(/add up to the plan total/);
  });
});

describe("scheduling", () => {
  it("blocks double-booking a provider's slot", async () => {
    const providerId = new Types.ObjectId();
    const start = new Date("2026-11-20T15:00:00Z");
    const slots = slotStartsFor(start, new Date("2026-11-20T15:50:00Z"));
    expect(slots).toHaveLength(4);

    await AppointmentSlot.create(slots.map((slotStart) => ({ providerId, slotStart, appointmentId: new Types.ObjectId() })));
    await expect(
      AppointmentSlot.create({ providerId, slotStart: slots[2], appointmentId: new Types.ObjectId() }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});

describe("audit log", () => {
  it("is append-only", async () => {
    await expect(AuditLog.updateMany({}, { $set: { action: "VIEW" } }).setOptions({ authz: SYS }).exec()).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteMany({}).setOptions({ authz: SYS }).exec()).rejects.toThrow(/append-only/);
  });
});

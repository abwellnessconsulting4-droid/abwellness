import mongoose from "mongoose";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyAuditChain } from "@/lib/audit";
import { blindIndex, decrypt, ENC } from "@/lib/crypto";
import { systemToken } from "@/lib/db/phi-guard";
import { noteSigningContent, verifySignature } from "@/lib/signatures";
import {
  Appointment,
  AppointmentSlot,
  AuditLog,
  Claim,
  ClinicalNote,
  ConsentTemplate,
  InsurancePolicy,
  Invoice,
  Patient,
  ProviderSchedule,
  RemittanceAdvice,
  SignedConsent,
  WaitlistEntry,
} from "@/models";
import { setupTestDatabase } from "./helpers";

const db = setupTestDatabase("seed");
const SYS = systemToken("test");
const q = { authz: SYS };
type SeedModule = typeof import("@/scripts/seed/emr");
let seed: SeedModule;
const PASSWORD = "seed-test-password-123";

beforeAll(async () => {
  process.env.MONGODB_URI = db.uri();
  process.env.BETTER_AUTH_SECRET = "test-secret-at-least-32-characters-long!!";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  seed = await import("@/scripts/seed/emr");
  await seed.seedEmr({ password: PASSWORD });
});

describe("seeded accounts", () => {
  it("creates staff and patient logins with the right roles, none enrolled in MFA yet", async () => {
    const users = await mongoose.connection.collection("user").find({}).toArray();
    expect(users.map((u) => [u.email, u.role]).sort()).toEqual(seed.SEED_USERS.map((u) => [u.email, u.role]).sort());
    expect(users.every((u) => u.emailVerified && !u.twoFactorEnabled)).toBe(true);
    expect(users.every((u) => String(u.email).endsWith("@example.com"))).toBe(true);
  });

  it("lets a seeded user sign in with the shared password", async () => {
    const { getAuth } = await import("@/lib/auth");
    const result = await getAuth().api.signInEmail({ body: { email: "aris.thorne@example.com", password: PASSWORD } });
    expect(result.token).toBeTruthy();
    expect(result.user).toMatchObject({ role: "PROVIDER" });
  });
});

describe("Use Case 1: onboarding, consents, intake", () => {
  it("stores Elena's SSN and member ID encrypted, with working exact-match lookup", async () => {
    const elena = await Patient.findById(seed.IDS.patients.elena).select("+ssnEnc +ssnHash").setOptions(q).orFail();
    expect(decrypt(elena.ssnEnc!, ENC.patientSsn)).toBe("900-12-3401");
    expect(elena.ssnLast4).toBe("3401");
    const found = await Patient.findOne({ ssnHash: blindIndex("900123401", ENC.patientSsn) }).setOptions(q);
    expect(String(found?._id)).toBe(String(seed.IDS.patients.elena));

    const policy = await InsurancePolicy.findOne({ patientId: seed.IDS.patients.elena }).select("+memberIdEnc").setOptions(q).orFail();
    expect(decrypt(policy.memberIdEnc, ENC.insuranceMemberId)).toBe("XYZ993847102");
  });

  it("has all four mandatory consents with verifiable signatures", async () => {
    const consents = await SignedConsent.find({ patientId: seed.IDS.patients.elena }).setOptions(q).lean();
    expect(consents.map((c) => c.consentType).sort()).toEqual(["CONSENT_FOR_TREATMENT", "FINANCIAL_RESPONSIBILITY", "HIPAA_PRIVACY_NOTICE", "TELEHEALTH_CONSENT"]);
    for (const consent of consents) {
      const template = await ConsentTemplate.findById(consent.templateId).orFail();
      expect(consent.signature.contentHash).toBe(template.contentHash);
      expect(verifySignature(template.bodyMarkdown, consent.signature)).toBe(true);
      expect(verifySignature(`${template.bodyMarkdown} (altered)`, consent.signature)).toBe(false);
    }
  });
});

describe("Use Case 2: visit, signed note, claim", () => {
  it("has a signed, locked SOAP note whose signature verifies against the decrypted content", async () => {
    const note = await ClinicalNote.findById(seed.IDS.notes.elenaSoap).select("+subjectiveEnc +objectiveEnc +assessmentEnc +planEnc").setOptions(q).orFail();
    expect(note.status).toBe("SIGNED_LOCKED");
    const content = noteSigningContent({
      id: String(note._id),
      subjective: decrypt(note.subjectiveEnc!, ENC.noteSection("subjective")),
      objective: decrypt(note.objectiveEnc!, ENC.noteSection("objective")),
      assessment: decrypt(note.assessmentEnc!, ENC.noteSection("assessment")),
      plan: decrypt(note.planEnc!, ENC.noteSection("plan")),
      diagnosisCodes: note.diagnosisCodes,
      serviceLines: note.serviceLines,
    });
    expect(verifySignature(content, note.signature!)).toBe(true);
  });

  it("schedules the follow-up on Thorne's virtual day with the slots reserved", async () => {
    const followUp = await Appointment.findById(seed.IDS.appointments.elenaFollowUp).setOptions(q).orFail();
    const schedule = await ProviderSchedule.findOne({ providerId: seed.IDS.staff.thorne }).orFail();
    expect(schedule.weeklyAvailability.find((d) => d.dayOfWeek === followUp.scheduledStart.getUTCDay())?.mode).toBe("VIRTUAL");
    expect(await AppointmentSlot.countDocuments({ appointmentId: followUp._id })).toBe(3);
  });
});

describe("Use Case 3: denial, resubmission, remittance", () => {
  it("Elena's claim balances: paid + contractual + patient = billed", async () => {
    const claim = await Claim.findById(seed.IDS.claims.elena).setOptions(q).orFail();
    expect(claim.status).toBe("PAID");
    expect(claim.resubmissionCount).toBe(1);
    expect(claim.insurancePaidCents + claim.contractualAdjustmentCents + claim.patientResponsibilityCents).toBe(claim.totalBilledCents);
    expect(claim.statusHistory.map((h) => h.status)).toEqual(["DRAFT", "READY_TO_SUBMIT", "SUBMITTED", "DENIED", "SUBMITTED", "PAID"]);
  });

  it("the paying ERA's adjustments add up to the billed amount", async () => {
    const era = await RemittanceAdvice.findOne({ eraReference: "ERA-835-992817" }).setOptions(q).orFail();
    const line = era.lines[0];
    const adjustments = line.adjustments.reduce((sum, a) => sum + a.amountCents, 0);
    expect(line.paidCents + adjustments).toBe(line.billedCents);
  });

  it("David's claim is waiting in the denial queue", async () => {
    const denied = await Claim.find({ status: "DENIED" }).setOptions(q).lean();
    expect(denied.map((c) => c.claimNumber)).toEqual(["CLM-2026-10042"]);
    expect(denied[0].denial?.carc).toBe("CO-16");
  });
});

describe("Use Case 4: balances to pay", () => {
  it("Elena owes $50 from the claim and $240 for the package", async () => {
    const invoices = await Invoice.find({ patientId: seed.IDS.patients.elena }).sort({ invoiceNumber: 1 }).setOptions(q).lean();
    expect(invoices.map((i) => [i.invoiceNumber, i.amountDueCents, i.status])).toEqual([
      ["INV-2026-5001", 5000, "UNPAID"],
      ["INV-2026-5003", 24000, "UNPAID"],
    ]);
    const claim = await Claim.findById(seed.IDS.claims.elena).setOptions(q).orFail();
    expect(invoices[0].amountDueCents).toBe(claim.patientResponsibilityCents);
  });
});

describe("Use Case 5: late cancellation and waitlist", () => {
  it("David's cancellation broke the 24-hour policy he signed, and the fee invoice is linked", async () => {
    const template = await ConsentTemplate.findOne({ type: "FINANCIAL_RESPONSIBILITY", status: "PUBLISHED" }).orFail();
    const cancelled = await Appointment.findById(seed.IDS.appointments.davidCancelled).setOptions(q).orFail();
    expect(cancelled.cancellation!.hoursNotice!).toBeLessThan(template.terms!.lateCancellationHours!);
    const fee = await Invoice.findById(cancelled.cancellation!.feeInvoiceId).setOptions(q).orFail();
    expect(fee.amountDueCents).toBe(template.terms!.lateCancellationFeeCents);
    expect(await SignedConsent.countDocuments({ patientId: seed.IDS.patients.david, consentType: "FINANCIAL_RESPONSIBILITY" }).setOptions(q)).toBe(1);
  });

  it("Sofia is waiting for exactly the kind of slot David freed", async () => {
    const cancelled = await Appointment.findById(seed.IDS.appointments.davidCancelled).setOptions(q).orFail();
    const entry = await WaitlistEntry.findOne({ patientId: seed.IDS.patients.sofia }).setOptions(q).orFail();
    expect(entry.status).toBe("WAITING");
    expect(String(entry.providerId)).toBe(String(cancelled.providerId));
    expect(entry.modes).toContain(cancelled.mode);
    expect(entry.preferredDays).toContain(cancelled.scheduledStart.getUTCDay());
  });
});

describe("integrity", () => {
  it("leaves a valid audit chain with a seed entry", async () => {
    expect((await verifyAuditChain()).ok).toBe(true);
    expect(await AuditLog.countDocuments({ resourceType: "SeedData" }).setOptions(q)).toBe(1);
  });

  it("refuses to seed twice, and reset removes data and accounts", async () => {
    expect(await seed.isSeeded()).toBe(true);
    await seed.resetEmrData();
    expect(await seed.isSeeded()).toBe(false);
    expect(await mongoose.connection.collection("user").countDocuments({})).toBe(0);
  });
});

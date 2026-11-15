import { beforeAll, describe, expect, it } from "vitest";
import { AuditedDenial } from "@/lib/audit";
import { systemToken } from "@/lib/db/phi-guard";
import { createNote, signNote } from "@/lib/services/notes";
import { getClaim, listClaims, listInvoices, markReady, postRemittance, RcmError, submitClaim, updateLines } from "@/lib/services/rcm";
import { IDS } from "@/scripts/seed/emr";
import { AuditLog, Claim, InsurancePolicy, Invoice, RemittanceAdvice } from "@/models";
import { EMAIL, setupSeededDatabase } from "./seeded";

const { as } = setupSeededDatabase("billing-rcm");
const SYS = { authz: systemToken("test") };
const elena = String(IDS.patients.elena);
const evidence = { ipAddress: "127.0.0.1", userAgent: "vitest" };
let claimId = "";
let lineId = "";

beforeAll(async () => {
  // Use Case 2 hands off a draft claim: Dr. Thorne signs Elena's video-visit note.
  const thorne = await as(EMAIL.thorne);
  const noteId = await createNote(thorne, elena, {
    noteType: "SOAP",
    appointmentId: String(IDS.appointments.elenaFollowUp),
    sections: { subjective: "Sleep improved.", assessment: "GAD improving.", plan: "Continue CBT." },
    diagnosisCodes: ["F41.1"],
    serviceLines: [{ cptCode: "90834", modifiers: [], units: 1 }],
  });
  claimId = (await signNote(thorne, noteId, evidence)).claimId!;
  const claim = await Claim.findById(claimId).setOptions(SYS).lean();
  lineId = String(claim!.lines[0]._id);
});

describe("claim queues", () => {
  it("shows the new draft claim in billing's review queue, with counts per queue", async () => {
    const { counts, claims } = await listClaims(await as(EMAIL.billing), "review");
    expect(claims.map((c) => c.id)).toContain(claimId);
    expect(counts.denials).toBe(1); // David's seeded CO-16 denial
    expect(counts.paid).toBe(1); // Elena's seeded 11/11 claim
  });

  it("is read-only for front desk", async () => {
    await expect(listClaims(await as(EMAIL.frontDesk))).rejects.toBeInstanceOf(AuditedDenial);
    await expect(markReady(await as(EMAIL.thorne), claimId)).rejects.toBeInstanceOf(AuditedDenial); // providers read their clients' claims only
  });
});

describe("Use Case 3: submission, CO-4 denial, correction, and payment", () => {
  it("won't submit before review, and the scrubber catches a missing telehealth modifier", async () => {
    const marcus = await as(EMAIL.billing);
    await expect(submitClaim(marcus, claimId)).rejects.toBeInstanceOf(RcmError);
    await updateLines(marcus, claimId, [{ lineId, modifiers: [], icdPointers: ["F41.1"] }]);
    await expect(markReady(marcus, claimId)).rejects.toThrow(/telehealth modifier/);
    await updateLines(marcus, claimId, [{ lineId, modifiers: ["95"], icdPointers: ["F41.1"] }]);
    await expect(updateLines(marcus, claimId, [{ lineId, modifiers: ["95"], icdPointers: ["Q99.99X"] }])).rejects.toThrow(/Unknown diagnosis/);
  });

  it("Marcus submits; the payer denies with CO-4", async () => {
    const marcus = await as(EMAIL.billing);
    await markReady(marcus, claimId);
    const submitted = await submitClaim(marcus, claimId);
    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.reference).toMatch(/^SIM-CLM-/);

    await postRemittance(marcus, claimId, { outcome: "DENIED", carc: "CO-4", description: "Procedure code inconsistent with the modifier used." });
    const denied = await getClaim(marcus, claimId);
    expect(denied.status).toBe("DENIED");
    expect(denied.denial?.carc).toBe("CO-4");
    expect((await listClaims(marcus, "denials")).claims.map((c) => c.id)).toContain(claimId);
  });

  it("resubmission needs a correction note; modifier 95 → GT goes out as resubmission 1", async () => {
    const marcus = await as(EMAIL.billing);
    await expect(submitClaim(marcus, claimId, { note: "" })).rejects.toThrow(/correction/);
    const r = await submitClaim(marcus, claimId, { note: "Payer requires GT for telehealth on this plan; changed modifier 95 to GT.", lines: [{ lineId, modifiers: ["GT"], icdPointers: ["F41.1"] }] });
    expect(r.status).toBe("SUBMITTED");
    const claim = await Claim.findById(claimId).setOptions(SYS).lean();
    expect(claim).toMatchObject({ status: "SUBMITTED", resubmissionCount: 1 });
    expect(claim?.lines[0].modifiers).toEqual(["GT"]);
    expect(claim?.appealNotes).toHaveLength(1);
    expect(claim?.statusHistory.map((h) => h.status)).toEqual(["DRAFT", "READY_TO_SUBMIT", "SUBMITTED", "DENIED", "SUBMITTED"]);
  });

  it("an unbalanced ERA is refused", async () => {
    const marcus = await as(EMAIL.billing);
    await expect(
      postRemittance(marcus, claimId, { outcome: "PAID", lines: [{ lineId, paidCents: 14500, contractualCents: 3500, copayCents: 3000, deductibleCents: 2000, coinsuranceCents: 0 }] }),
    ).rejects.toThrow(/doesn't balance/);
  });

  it("the ERA pays the claim and Elena gets an itemized $50 invoice on her portal", async () => {
    const marcus = await as(EMAIL.billing);
    const before = await InsurancePolicy.findOne({ patientId: elena, priority: "PRIMARY" }).setOptions(SYS).lean();
    // Billed $155: $35 contractual, $30 copay + $20 deductible to the client, $70 paid.
    const r = await postRemittance(marcus, claimId, {
      outcome: "PAID",
      eraReference: "ERA-835-UC3",
      lines: [{ lineId, paidCents: 7000, contractualCents: 3500, copayCents: 3000, deductibleCents: 2000, coinsuranceCents: 0 }],
    });
    expect(r).toMatchObject({ status: "PAID", patientCents: 5000 });

    const claim = await Claim.findById(claimId).setOptions(SYS).lean();
    expect(claim).toMatchObject({ status: "PAID", insurancePaidCents: 7000, contractualAdjustmentCents: 3500, patientResponsibilityCents: 5000, eraReference: "ERA-835-UC3" });
    expect(claim?.lines[0]).toMatchObject({ allowedCents: 12000, paidCents: 7000 });

    const invoice = await Invoice.findById(r.invoiceId).setOptions(SYS).lean();
    expect(invoice).toMatchObject({ kind: "CLAIM_PATIENT_RESPONSIBILITY", amountDueCents: 5000, status: "UNPAID", publishedToPortal: true, breakdown: { copayCents: 3000, deductibleCents: 2000 } });
    expect(invoice?.lineItems.map((l) => l.description)).toEqual(["Copay: 11/25/2026 visit", "Deductible: 11/25/2026 visit"]);

    const era = await RemittanceAdvice.findOne({ eraReference: "ERA-835-UC3" }).setOptions(SYS).lean();
    expect(era?.lines[0].adjustments.map((a) => `${a.groupCode}-${a.reasonCode}:${a.amountCents}`)).toEqual(["CO-45:3500", "PR-3:3000", "PR-1:2000"]);

    const after = await InsurancePolicy.findById(before!._id).setOptions(SYS).lean();
    expect(after!.deductibleMetCents).toBe(before!.deductibleMetCents! + 2000);

    await expect(postRemittance(marcus, claimId, { outcome: "PAID", lines: [] })).rejects.toBeInstanceOf(RcmError); // already paid
    expect(await AuditLog.countDocuments({ resourceType: "Invoice", resourceId: r.invoiceId, action: "CREATE" }).setOptions(SYS)).toBe(1);
  });

  it("the new balance shows up in A/R", async () => {
    const { invoices, aging, totalOpenCents } = await listInvoices(await as(EMAIL.billing));
    expect(invoices.some((i) => i.claimId === claimId && i.balanceCents === 5000)).toBe(true);
    expect(aging.reduce((n, b) => n + b.cents, 0)).toBe(totalOpenCents);
  });
});

describe("seeded denial (David, CO-16)", () => {
  it("can be corrected with the missing diagnosis and resubmitted", async () => {
    const marcus = await as(EMAIL.billing);
    const david = String(IDS.claims.david);
    const line = (await getClaim(marcus, david)).lines[0];
    expect(formatInTz(line.serviceDate)).toBe("11/06/2026");
    const r = await submitClaim(marcus, david, { note: "Added the secondary diagnosis the payer asked for (M76).", lines: [{ lineId: line.id, modifiers: [], icdPointers: ["F32.1", "Z73.0"] }] });
    expect(r.status).toBe("SUBMITTED");
  });
});

function formatInTz(d: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "numeric" }).format(d);
}

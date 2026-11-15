import "server-only";

import { recordAudit } from "@/lib/audit";
import type { AuthContext } from "@/lib/authz";
import { createScoped, systemToken } from "@/lib/db/phi-guard";
import { Appointment, Claim, ClinicalNote, InsurancePolicy, Invoice, MedicalCode, nextClaimNumber, nextInvoiceNumber } from "@/models";

/**
 * Revenue cycle. This file grows through Phase 3; it starts with claim
 * generation from signed notes (Use Case 2).
 */

// Claim generation runs as part of signing, on the provider's behalf; billing
// staff then review it. The note's author was already authorized to sign.
const BILLING_SYSTEM = systemToken("claim-generation");
export const TELEHEALTH_MODIFIERS = ["95", "GT", "FQ", "93"];

/** Build a DRAFT claim from a signed note. Returns null when there's no active insurance (self-pay). */
export async function createClaimFromNote(ctx: AuthContext, noteId: string) {
  const note = await ClinicalNote.findById(noteId).setOptions({ authz: BILLING_SYSTEM }).lean();
  if (!note || note.status !== "SIGNED_LOCKED" || note.serviceLines.length === 0) return null;

  const existing = await Claim.findOne({ clinicalNoteId: note._id, originalClaimId: null }, { _id: 1 }).setOptions({ authz: BILLING_SYSTEM }).lean();
  if (existing) return String(existing._id);

  const policy = await InsurancePolicy.findOne({ patientId: note.patientId, active: true, priority: "PRIMARY" }).setOptions({ authz: BILLING_SYSTEM }).lean();
  if (!policy) return null;

  const appointment = note.appointmentId
    ? await Appointment.findById(note.appointmentId, { mode: 1, scheduledStart: 1 }).setOptions({ authz: BILLING_SYSTEM }).lean()
    : null;
  const virtual = appointment?.mode === "VIRTUAL";
  const fees = new Map(
    (await MedicalCode.find({ code: { $in: note.serviceLines.map((l) => l.cptCode) }, system: { $in: ["CPT", "HCPCS"] } }, { code: 1, defaultFeeCents: 1 }).lean()).map((c) => [c.code, c.defaultFeeCents ?? 0]),
  );
  const serviceDate = appointment?.scheduledStart ?? new Date(note.signature?.signedAt ?? Date.now());

  const claim = await createScoped(Claim, BILLING_SYSTEM, {
    claimNumber: await nextClaimNumber(),
    patientId: note.patientId,
    providerId: note.providerId,
    clinicalNoteId: note._id,
    appointmentId: note.appointmentId,
    insurancePolicyId: policy._id,
    payerName: policy.payerName,
    lines: note.serviceLines.map((line) => {
      const modifiers = [...(line.modifiers ?? [])];
      // Telehealth visits carry modifier 95 unless one was already chosen.
      if (virtual && !modifiers.some((m) => TELEHEALTH_MODIFIERS.includes(m))) modifiers.push("95");
      return {
        serviceDate,
        cptCode: line.cptCode,
        modifiers: modifiers.slice(0, 4),
        units: line.units ?? 1,
        icdPointers: note.diagnosisCodes.slice(0, 4),
        placeOfService: virtual ? "10" : "11",
        chargeCents: fees.get(line.cptCode) ?? 0,
      };
    }),
    status: "DRAFT",
    statusHistory: [{ status: "DRAFT", at: new Date(), by: ctx.userId, note: "Generated from signed note" }],
  });
  await recordAudit(ctx, { action: "CREATE", resourceType: "Claim", resourceId: String(claim._id), patientId: String(note.patientId), metadata: { source: "signed note", noteId } });
  return String(claim._id);
}

/** Late-cancellation / no-show fee invoice, published to the client portal. */
export async function createFeeInvoice(
  ctx: AuthContext,
  input: { patientId: string; appointmentId: string; kind: "LATE_CANCELLATION" | "NO_SHOW"; amountCents: number; description: string; policyVersion?: string },
  options: { session?: import("mongoose").ClientSession } = {},
) {
  const issuedAt = new Date();
  const invoice = await createScoped(
    Invoice,
    BILLING_SYSTEM,
    {
      invoiceNumber: await nextInvoiceNumber(),
      patientId: input.patientId,
      kind: input.kind,
      appointmentId: input.appointmentId,
      lineItems: [{ description: input.description, amountCents: input.amountCents }],
      breakdown: { feesCents: input.amountCents },
      status: "UNPAID",
      issuedAt,
      dueDate: new Date(issuedAt.getTime() + 14 * 86_400_000),
      publishedToPortal: true,
      notes: input.policyVersion ? `Per the signed Financial Responsibility Agreement (${input.policyVersion}).` : undefined,
    },
    options,
  );
  await recordAudit(ctx, { action: "CREATE", resourceType: "Invoice", resourceId: String(invoice._id), patientId: input.patientId, metadata: { kind: input.kind, amountCents: input.amountCents } });
  return invoice;
}

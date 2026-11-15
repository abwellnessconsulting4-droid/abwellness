import "server-only";

import mongoose, { Types } from "mongoose";
import { recordAudit } from "@/lib/audit";
import { authorize, authorizeAny, authzToken, withScope, type AuthContext } from "@/lib/authz";
import { authorizeDoc, createScoped, systemToken } from "@/lib/db/phi-guard";
import { clearinghouse } from "@/lib/clearinghouse";
import { TELEHEALTH_MODIFIERS } from "@/lib/services/billing";
import { DEFAULT_TZ } from "@/lib/services/scheduling";
import { Claim, ClinicalNote, InsurancePolicy, Invoice, MedicalCode, Patient, RemittanceAdvice, nextInvoiceNumber, type ClaimStatus } from "@/models";

/**
 * Revenue cycle after claim generation: review and scrub, submission through
 * the clearinghouse adapter, remittance posting (ERA/EOB), denial correction
 * and resubmission, patient-responsibility invoices, and A/R.
 */

const LOOKUP = systemToken("rcm-lookup");
export class RcmError extends Error {}

export const CLAIM_QUEUES = {
  review: { label: "To review", statuses: ["DRAFT", "READY_TO_SUBMIT"] },
  payer: { label: "Awaiting payer", statuses: ["SUBMITTED", "ACCEPTED"] },
  denials: { label: "Denials", statuses: ["DENIED", "REJECTED"] },
  paid: { label: "Paid", statuses: ["PAID", "PARTIAL"] },
  all: { label: "All", statuses: [] as string[] },
} as const satisfies Record<string, { label: string; statuses: readonly string[] }>;
export type ClaimQueue = keyof typeof CLAIM_QUEUES;

const lineTotal = (l: { chargeCents: number; units?: number | null }) => l.chargeCents * (l.units ?? 1);
const visitDate = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TZ, month: "2-digit", day: "2-digit", year: "numeric" }).format(d);

async function patientNames(ids: unknown[]) {
  const rows = await Patient.find({ _id: { $in: ids } }, { firstName: 1, lastName: 1, mrn: 1 }).setOptions({ authz: LOOKUP }).lean();
  return new Map(rows.map((p) => [String(p._id), { name: `${p.firstName} ${p.lastName}`, mrn: p.mrn }]));
}

// ── Queues ──────────────────────────────────────────────────────────────────

export async function listClaims(ctx: AuthContext, queue: ClaimQueue = "review") {
  await authorizeAny(ctx, "claim", "read");
  const statuses = CLAIM_QUEUES[queue]?.statuses ?? [];
  const scoped = await withScope(ctx, "claim", statuses.length ? { status: { $in: statuses } } : {});
  const [claims, counts] = await Promise.all([
    Claim.find(scoped, { claimNumber: 1, patientId: 1, payerName: 1, status: 1, totalBilledCents: 1, insurancePaidCents: 1, patientResponsibilityCents: 1, resubmissionCount: 1, "lines.serviceDate": 1, "denial.carc": 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .limit(200)
      .setOptions({ authz: authzToken(ctx) })
      .lean(),
    Claim.aggregate<{ _id: ClaimStatus; n: number }>([{ $match: await withScope(ctx, "claim", {}) }, { $group: { _id: "$status", n: { $sum: 1 } } }]).option({ authz: authzToken(ctx) }),
  ]);
  const byStatus = new Map(counts.map((c) => [c._id, c.n]));
  const queueCounts = Object.fromEntries(
    (Object.keys(CLAIM_QUEUES) as ClaimQueue[]).map((q) => [q, CLAIM_QUEUES[q].statuses.length ? CLAIM_QUEUES[q].statuses.reduce((n, s) => n + (byStatus.get(s as ClaimStatus) ?? 0), 0) : counts.reduce((n, c) => n + c.n, 0)]),
  ) as Record<ClaimQueue, number>;
  const names = await patientNames(claims.map((c) => c.patientId));
  await recordAudit(ctx, { action: "VIEW", resourceType: "ClaimQueue", metadata: { queue, results: claims.length } });
  return {
    counts: queueCounts,
    claims: claims.map((c) => ({
      id: String(c._id),
      claimNumber: c.claimNumber,
      patient: names.get(String(c.patientId))?.name ?? "Client",
      payerName: c.payerName,
      status: c.status as ClaimStatus,
      serviceDate: c.lines[0]?.serviceDate,
      billedCents: c.totalBilledCents ?? 0,
      paidCents: c.insurancePaidCents ?? 0,
      patientCents: c.patientResponsibilityCents ?? 0,
      denial: c.denial?.carc ?? undefined,
      resubmissions: c.resubmissionCount ?? 0,
      updatedAt: (c as { updatedAt?: Date }).updatedAt,
    })),
  };
}

// ── One claim ───────────────────────────────────────────────────────────────

async function loadClaim(ctx: AuthContext, claimId: string, action: "read" | "update") {
  if (!Types.ObjectId.isValid(claimId)) throw new RcmError("Claim not found.");
  const claim = await Claim.findById(claimId).setOptions({ authz: LOOKUP });
  if (!claim) throw new RcmError("Claim not found.");
  const patient = await Patient.findById(claim.patientId, { assignedProviderId: 1 }).setOptions({ authz: LOOKUP }).lean();
  await authorize(ctx, "claim", action, { resourceId: claimId, patientId: claim.patientId, assignedProviderId: patient?.assignedProviderId ?? null });
  return claim;
}

export async function getClaim(ctx: AuthContext, claimId: string) {
  const claim = await loadClaim(ctx, claimId, "read");
  const [patient, policy, remittances, invoices, note] = await Promise.all([
    Patient.findById(claim.patientId, { firstName: 1, lastName: 1, mrn: 1, dob: 1 }).setOptions({ authz: LOOKUP }).lean(),
    claim.insurancePolicyId
      ? InsurancePolicy.findById(claim.insurancePolicyId, { payerName: 1, planName: 1, memberIdLast4: 1, groupNumber: 1, copayCents: 1, deductibleTotalCents: 1, deductibleMetCents: 1, coinsurancePercent: 1, "eligibility.status": 1, active: 1 }).setOptions({ authz: LOOKUP }).lean()
      : null,
    RemittanceAdvice.find({ claimId: claim._id }).sort({ postedAt: 1 }).setOptions({ authz: LOOKUP }).lean(),
    Invoice.find({ claimId: claim._id }, { invoiceNumber: 1, status: 1, amountDueCents: 1, amountPaidCents: 1, publishedToPortal: 1, lineItems: 1 }).setOptions({ authz: LOOKUP }).lean(),
    claim.clinicalNoteId ? ClinicalNote.findById(claim.clinicalNoteId, { sessionMinutes: 1 }).setOptions({ authz: LOOKUP }).lean() : null,
  ]);
  await recordAudit(ctx, { action: "VIEW", resourceType: "Claim", resourceId: claimId, patientId: String(claim.patientId) });
  const c = claim.toObject();
  return {
    id: claimId,
    claimNumber: c.claimNumber,
    status: c.status as ClaimStatus,
    payerName: c.payerName,
    patient: patient ? { id: String(patient._id), name: `${patient.firstName} ${patient.lastName}`, mrn: patient.mrn, dob: patient.dob } : null,
    policy: policy
      ? {
          planName: policy.planName ?? undefined,
          memberIdLast4: policy.memberIdLast4,
          groupNumber: policy.groupNumber ?? undefined,
          copayCents: policy.copayCents ?? 0,
          deductibleTotalCents: policy.deductibleTotalCents ?? 0,
          deductibleMetCents: policy.deductibleMetCents ?? 0,
          coinsurancePercent: policy.coinsurancePercent ?? 0,
          eligibility: policy.eligibility?.status ?? "UNVERIFIED",
          active: policy.active,
        }
      : null,
    lines: c.lines.map((l) => ({
      id: String(l._id),
      serviceDate: l.serviceDate,
      cptCode: l.cptCode,
      modifiers: l.modifiers ?? [],
      units: l.units ?? 1,
      icdPointers: l.icdPointers ?? [],
      placeOfService: l.placeOfService ?? "",
      chargeCents: l.chargeCents,
      totalCents: lineTotal(l),
      allowedCents: l.allowedCents ?? undefined,
      paidCents: l.paidCents ?? undefined,
    })),
    totalBilledCents: c.totalBilledCents ?? 0,
    insurancePaidCents: c.insurancePaidCents ?? 0,
    contractualAdjustmentCents: c.contractualAdjustmentCents ?? 0,
    patientResponsibilityCents: c.patientResponsibilityCents ?? 0,
    history: (c.statusHistory ?? []).map((h) => ({ status: h.status, at: h.at, note: h.note ?? undefined })),
    denial: c.denial?.carc ? { carc: c.denial.carc, rarc: c.denial.rarc ?? [], description: c.denial.description ?? "", receivedAt: c.denial.receivedAt ?? undefined } : null,
    appealNotes: (c.appealNotes ?? []).map((n) => ({ text: n.text, at: n.at })),
    resubmissionCount: c.resubmissionCount ?? 0,
    clearinghouseReference: c.clearinghouseReference ?? undefined,
    eraReference: c.eraReference ?? undefined,
    sessionMinutes: note?.sessionMinutes ?? undefined,
    noteId: c.clinicalNoteId ? String(c.clinicalNoteId) : undefined,
    remittances: remittances.map((r) => ({
      id: String(r._id),
      eraReference: r.eraReference,
      kind: r.kind,
      paymentDate: r.paymentDate ?? undefined,
      checkOrEftNumber: r.checkOrEftNumber ?? undefined,
      totalPaidCents: r.totalPaidCents ?? 0,
      totalContractualCents: r.totalContractualCents ?? 0,
      patientResponsibility: { copayCents: r.patientResponsibility?.copayCents ?? 0, deductibleCents: r.patientResponsibility?.deductibleCents ?? 0, coinsuranceCents: r.patientResponsibility?.coinsuranceCents ?? 0 },
      denial: r.denial?.carc ? `${r.denial.carc}: ${r.denial.description ?? ""}` : undefined,
      postedAt: r.postedAt ?? undefined,
    })),
    invoices: invoices.map((i) => ({ id: String(i._id), invoiceNumber: i.invoiceNumber, status: i.status, amountDueCents: i.amountDueCents ?? 0, amountPaidCents: i.amountPaidCents ?? 0, publishedToPortal: i.publishedToPortal, lineItems: i.lineItems })),
  };
}
export type ClaimDetail = Awaited<ReturnType<typeof getClaim>>;

// ── Review, scrub, and submit ──────────────────────────────────────────────

const ICD = /^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/;
const MODIFIER = /^[A-Z0-9]{2}$/;

export interface LineEdit {
  lineId: string;
  modifiers: string[];
  icdPointers: string[];
}

async function applyLineEdits(claim: InstanceType<typeof Claim>, edits: LineEdit[]) {
  const changed: string[] = [];
  const icds = [...new Set(edits.flatMap((e) => e.icdPointers.map((c) => c.toUpperCase())))];
  const known = new Set((await MedicalCode.find({ system: "ICD10CM", code: { $in: icds } }, { code: 1 }).lean()).map((c) => c.code));
  for (const edit of edits) {
    const line = claim.lines.id(edit.lineId);
    if (!line) throw new RcmError("That service line isn't on this claim.");
    const modifiers = edit.modifiers.map((m) => m.trim().toUpperCase()).filter(Boolean);
    const pointers = edit.icdPointers.map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (modifiers.length > 4 || modifiers.some((m) => !MODIFIER.test(m))) throw new RcmError("Modifiers are two characters each, up to four per line.");
    if (pointers.length < 1 || pointers.length > 4) throw new RcmError("Each line needs one to four diagnosis codes.");
    const unknown = pointers.filter((c) => !ICD.test(c) || !known.has(c));
    if (unknown.length) throw new RcmError(`Unknown diagnosis code: ${unknown.join(", ")}.`);
    if (modifiers.join() !== (line.modifiers ?? []).join()) changed.push(`${line.cptCode} modifiers ${(line.modifiers ?? []).join(" ") || "none"} → ${modifiers.join(" ") || "none"}`);
    if (pointers.join() !== (line.icdPointers ?? []).join()) changed.push(`${line.cptCode} diagnoses → ${pointers.join(", ")}`);
    line.modifiers = modifiers;
    line.icdPointers = pointers;
  }
  return changed;
}

/** Claim scrubber: the checks a clearinghouse would reject on. */
export function scrubIssues(claim: { insurancePolicyId?: unknown; lines: { cptCode: string; chargeCents: number; icdPointers?: string[] | null; modifiers?: string[] | null; placeOfService?: string | null }[] }) {
  const issues: string[] = [];
  if (!claim.insurancePolicyId) issues.push("No insurance policy is attached.");
  for (const l of claim.lines) {
    if (!l.icdPointers?.length) issues.push(`${l.cptCode}: add at least one diagnosis code.`);
    if (!l.chargeCents) issues.push(`${l.cptCode}: the charge is $0.`);
    const telehealthPos = l.placeOfService === "02" || l.placeOfService === "10";
    if (telehealthPos && !(l.modifiers ?? []).some((m) => TELEHEALTH_MODIFIERS.includes(m))) issues.push(`${l.cptCode}: telehealth place of service needs a telehealth modifier (95, GT, FQ, or 93).`);
  }
  return issues;
}

async function save(ctx: AuthContext, claim: InstanceType<typeof Claim>, session?: mongoose.ClientSession) {
  await authorizeDoc(claim, authzToken(ctx)).save(session ? { session } : undefined);
}

function pushStatus(claim: InstanceType<typeof Claim>, ctx: AuthContext, status: ClaimStatus, note?: string) {
  claim.status = status;
  claim.statusHistory.push({ status, at: new Date(), by: new Types.ObjectId(ctx.userId), note });
}

export async function updateLines(ctx: AuthContext, claimId: string, edits: LineEdit[]) {
  const claim = await loadClaim(ctx, claimId, "update");
  if (!["DRAFT", "READY_TO_SUBMIT", "DENIED", "REJECTED"].includes(claim.status)) throw new RcmError("This claim can't be edited in its current status.");
  const changed = await applyLineEdits(claim, edits);
  if (!changed.length) return;
  await save(ctx, claim);
  await recordAudit(ctx, { action: "UPDATE", resourceType: "Claim", resourceId: claimId, patientId: String(claim.patientId), changedFields: ["lines"], metadata: { changes: changed } });
}

export async function markReady(ctx: AuthContext, claimId: string) {
  const claim = await loadClaim(ctx, claimId, "update");
  if (claim.status !== "DRAFT") throw new RcmError("Only draft claims can be marked ready.");
  const issues = scrubIssues(claim);
  if (issues.length) throw new RcmError(`Fix before submitting: ${issues.join(" ")}`);
  pushStatus(claim, ctx, "READY_TO_SUBMIT", "Reviewed; passed claim checks");
  await save(ctx, claim);
  await recordAudit(ctx, { action: "UPDATE", resourceType: "Claim", resourceId: claimId, patientId: String(claim.patientId), changedFields: ["status"], metadata: { to: "READY_TO_SUBMIT" } });
}

export async function returnToDraft(ctx: AuthContext, claimId: string) {
  const claim = await loadClaim(ctx, claimId, "update");
  if (claim.status !== "READY_TO_SUBMIT") throw new RcmError("Only claims marked ready can go back to draft.");
  pushStatus(claim, ctx, "DRAFT", "Returned to draft");
  await save(ctx, claim);
  await recordAudit(ctx, { action: "UPDATE", resourceType: "Claim", resourceId: claimId, patientId: String(claim.patientId), changedFields: ["status"], metadata: { to: "DRAFT" } });
}

/** Submit a ready claim, or correct and resubmit a denied/rejected one (Use Case 3). */
export async function submitClaim(ctx: AuthContext, claimId: string, correction?: { note: string; lines?: LineEdit[] }) {
  const claim = await loadClaim(ctx, claimId, "update");
  const resubmission = claim.status === "DENIED" || claim.status === "REJECTED";
  if (claim.status !== "READY_TO_SUBMIT" && !resubmission) throw new RcmError("Mark the claim ready before submitting it.");
  const changes: string[] = [];
  if (resubmission) {
    const note = correction?.note?.trim() ?? "";
    if (note.length < 5) throw new RcmError("Describe the correction before resubmitting (this goes on the appeal record).");
    if (correction?.lines?.length) changes.push(...(await applyLineEdits(claim, correction.lines)));
    claim.appealNotes.push({ text: note, by: new Types.ObjectId(ctx.userId), at: new Date() });
    claim.resubmissionCount = (claim.resubmissionCount ?? 0) + 1;
  }
  const issues = scrubIssues(claim);
  if (issues.length) throw new RcmError(`Fix before submitting: ${issues.join(" ")}`);

  const result = await clearinghouse().submit({ claimNumber: claim.claimNumber, resubmissionCount: claim.resubmissionCount ?? 0, frequencyCode: resubmission ? "7" : "1" });
  if (!result.accepted) {
    pushStatus(claim, ctx, "REJECTED", result.message ?? "Rejected by the clearinghouse");
  } else {
    pushStatus(claim, ctx, "SUBMITTED", resubmission ? `Resubmitted (corrected claim #${claim.resubmissionCount})${changes.length ? `: ${changes.join("; ")}` : ""}` : "Submitted to clearinghouse");
    claim.submittedAt = new Date();
  }
  claim.clearinghouseReference = result.reference;
  await save(ctx, claim);
  await recordAudit(ctx, {
    action: "UPDATE",
    resourceType: "Claim",
    resourceId: claimId,
    patientId: String(claim.patientId),
    changedFields: ["status", ...(changes.length ? ["lines"] : []), ...(resubmission ? ["appealNotes", "resubmissionCount"] : [])],
    metadata: { to: claim.status, resubmission, reference: result.reference, changes },
  });
  return { status: claim.status as ClaimStatus, reference: result.reference };
}

export async function addAppealNote(ctx: AuthContext, claimId: string, text: string) {
  const claim = await loadClaim(ctx, claimId, "update");
  if (text.trim().length < 5) throw new RcmError("The note is too short.");
  claim.appealNotes.push({ text: text.trim(), by: new Types.ObjectId(ctx.userId), at: new Date() });
  await save(ctx, claim);
  await recordAudit(ctx, { action: "UPDATE", resourceType: "Claim", resourceId: claimId, patientId: String(claim.patientId), changedFields: ["appealNotes"] });
}

// ── Remittance posting ─────────────────────────────────────────────────────

export interface RemitLine {
  lineId: string;
  paidCents: number;
  contractualCents: number;
  copayCents: number;
  deductibleCents: number;
  coinsuranceCents: number;
}

export type RemittanceInput = {
  eraReference?: string;
  checkOrEftNumber?: string;
  paymentDate?: Date;
} & ({ outcome: "PAID"; lines: RemitLine[] } | { outcome: "DENIED"; carc: string; rarc?: string[]; description: string });

const CARC = /^(CO|PR|OA|PI)-[A-Z0-9]{1,4}$/;

/**
 * Post a payer's response (835 ERA or paper EOB). A payment must balance per
 * line (billed = paid + contractual + patient responsibility); patient
 * responsibility becomes an itemized invoice on the client's portal and the
 * deductible applied updates the policy, all in one transaction.
 */
export async function postRemittance(ctx: AuthContext, claimId: string, input: RemittanceInput) {
  await authorizeAny(ctx, "remittance", "create");
  const claim = await loadClaim(ctx, claimId, "update");
  if (!["SUBMITTED", "ACCEPTED"].includes(claim.status)) throw new RcmError("Remittances can only be posted to a submitted claim.");
  const eraReference = input.eraReference?.trim() || `ERA-SIM-${Date.now().toString(36).toUpperCase()}`;
  if (await RemittanceAdvice.exists({ eraReference, claimId: claim._id }).setOptions({ authz: LOOKUP })) throw new RcmError("That remittance was already posted to this claim.");
  const now = new Date();
  const base = { eraReference, kind: "ERA" as const, claimId: claim._id, patientId: claim.patientId, payerName: claim.payerName, checkOrEftNumber: input.checkOrEftNumber || undefined, paymentDate: input.paymentDate ?? now, postedBy: ctx.userId, postedAt: now };

  if (input.outcome === "DENIED") {
    const carc = input.carc.trim().toUpperCase();
    if (!CARC.test(carc)) throw new RcmError("Enter the denial reason as group-code, e.g. CO-4.");
    const [group, reason] = carc.split("-");
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        claim.denial = { carc, rarc: input.rarc ?? [], description: input.description.trim(), receivedAt: now };
        claim.adjudicatedAt = now;
        claim.eraReference = eraReference;
        pushStatus(claim, ctx, "DENIED", `${carc}: ${input.description.trim()}`);
        await save(ctx, claim, session);
        await createScoped(
          RemittanceAdvice,
          authzToken(ctx),
          { ...base, lines: claim.lines.map((l) => ({ cptCode: l.cptCode, billedCents: lineTotal(l), adjustments: [{ groupCode: group, reasonCode: reason, amountCents: lineTotal(l) }] })), denial: { carc, rarc: input.rarc ?? [], description: input.description.trim() } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    await recordAudit(ctx, { action: "CREATE", resourceType: "RemittanceAdvice", patientId: String(claim.patientId), metadata: { claimId, eraReference, outcome: "DENIED", carc } });
    return { status: "DENIED" as const };
  }

  // Payment: one entry per claim line, each balanced.
  const totals = { paid: 0, contractual: 0, copay: 0, deductible: 0, coinsurance: 0 };
  const eraLines = claim.lines.map((line) => {
    const r = input.lines.find((x) => x.lineId === String(line._id));
    if (!r) throw new RcmError(`Enter the payer's amounts for ${line.cptCode}.`);
    const amounts = [r.paidCents, r.contractualCents, r.copayCents, r.deductibleCents, r.coinsuranceCents];
    if (amounts.some((a) => !Number.isInteger(a) || a < 0)) throw new RcmError("Amounts must be zero or more.");
    const billed = lineTotal(line);
    const accounted = amounts.reduce((a, b) => a + b, 0);
    if (accounted !== billed) throw new RcmError(`${line.cptCode} doesn't balance: billed ${(billed / 100).toFixed(2)}, but paid + adjustments + patient responsibility = ${(accounted / 100).toFixed(2)}.`);
    totals.paid += r.paidCents;
    totals.contractual += r.contractualCents;
    totals.copay += r.copayCents;
    totals.deductible += r.deductibleCents;
    totals.coinsurance += r.coinsuranceCents;
    line.allowedCents = billed - r.contractualCents;
    line.paidCents = r.paidCents;
    return {
      cptCode: line.cptCode,
      billedCents: billed,
      allowedCents: billed - r.contractualCents,
      paidCents: r.paidCents,
      adjustments: [
        r.contractualCents && { groupCode: "CO", reasonCode: "45", amountCents: r.contractualCents },
        r.copayCents && { groupCode: "PR", reasonCode: "3", amountCents: r.copayCents },
        r.deductibleCents && { groupCode: "PR", reasonCode: "1", amountCents: r.deductibleCents },
        r.coinsuranceCents && { groupCode: "PR", reasonCode: "2", amountCents: r.coinsuranceCents },
      ].filter(Boolean),
    };
  });
  const patientCents = totals.copay + totals.deductible + totals.coinsurance;
  const date = visitDate(claim.lines[0].serviceDate);
  let invoiceId: string | undefined;
  const invoiceNumber = patientCents > 0 ? await nextInvoiceNumber() : undefined;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      claim.insurancePaidCents = totals.paid;
      claim.contractualAdjustmentCents = totals.contractual;
      claim.patientResponsibilityCents = patientCents;
      claim.eraReference = eraReference;
      claim.adjudicatedAt = now;
      pushStatus(claim, ctx, "PAID", `${eraReference}: paid ${(totals.paid / 100).toFixed(2)}, patient responsibility ${(patientCents / 100).toFixed(2)}`);
      await save(ctx, claim, session);
      await createScoped(
        RemittanceAdvice,
        authzToken(ctx),
        { ...base, lines: eraLines, totalPaidCents: totals.paid, totalContractualCents: totals.contractual, patientResponsibility: { copayCents: totals.copay, deductibleCents: totals.deductible, coinsuranceCents: totals.coinsurance } },
        { session },
      );
      if (patientCents > 0) {
        const invoice = await createScoped(
          Invoice,
          authzToken(ctx),
          {
            invoiceNumber,
            patientId: claim.patientId,
            kind: "CLAIM_PATIENT_RESPONSIBILITY",
            claimId: claim._id,
            lineItems: [
              totals.copay && { description: `Copay: ${date} visit`, amountCents: totals.copay },
              totals.deductible && { description: `Deductible: ${date} visit`, amountCents: totals.deductible },
              totals.coinsurance && { description: `Coinsurance: ${date} visit`, amountCents: totals.coinsurance },
            ].filter(Boolean),
            breakdown: { copayCents: totals.copay, deductibleCents: totals.deductible, coinsuranceCents: totals.coinsurance },
            status: "UNPAID",
            issuedAt: now,
            dueDate: new Date(now.getTime() + 30 * 86_400_000),
            publishedToPortal: true,
            notes: `Your insurance (${claim.payerName}) processed this visit. This is the amount your plan assigns to you.`,
          },
          { session },
        );
        invoiceId = String(invoice._id);
      }
      if (totals.deductible > 0 && claim.insurancePolicyId) {
        // Cap at the plan's total deductible.
        await InsurancePolicy.updateOne(
          { _id: claim.insurancePolicyId },
          [{ $set: { deductibleMetCents: { $min: [{ $add: [{ $ifNull: ["$deductibleMetCents", 0] }, totals.deductible] }, { $ifNull: ["$deductibleTotalCents", 0] }] } } }],
          { session, updatePipeline: true },
        ).setOptions({ authz: authzToken(ctx) });
      }
    });
  } finally {
    await session.endSession();
  }
  await recordAudit(ctx, { action: "CREATE", resourceType: "RemittanceAdvice", patientId: String(claim.patientId), metadata: { claimId, eraReference, outcome: "PAID", paidCents: totals.paid, patientCents } });
  if (invoiceId) await recordAudit(ctx, { action: "CREATE", resourceType: "Invoice", resourceId: invoiceId, patientId: String(claim.patientId), metadata: { kind: "CLAIM_PATIENT_RESPONSIBILITY", amountCents: patientCents, claimId } });
  return { status: "PAID" as const, invoiceId, patientCents };
}

// ── Patient invoices and A/R ───────────────────────────────────────────────

const OPEN_INVOICE = ["UNPAID", "PARTIAL", "IN_PAYMENT_PLAN"];
export const AGING_BUCKETS = [
  { key: "current", label: "0–30 days", max: 30 },
  { key: "d31", label: "31–60 days", max: 60 },
  { key: "d61", label: "61–90 days", max: 90 },
  { key: "d90", label: "Over 90 days", max: Infinity },
] as const;

export async function listInvoices(ctx: AuthContext, filter: { status?: "open" | "paid" | "all" } = {}, now = new Date()) {
  await authorizeAny(ctx, "invoice", "read");
  const status = filter.status ?? "open";
  const match = status === "open" ? { status: { $in: OPEN_INVOICE } } : status === "paid" ? { status: "PAID" } : { status: { $ne: "DRAFT" } };
  const invoices = await Invoice.find(await withScope(ctx, "invoice", match), { invoiceNumber: 1, patientId: 1, kind: 1, status: 1, amountDueCents: 1, amountPaidCents: 1, issuedAt: 1, dueDate: 1, claimId: 1 })
    .sort({ issuedAt: -1 })
    .limit(300)
    .setOptions({ authz: authzToken(ctx) })
    .lean();
  const open = await Invoice.find(await withScope(ctx, "invoice", { status: { $in: OPEN_INVOICE } }), { amountDueCents: 1, amountPaidCents: 1, issuedAt: 1 }).setOptions({ authz: authzToken(ctx) }).lean();
  const aging = AGING_BUCKETS.map((b) => ({ ...b, cents: 0, count: 0 }));
  for (const inv of open) {
    const balance = (inv.amountDueCents ?? 0) - (inv.amountPaidCents ?? 0);
    const days = Math.floor((now.getTime() - new Date(inv.issuedAt ?? now).getTime()) / 86_400_000);
    const bucket = aging.find((b) => days <= b.max)!;
    bucket.cents += balance;
    bucket.count += 1;
  }
  const names = await patientNames(invoices.map((i) => i.patientId));
  await recordAudit(ctx, { action: "VIEW", resourceType: "InvoiceList", metadata: { status, results: invoices.length } });
  return {
    aging,
    totalOpenCents: aging.reduce((n, b) => n + b.cents, 0),
    invoices: invoices.map((i) => ({
      id: String(i._id),
      invoiceNumber: i.invoiceNumber,
      patient: names.get(String(i.patientId))?.name ?? "Client",
      patientId: String(i.patientId),
      kind: i.kind,
      status: i.status,
      amountDueCents: i.amountDueCents ?? 0,
      balanceCents: (i.amountDueCents ?? 0) - (i.amountPaidCents ?? 0),
      issuedAt: i.issuedAt ?? undefined,
      dueDate: i.dueDate ?? undefined,
      claimId: i.claimId ? String(i.claimId) : undefined,
    })),
  };
}

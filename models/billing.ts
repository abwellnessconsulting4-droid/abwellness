import { Schema } from "mongoose";
import { phiGuard } from "@/lib/db/phi-guard";
import { baseOptions, cents, defineModel, encrypted, ref, signedCents } from "@/lib/db/schema";

// ── Code sets (reference data, not PHI) ────────────────────────────────────
// ICD-10-CM and HCPCS Level II are public (CMS). CPT is licensed by the AMA:
// a CPT license is required before loading the full code set in production.

export const MedicalCodeSchema = new Schema(
  {
    system: { type: String, enum: ["ICD10CM", "CPT", "HCPCS"], required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, required: true },
    shortDescription: String,
    defaultFeeCents: cents(),
    billable: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    effectiveDate: Date,
  },
  baseOptions,
);
MedicalCodeSchema.index({ system: 1, code: 1 }, { unique: true });
MedicalCodeSchema.index({ code: "text", description: "text" }, { weights: { code: 10, description: 1 } });
MedicalCodeSchema.index({ system: 1, active: 1, code: 1 }); // prefix search
export const MedicalCode = defineModel("MedicalCode", MedicalCodeSchema);

// ── Insurance & eligibility ────────────────────────────────────────────────

export const InsurancePolicySchema = new Schema(
  {
    patientId: ref("Patient"),
    priority: { type: String, enum: ["PRIMARY", "SECONDARY", "TERTIARY"], required: true },
    payerName: { type: String, required: true },
    payerId: String, // clearinghouse payer ID
    planName: String,
    memberIdEnc: encrypted(true),
    memberIdLast4: { type: String, required: true },
    memberIdHash: { type: String, select: false },
    groupNumber: String,
    subscriber: {
      _id: false,
      relationship: { type: String, enum: ["SELF", "SPOUSE", "CHILD", "OTHER"], default: "SELF" },
      name: String,
      dobEnc: encrypted(),
    },
    copayCents: cents(),
    deductibleTotalCents: cents(),
    deductibleMetCents: cents(),
    coinsurancePercent: { type: Number, min: 0, max: 100, default: 0 },
    outOfPocketMaxCents: cents(),
    cardFrontDocumentId: ref("ClinicalDocument", false),
    cardBackDocumentId: ref("ClinicalDocument", false),
    eligibility: {
      _id: false,
      status: { type: String, enum: ["UNVERIFIED", "VERIFIED", "INACTIVE", "ERROR"], default: "UNVERIFIED" },
      verifiedAt: Date,
      verifiedBy: ref("User", false),
      reference: String, // 271 response / call reference
    },
    effectiveOn: Date,
    terminatesOn: Date,
    active: { type: Boolean, default: true },
  },
  baseOptions,
);
InsurancePolicySchema.pre("validate", function () {
  if ((this.deductibleMetCents ?? 0) > (this.deductibleTotalCents ?? 0)) {
    this.invalidate("deductibleMetCents", "Deductible met cannot exceed the total deductible.");
  }
});
InsurancePolicySchema.index(
  { patientId: 1, priority: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
InsurancePolicySchema.index({ memberIdHash: 1 });
InsurancePolicySchema.plugin(phiGuard);
export const InsurancePolicy = defineModel("InsurancePolicy", InsurancePolicySchema);

/** Remaining deductible after what the patient has already met. */
export function remainingDeductibleCents(policy: { deductibleTotalCents?: number | null; deductibleMetCents?: number | null }) {
  return Math.max(0, (policy.deductibleTotalCents ?? 0) - (policy.deductibleMetCents ?? 0));
}

// ── Claims ──────────────────────────────────────────────────────────────────

export const CLAIM_STATUSES = [
  "DRAFT",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED", // clearinghouse/payer front-end rejection (fix and resubmit)
  "DENIED", // adjudicated denial (CARC/RARC)
  "PAID",
  "PARTIAL",
  "VOID",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  DRAFT: ["READY_TO_SUBMIT", "VOID"],
  READY_TO_SUBMIT: ["DRAFT", "SUBMITTED", "VOID"],
  SUBMITTED: ["ACCEPTED", "REJECTED", "DENIED", "PAID", "PARTIAL"],
  ACCEPTED: ["DENIED", "PAID", "PARTIAL"],
  REJECTED: ["READY_TO_SUBMIT", "SUBMITTED", "VOID"], // corrected and resubmitted
  DENIED: ["READY_TO_SUBMIT", "SUBMITTED", "VOID"], // appeal / corrected claim
  PARTIAL: ["PAID", "DENIED"],
  PAID: [],
  VOID: [],
};

const ClaimLineSchema = new Schema(
  {
    serviceDate: { type: Date, required: true },
    cptCode: { type: String, required: true, uppercase: true },
    modifiers: { type: [String], validate: (m: string[]) => m.length <= 4 },
    units: { type: Number, min: 1, default: 1 },
    icdPointers: { type: [String], validate: (p: string[]) => p.length >= 1 && p.length <= 4 },
    placeOfService: { type: String, default: "02" }, // 02/10 telehealth, 11 office
    chargeCents: cents(true),
    allowedCents: cents(),
    paidCents: cents(),
  },
  { _id: true },
);

export const ClaimSchema = new Schema(
  {
    claimNumber: { type: String, required: true },
    patientId: ref("Patient"),
    providerId: ref("StaffProfile"),
    clinicalNoteId: ref("ClinicalNote", false),
    appointmentId: ref("Appointment", false),
    insurancePolicyId: ref("InsurancePolicy", false),
    payerName: { type: String, required: true },
    lines: { type: [ClaimLineSchema], validate: (lines: unknown[]) => lines.length > 0 },
    totalBilledCents: cents(),
    status: { type: String, enum: CLAIM_STATUSES, default: "DRAFT" },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: CLAIM_STATUSES, required: true },
        at: { type: Date, default: Date.now },
        by: ref("User", false),
        note: String,
      },
    ],
    denial: {
      _id: false,
      carc: String, // e.g. "CO-4"
      rarc: [String],
      description: String,
      receivedAt: Date,
    },
    appealNotes: [{ _id: false, text: { type: String, required: true }, by: ref("User"), at: { type: Date, default: Date.now } }],
    resubmissionCount: { type: Number, default: 0, min: 0 },
    originalClaimId: ref("Claim", false),
    insurancePaidCents: cents(),
    contractualAdjustmentCents: cents(),
    patientResponsibilityCents: cents(),
    eraReference: String,
    clearinghouseReference: String,
    submittedAt: Date,
    adjudicatedAt: Date,
  },
  baseOptions,
);

ClaimSchema.post("init", function () {
  this.$locals.persistedStatus = this.status;
});

ClaimSchema.pre("validate", function () {
  this.totalBilledCents = this.lines.reduce((sum, line) => sum + line.chargeCents * (line.units ?? 1), 0);

  const from = this.$locals.persistedStatus as ClaimStatus | undefined;
  const to = this.status as ClaimStatus;
  if (from && from !== to && !CLAIM_TRANSITIONS[from].includes(to)) {
    this.invalidate("status", `Claim cannot move from ${from} to ${to}.`);
  }
  // Imports may supply their own history; otherwise record creation and each transition.
  // (Services may push their own entry with who/why; don't duplicate it.)
  if ((this.isNew && this.statusHistory.length === 0) || (from && from !== to && this.statusHistory.at(-1)?.status !== to)) {
    this.statusHistory.push({ status: to, at: new Date() });
  }
});

ClaimSchema.index({ claimNumber: 1 }, { unique: true });
ClaimSchema.index({ status: 1, updatedAt: -1 }); // work queues (denials, ready to submit)
ClaimSchema.index({ patientId: 1, createdAt: -1 });
ClaimSchema.index({ providerId: 1, createdAt: -1 });
ClaimSchema.index({ originalClaimId: 1 });
ClaimSchema.index({ clinicalNoteId: 1 }, { unique: true, partialFilterExpression: { clinicalNoteId: { $type: "objectId" }, originalClaimId: null } });
ClaimSchema.plugin(phiGuard);
export const Claim = defineModel("Claim", ClaimSchema);

// ── Remittance (ERA 835 / paper EOB) ───────────────────────────────────────

const AdjustmentSchema = new Schema(
  {
    groupCode: { type: String, enum: ["CO", "PR", "OA", "PI"], required: true }, // contractual, patient resp., other, payer initiated
    reasonCode: { type: String, required: true }, // CARC, e.g. "45", "1" (deductible), "3" (copay)
    amountCents: signedCents(),
  },
  { _id: false },
);

export const RemittanceAdviceSchema = new Schema(
  {
    eraReference: { type: String, required: true },
    kind: { type: String, enum: ["ERA", "EOB"], required: true },
    claimId: ref("Claim"),
    patientId: ref("Patient"),
    payerName: { type: String, required: true },
    checkOrEftNumber: String,
    paymentDate: Date,
    lines: [
      {
        _id: false,
        cptCode: { type: String, required: true },
        billedCents: cents(true),
        allowedCents: cents(),
        paidCents: cents(),
        adjustments: [AdjustmentSchema],
      },
    ],
    totalPaidCents: cents(),
    totalContractualCents: cents(),
    patientResponsibility: {
      _id: false,
      copayCents: cents(),
      deductibleCents: cents(),
      coinsuranceCents: cents(),
    },
    denial: { _id: false, carc: String, rarc: [String], description: String },
    postedBy: ref("User", false),
    postedAt: Date,
  },
  baseOptions,
);
RemittanceAdviceSchema.index({ eraReference: 1, claimId: 1 }, { unique: true });
RemittanceAdviceSchema.index({ claimId: 1 });
RemittanceAdviceSchema.plugin(phiGuard);
export const RemittanceAdvice = defineModel("RemittanceAdvice", RemittanceAdviceSchema);

// ── Patient invoices ───────────────────────────────────────────────────────

export const INVOICE_STATUSES = ["DRAFT", "UNPAID", "PARTIAL", "PAID", "IN_PAYMENT_PLAN", "VOID"] as const;

export const InvoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true },
    patientId: ref("Patient"),
    kind: {
      type: String,
      enum: ["CLAIM_PATIENT_RESPONSIBILITY", "LATE_CANCELLATION", "NO_SHOW", "SELF_PAY", "PACKAGE"],
      required: true,
    },
    claimId: ref("Claim", false),
    appointmentId: ref("Appointment", false),
    lineItems: [{ _id: false, description: { type: String, required: true }, amountCents: cents(true) }],
    breakdown: {
      _id: false,
      copayCents: cents(),
      deductibleCents: cents(),
      coinsuranceCents: cents(),
      feesCents: cents(),
    },
    amountDueCents: cents(),
    amountPaidCents: cents(),
    status: { type: String, enum: INVOICE_STATUSES, default: "DRAFT" },
    issuedAt: Date,
    dueDate: Date,
    paidAt: Date,
    paymentPlanId: ref("PaymentPlan", false),
    publishedToPortal: { type: Boolean, default: false },
    notes: String, // patient-facing; no clinical detail
  },
  baseOptions,
);
InvoiceSchema.pre("validate", function () {
  this.amountDueCents = this.lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  if ((this.amountPaidCents ?? 0) > this.amountDueCents) {
    this.invalidate("amountPaidCents", "Amount paid cannot exceed the amount due.");
  }
  if (this.status !== "VOID" && this.status !== "DRAFT" && this.status !== "IN_PAYMENT_PLAN") {
    const paid = this.amountPaidCents ?? 0;
    this.status = paid === 0 ? "UNPAID" : paid < this.amountDueCents ? "PARTIAL" : "PAID";
    if (this.status === "PAID" && !this.paidAt) this.paidAt = new Date();
  }
});
InvoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ patientId: 1, status: 1, dueDate: 1 });
InvoiceSchema.index({ status: 1, issuedAt: 1 }); // A/R aging buckets
InvoiceSchema.index({ claimId: 1 });
InvoiceSchema.plugin(phiGuard);
export const Invoice = defineModel("Invoice", InvoiceSchema);

// ── Payments, refunds & plans (card data never touches our servers) ────────

export const PaymentTransactionSchema = new Schema(
  {
    patientId: ref("Patient"),
    kind: { type: String, enum: ["PAYMENT", "REFUND"], required: true },
    allocations: [{ _id: false, invoiceId: ref("Invoice"), amountCents: cents(true) }],
    amountCents: cents(true),
    method: { type: String, enum: ["CARD", "ACH", "CASH", "CHECK", "OTHER"], required: true },
    processor: { type: String, enum: ["STRIPE", "MANUAL"], required: true },
    processorReference: String, // Stripe PaymentIntent / Refund id
    status: { type: String, enum: ["PENDING", "SUCCEEDED", "FAILED", "CANCELED"], default: "PENDING" },
    refundOfId: ref("PaymentTransaction", false),
    paymentPlanId: ref("PaymentPlan", false),
    cardBrand: String,
    cardLast4: { type: String, match: /^\d{4}$/ },
    receiptNumber: String,
    collectedBy: ref("User", false),
    failureReason: String,
  },
  baseOptions,
);
PaymentTransactionSchema.pre("validate", function () {
  const allocated = this.allocations.reduce((sum, a) => sum + a.amountCents, 0);
  if (this.allocations.length > 0 && allocated !== this.amountCents) {
    this.invalidate("allocations", "Allocations must add up to the transaction amount.");
  }
});
PaymentTransactionSchema.index({ processorReference: 1 }, { unique: true, partialFilterExpression: { processorReference: { $type: "string" } } });
PaymentTransactionSchema.index({ receiptNumber: 1 }, { unique: true, partialFilterExpression: { receiptNumber: { $type: "string" } } });
PaymentTransactionSchema.index({ patientId: 1, createdAt: -1 });
PaymentTransactionSchema.index({ status: 1, createdAt: -1 });
PaymentTransactionSchema.plugin(phiGuard);
export const PaymentTransaction = defineModel("PaymentTransaction", PaymentTransactionSchema);

export const PaymentPlanSchema = new Schema(
  {
    patientId: ref("Patient"),
    invoiceIds: { type: [ref("Invoice")], validate: (ids: unknown[]) => ids.length > 0 },
    totalCents: cents(true),
    installmentCount: { type: Number, min: 2, max: 24, required: true },
    frequency: { type: String, enum: ["MONTHLY", "BIWEEKLY"], default: "MONTHLY" },
    schedule: [
      {
        dueDate: { type: Date, required: true },
        amountCents: cents(true),
        status: { type: String, enum: ["SCHEDULED", "PAID", "FAILED", "SKIPPED"], default: "SCHEDULED" },
        transactionId: ref("PaymentTransaction", false),
        reminderSentAt: Date,
      },
    ],
    autopay: { type: Boolean, default: false },
    stripeCustomerId: String,
    stripePaymentMethodId: String, // tokenized; never raw card data
    status: { type: String, enum: ["ACTIVE", "COMPLETED", "DEFAULTED", "CANCELED"], default: "ACTIVE" },
    agreementSignedConsentId: ref("SignedConsent", false),
  },
  baseOptions,
);
PaymentPlanSchema.pre("validate", function () {
  const scheduled = this.schedule.reduce((sum, item) => sum + item.amountCents, 0);
  if (this.schedule.length > 0 && scheduled !== this.totalCents) {
    this.invalidate("schedule", "Installments must add up to the plan total.");
  }
});
PaymentPlanSchema.index({ patientId: 1, status: 1 });
PaymentPlanSchema.index({ status: 1, "schedule.dueDate": 1 }); // autopay / reminder jobs
PaymentPlanSchema.plugin(phiGuard);
export const PaymentPlan = defineModel("PaymentPlan", PaymentPlanSchema);

/** Split a total into equal installments, putting any remainder cents on the first one. */
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? remainder : 0));
}

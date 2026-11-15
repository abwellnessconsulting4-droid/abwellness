import { Schema } from "mongoose";
import { phiGuard } from "@/lib/db/phi-guard";
import { baseOptions, defineModel, ref, SignatureSchema } from "@/lib/db/schema";

export const CONSENT_TYPES = [
  "HIPAA_PRIVACY_NOTICE", // Notice of Privacy Practices acknowledgment
  "CONSENT_FOR_TREATMENT",
  "TELEHEALTH_CONSENT",
  "FINANCIAL_RESPONSIBILITY", // includes the cancellation / no-show policy
  "RELEASE_OF_INFORMATION",
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/** The four agreements every new patient signs during intake. */
export const MANDATORY_CONSENTS: readonly ConsentType[] = [
  "HIPAA_PRIVACY_NOTICE",
  "CONSENT_FOR_TREATMENT",
  "TELEHEALTH_CONSENT",
  "FINANCIAL_RESPONSIBILITY",
];

export const ConsentTemplateSchema = new Schema(
  {
    type: { type: String, enum: CONSENT_TYPES, required: true },
    version: { type: String, required: true }, // "v2.1-2026"
    title: { type: String, required: true },
    language: { type: String, default: "en" },
    bodyMarkdown: { type: String, required: true },
    contentHash: { type: String, required: true }, // sha256 of bodyMarkdown
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "RETIRED"], default: "DRAFT" },
    effectiveDate: Date,
    renewalDays: Number, // re-sign interval (e.g. 365); null = never expires
    // Financial terms the scheduling/billing engine reads from the signed version.
    terms: {
      _id: false,
      lateCancellationHours: Number,
      lateCancellationFeeCents: Number,
      noShowFeeCents: Number,
    },
    publishedBy: ref("User", false),
    publishedAt: Date,
  },
  baseOptions,
);
ConsentTemplateSchema.post("init", function () {
  this.$locals.persistedStatus = this.status;
});
ConsentTemplateSchema.pre("save", function () {
  if (!this.isNew && this.$locals.persistedStatus !== "DRAFT" && (this.isModified("bodyMarkdown") || this.isModified("terms"))) {
    throw new Error("Published consent templates are immutable; create a new version.");
  }
});
ConsentTemplateSchema.index({ type: 1, version: 1, language: 1 }, { unique: true });
ConsentTemplateSchema.index({ type: 1, language: 1 }, { unique: true, partialFilterExpression: { status: "PUBLISHED" } });
export const ConsentTemplate = defineModel("ConsentTemplate", ConsentTemplateSchema);

export const SignedConsentSchema = new Schema(
  {
    patientId: ref("Patient"),
    templateId: ref("ConsentTemplate"),
    consentType: { type: String, enum: CONSENT_TYPES, required: true },
    version: { type: String, required: true },
    signature: { type: SignatureSchema, required: true },
    // Who signed relative to the patient (self, parent/guardian, personal representative).
    signerRelationship: { type: String, enum: ["SELF", "GUARDIAN", "PERSONAL_REPRESENTATIVE"], default: "SELF" },
    // Release of Information specifics.
    roi: {
      _id: false,
      recipientName: String,
      recipientAddress: String,
      scope: String, // what may be disclosed
      purpose: String,
      includesPsychotherapyNotes: { type: Boolean, default: false }, // requires its own authorization
      expiresAt: Date,
    },
    expiresAt: Date,
    documentId: ref("ClinicalDocument", false), // rendered PDF copy
    revokedAt: Date,
    revokedBy: ref("User", false),
    revocationReason: String,
  },
  baseOptions,
);

const REVOCATION_FIELDS = new Set(["revokedAt", "revokedBy", "revocationReason", "documentId", "updatedAt"]);

SignedConsentSchema.pre("validate", function () {
  if (this.consentType === "RELEASE_OF_INFORMATION" && (!this.roi?.recipientName || !this.roi?.scope || !this.roi?.expiresAt)) {
    this.invalidate("roi", "A release of information needs a recipient, scope, and expiration date.");
  }
});
SignedConsentSchema.pre("save", function () {
  if (this.isNew) return;
  const blocked = this.modifiedPaths({ includeChildren: false }).filter((path) => !REVOCATION_FIELDS.has(path.split(".")[0]));
  if (blocked.length > 0) throw new Error(`Signed consents are immutable (attempted: ${blocked.join(", ")}).`);
});
SignedConsentSchema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany"], { document: false, query: true }, function () {
  throw new Error("Signed consents can only be revoked through a loaded document.");
});
SignedConsentSchema.index({ patientId: 1, consentType: 1, "signature.signedAt": -1 });
SignedConsentSchema.index({ expiresAt: 1 }, { partialFilterExpression: { revokedAt: null } });
SignedConsentSchema.plugin(phiGuard);
export const SignedConsent = defineModel("SignedConsent", SignedConsentSchema);

/** Admin-only registry: Business Associate Agreements and backup/restore verification. */
export const ComplianceRecordSchema = new Schema(
  {
    kind: { type: String, enum: ["BAA", "BACKUP_VERIFICATION", "RISK_ASSESSMENT", "ACCESS_REVIEW", "INCIDENT"], required: true },
    vendor: String,
    service: String,
    baaStatus: { type: String, enum: ["ACTIVE", "PENDING", "EXPIRED", "TERMINATED", "NOT_APPLICABLE"] },
    notApplicableReason: String, // e.g. "Payment processing exemption (HIPAA §1179)"
    signedDate: Date,
    renewalDate: Date,
    documentId: ref("ClinicalDocument", false),
    backup: {
      _id: false,
      snapshotAt: Date,
      restoreTestedAt: Date,
      restoredTo: String, // non-production target
      result: { type: String, enum: ["PASSED", "FAILED"] },
      durationMinutes: Number,
    },
    notes: String,
    recordedBy: ref("User"),
  },
  baseOptions,
);
ComplianceRecordSchema.index({ kind: 1, renewalDate: 1 });
ComplianceRecordSchema.index({ vendor: 1, kind: 1 });
export const ComplianceRecord = defineModel("ComplianceRecord", ComplianceRecordSchema);

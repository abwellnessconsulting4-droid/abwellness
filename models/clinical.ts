import { Schema } from "mongoose";
import { phiGuard } from "@/lib/db/phi-guard";
import { baseOptions, defineModel, encrypted, ref, SignatureSchema } from "@/lib/db/schema";

const QUERY_UPDATE_OPS = ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"] as const;

/** Reject query-level updates so document hooks (locks, immutability) can't be bypassed. */
function documentUpdatesOnly(schema: Schema, modelName: string) {
  schema.pre([...QUERY_UPDATE_OPS], { document: false, query: true }, function () {
    throw new Error(`${modelName} must be updated through a loaded document (doc.save()), not a query update.`);
  });
}

// ── Health assessments ──────────────────────────────────────────────────────

export const HealthAssessmentSchema = new Schema(
  {
    patientId: ref("Patient"),
    type: {
      type: String,
      enum: ["INTAKE_HISTORY", "PHQ9", "GAD7", "WELLNESS_LIFESTYLE", "VITALS"],
      required: true,
    },
    responsesEnc: encrypted(true), // item-level answers (JSON, encrypted)
    historyEnc: encrypted(), // past medical/surgical/family/social history (JSON, encrypted)
    score: Number,
    severity: { type: String, enum: ["NONE", "MINIMAL", "MILD", "MODERATE", "MODERATELY_SEVERE", "SEVERE"] },
    vitals: {
      _id: false,
      heightCm: Number,
      weightKg: Number,
      systolic: Number,
      diastolic: Number,
      heartRate: Number,
      recordedAt: Date,
    },
    completedBy: ref("User"),
    completedByRole: { type: String, required: true },
    completedAt: { type: Date, default: Date.now },
  },
  baseOptions,
);
HealthAssessmentSchema.index({ patientId: 1, type: 1, completedAt: -1 });
HealthAssessmentSchema.plugin(phiGuard);
export const HealthAssessment = defineModel("HealthAssessment", HealthAssessmentSchema);

// ── Clinical notes ──────────────────────────────────────────────────────────

export const NOTE_STATUSES = ["DRAFT", "PENDING_COSIGN", "SIGNED_LOCKED"] as const;

const AddendumSchema = new Schema(
  {
    authorId: ref("StaffProfile"),
    textEnc: encrypted(true),
    signature: { type: SignatureSchema, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const AccessGrantSchema = new Schema(
  {
    userId: ref("User"),
    grantedBy: ref("User"),
    reason: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    grantedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

export const ClinicalNoteSchema = new Schema(
  {
    patientId: ref("Patient"),
    providerId: ref("StaffProfile"), // author
    appointmentId: ref("Appointment", false),
    noteType: { type: String, enum: ["SOAP", "PROGRESS", "INTAKE", "PSYCHOTHERAPY"], required: true },
    subjectiveEnc: encrypted(),
    objectiveEnc: encrypted(),
    assessmentEnc: encrypted(),
    planEnc: encrypted(),
    bodyEnc: encrypted(), // free-text notes (progress / psychotherapy)
    diagnosisCodes: [{ type: String, uppercase: true }], // ICD-10-CM
    serviceLines: [
      {
        _id: false,
        cptCode: { type: String, required: true },
        modifiers: [String],
        units: { type: Number, min: 1, default: 1 },
        minutes: Number,
      },
    ],
    status: { type: String, enum: NOTE_STATUSES, default: "DRAFT" },
    signature: SignatureSchema,
    cosignRequired: { type: Boolean, default: false },
    cosignature: SignatureSchema,
    addenda: [AddendumSchema],
    // Psychotherapy notes: explicit, expiring, audited grants for anyone but the author.
    accessGrants: [AccessGrantSchema],
    sessionMinutes: Number, // from telehealth/visit timing, for time-based CPT validation
  },
  baseOptions,
);

const LOCKED_EDITABLE = new Set(["addenda", "cosignature", "accessGrants", "updatedAt", "status"]);

ClinicalNoteSchema.post("init", function () {
  this.$locals.persistedStatus = this.status;
});

ClinicalNoteSchema.pre("save", function () {
  if (this.isNew || this.$locals.persistedStatus !== "SIGNED_LOCKED") return;
  const blocked = this.modifiedPaths({ includeChildren: false }).filter((path) => !LOCKED_EDITABLE.has(path.split(".")[0]));
  if (blocked.length > 0 || (this.isModified("status") && this.status !== "SIGNED_LOCKED")) {
    throw new Error(`ClinicalNote ${this._id} is signed and locked; add an addendum instead (changed: ${blocked.join(", ") || "status"}).`);
  }
});

ClinicalNoteSchema.pre("validate", function () {
  if (this.status === "SIGNED_LOCKED" && !this.signature) {
    this.invalidate("signature", "A signed note requires a signature record.");
  }
});

ClinicalNoteSchema.index({ patientId: 1, createdAt: -1 });
ClinicalNoteSchema.index({ providerId: 1, status: 1, createdAt: -1 }); // unsigned-notes queue
ClinicalNoteSchema.index({ appointmentId: 1 });
documentUpdatesOnly(ClinicalNoteSchema, "ClinicalNote");
ClinicalNoteSchema.plugin(phiGuard);
export const ClinicalNote = defineModel("ClinicalNote", ClinicalNoteSchema);

// ── Problem list & treatment plans ─────────────────────────────────────────

export const DiagnosisSchema = new Schema(
  {
    patientId: ref("Patient"),
    icd10Code: { type: String, required: true, uppercase: true, match: /^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/ },
    description: { type: String, required: true },
    detailsEnc: encrypted(),
    status: { type: String, enum: ["ACTIVE", "RESOLVED", "RULED_OUT"], default: "ACTIVE" },
    isPrimary: { type: Boolean, default: false },
    onsetDate: Date,
    resolvedDate: Date,
    recordedBy: ref("StaffProfile"),
    sourceNoteId: ref("ClinicalNote", false),
  },
  baseOptions,
);
DiagnosisSchema.index({ patientId: 1, status: 1 });
DiagnosisSchema.index({ icd10Code: 1 });
DiagnosisSchema.plugin(phiGuard);
export const Diagnosis = defineModel("Diagnosis", DiagnosisSchema);

export const TreatmentPlanSchema = new Schema(
  {
    patientId: ref("Patient"),
    providerId: ref("StaffProfile"),
    diagnosisIds: [ref("Diagnosis")],
    goals: [
      {
        description: { type: String, required: true },
        measure: { type: String, required: true }, // how progress is measured
        baseline: String,
        target: String,
        targetDate: Date,
        status: { type: String, enum: ["NOT_STARTED", "IN_PROGRESS", "MET", "NOT_MET", "DISCONTINUED"], default: "NOT_STARTED" },
      },
    ],
    interventions: [{ _id: false, description: { type: String, required: true }, frequency: String, responsible: String }],
    status: { type: String, enum: ["DRAFT", "ACTIVE", "COMPLETED", "DISCONTINUED"], default: "DRAFT" },
    reviewDate: Date,
    providerSignature: SignatureSchema,
    patientSignature: SignatureSchema,
  },
  baseOptions,
);
TreatmentPlanSchema.index({ patientId: 1, status: 1 });
TreatmentPlanSchema.index({ reviewDate: 1, status: 1 });
TreatmentPlanSchema.plugin(phiGuard);
export const TreatmentPlan = defineModel("TreatmentPlan", TreatmentPlanSchema);

// ── Medications & allergies ────────────────────────────────────────────────

export const MedicationSchema = new Schema(
  {
    patientId: ref("Patient"),
    name: { type: String, required: true },
    dosage: String,
    frequency: String,
    route: { type: String, enum: ["ORAL", "TOPICAL", "INJECTION", "INHALED", "SUBLINGUAL", "TRANSDERMAL", "OTHER"] },
    prescriber: String,
    status: { type: String, enum: ["ACTIVE", "DISCONTINUED", "COMPLETED"], default: "ACTIVE" },
    startDate: Date,
    endDate: Date,
    reportedBy: { type: String, enum: ["PATIENT", "STAFF"], required: true },
    recordedById: ref("User"),
  },
  baseOptions,
);
MedicationSchema.index({ patientId: 1, status: 1 });
MedicationSchema.plugin(phiGuard);
export const Medication = defineModel("Medication", MedicationSchema);

export const AllergySchema = new Schema(
  {
    patientId: ref("Patient"),
    allergen: { type: String, required: true },
    reaction: String,
    severity: { type: String, enum: ["MILD", "MODERATE", "SEVERE", "LIFE_THREATENING", "UNKNOWN"], default: "UNKNOWN" },
    status: { type: String, enum: ["ACTIVE", "INACTIVE", "ENTERED_IN_ERROR"], default: "ACTIVE" },
    reportedBy: { type: String, enum: ["PATIENT", "STAFF"], required: true },
    recordedById: ref("User"),
  },
  baseOptions,
);
AllergySchema.index({ patientId: 1, status: 1 });
AllergySchema.plugin(phiGuard);
export const Allergy = defineModel("Allergy", AllergySchema);

// ── Document vault (metadata; bytes live in private object storage) ────────

export const DOCUMENT_CATEGORIES = [
  "GOVERNMENT_ID",
  "INSURANCE_CARD_FRONT",
  "INSURANCE_CARD_BACK",
  "LAB_RESULT",
  "REFERRAL",
  "EXTERNAL_RECORD",
  "SIGNED_CONSENT",
  "CLINICAL_SUMMARY",
  "INVOICE",
  "RECEIPT",
  "OTHER",
] as const;

export const ClinicalDocumentSchema = new Schema(
  {
    patientId: ref("Patient"),
    category: { type: String, enum: DOCUMENT_CATEGORIES, required: true },
    storage: {
      _id: false,
      provider: { type: String, enum: ["S3", "LOCAL"], required: true },
      bucket: String,
      key: { type: String, required: true }, // "<patientId>/<documentId>": never a filename
    },
    fileNameEnc: encrypted(), // original names often contain PHI
    mimeType: { type: String, required: true },
    byteSize: { type: Number, min: 1, max: 25 * 1024 * 1024 },
    sha256: String,
    status: { type: String, enum: ["PENDING_UPLOAD", "SCANNING", "AVAILABLE", "QUARANTINED", "DELETED"], default: "PENDING_UPLOAD" },
    uploadedBy: ref("User"),
    uploadedByRole: { type: String, required: true },
    retentionUntil: Date,
    deletedAt: Date,
  },
  baseOptions,
);
ClinicalDocumentSchema.index({ "storage.key": 1 }, { unique: true });
ClinicalDocumentSchema.index({ patientId: 1, category: 1, createdAt: -1 });
ClinicalDocumentSchema.index({ status: 1, createdAt: 1 });
ClinicalDocumentSchema.plugin(phiGuard);
export const ClinicalDocument = defineModel("ClinicalDocument", ClinicalDocumentSchema);

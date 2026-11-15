# AB Wellness Platform: Data Model (MongoDB / Mongoose 9)

Companion to [phase-1-architecture.md](./phase-1-architecture.md). This is the reviewed **design spec**. In Phase 2 it is split into `models/*.ts` (one file per model, following the existing `models/EmailSubscriber.ts` pattern) and loaded only through `server/repositories/*`.

**Verified:** the schemas below type-check against the installed `mongoose@9.9.4`. On a local MongoDB replica set they created **36 collections and 102 indexes** with no errors. These behaviours were exercised:

- A duplicate appointment slot is rejected (E11000).
- A second active PRIMARY care assignment is rejected (E11000), and one is allowed again after the first is ended.
- `CLIENT` combined with a staff role fails validation.
- A document can't be reviewed by its uploader.
- Invoice totals are derived from line items.

## Conventions

| Topic | Rule |
|---|---|
| IDs | `ObjectId` (time-ordered, non-guessable enough for URLs). Authorization never relies on ID secrecy |
| References | `ref()` helper: `ObjectId` with `ref` for `populate`. Existence is checked in repositories; nothing is hard-deleted by user action, so references don't dangle |
| Encrypted fields | `encrypted()` = `Buffer`, `select: false`. Holds CSFLE ciphertext (BSON Binary subtype 6). Decrypted only in the DAL when the caller's permission allows, then masked by the DTO unless revealed (audited) |
| Strictness | `strict: "throw"`: unknown fields are an error, not silently dropped |
| Money | Integer cents (`Number`, safe to 2^53) |
| Timestamps | `timestamps: true` (`createdAt`, `updatedAt`). Append-only collections set their own `at`/`signedAt` |
| Partial unique indexes | Used for "one active X per client" rules (primary practitioner, current residence, default responsible party, active insurance per priority, published form version) |
| Server-side validation | Phase 2 generates `$jsonSchema` validators from these schemas for `auditlogs`, `electronicsignatures`, `consents`, `documents` and `sessionnotes`, applied by `abw_migrator` |

## Collections by domain

| Domain | Models (→ collection) |
|---|---|
| Identity & access | Role, User, Session (+ Better Auth accounts, verifications, twoFactors, passkeys), StaffProfile |
| Clients | ClientProfile, ClientStageEvent, CareAssignment, EmergencyContact, NextOfKin, Residence, IdentityVerification, InsurancePolicy, ResponsibleParty |
| Intake engine | IntakeForm, IntakeFormVersion, IntakeSubmission |
| Documents & signatures | Document, SignatureRequest, ElectronicSignature, Consent |
| Scheduling | AppointmentType, StaffAvailability, Appointment, AppointmentSlot |
| Messaging | MessageThread, Message |
| Clinical | SessionNote |
| Billing | Invoice (embedded line items), Payment, StripeEvent |
| Public site | Inquiry, EmailSubscriber (existing waitlist model, unchanged) |
| Configuration | RetentionPolicy, SystemSetting, Counter |
| Audit | AuditLog, AuditChainHead |

## Schema

```ts
import { Schema, Types } from "mongoose";

// ── Shared enums ────────────────────────────────────────────────────────────
export const ROLE_KEYS = [
  "SUPER_ADMIN", "ADMIN", "SUPERVISOR", "STAFF_PRACTITIONER",
  "INTAKE_SPECIALIST", "BILLING_SPECIALIST", "CLIENT",
] as const;
export const CLIENT_STAGES = [
  "LEAD", "INTAKE_IN_PROGRESS", "INTAKE_SUBMITTED", "UNDER_REVIEW",
  "ACCEPTED", "ACTIVE", "ON_HOLD", "DISCHARGED", "DECLINED",
] as const;
export const PRE_ACTIVE_STAGES = CLIENT_STAGES.slice(0, 5); // intake-specialist scope
export const DOCUMENT_CATEGORIES = [
  "PROOF_OF_ADDRESS", "IDENTITY", "INSURANCE_CARD", "AVATAR", "CONSENT",
  "AGREEMENT", "SIGNED_RECORD", "SIGNATURE_IMAGE", "LEGAL_AUTHORITY",
  "MESSAGE_ATTACHMENT", "CLINICAL", "BILLING", "OTHER",
] as const;
const VERIFICATION = ["PENDING", "VERIFIED", "FAILED", "EXPIRED"] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────
const ref = (model: string, required = true) =>
  ({ type: Schema.Types.ObjectId, ref: model, required });
/** CSFLE ciphertext (BSON Binary subtype 6). Never selected by default. */
const encrypted = (required = false) => ({ type: Buffer, required, select: false });
const e164 = { type: String, match: /^\+[1-9]\d{6,14}$/ };
const opts = { timestamps: true, strict: "throw" as const };
const Address = new Schema(
  { line1: String, line2: String, city: String, region: String,
    postalCode: String, country: { type: String, default: "US", maxlength: 2 } },
  { _id: false },
);

// ── Identity & access ───────────────────────────────────────────────────────
export const RoleSchema = new Schema({
  _id: { type: String, enum: ROLE_KEYS },          // role key is the id
  name: { type: String, required: true },
  description: String,
  isStaff: { type: Boolean, required: true },
  rank: { type: Number, required: true, unique: true }, // may only grant roles ranked below own
  mfaRequired: { type: Boolean, default: true },
});

export const UserSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  emailVerified: { type: Boolean, default: false },
  name: { type: String, required: true },
  roles: {
    type: [{ type: String, enum: ROLE_KEYS }],
    validate: (r: string[]) => !(r.includes("CLIENT") && r.length > 1), // CLIENT is exclusive
  },
  status: { type: String, enum: ["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"], default: "INVITED" },
  twoFactorEnabled: { type: Boolean, default: false },
  avatarDocumentId: ref("Document", false),
  sessionVersion: { type: Number, default: 0 },    // bump to invalidate every session
  lastLoginAt: Date,
  deactivatedAt: Date,
}, opts);
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ roles: 1, status: 1 });

// Better Auth session collection (accounts, verifications, twoFactors, passkeys
// come from its MongoDB adapter unchanged). Extra fields drive timeouts/step-up.
export const SessionSchema = new Schema({
  userId: ref("User"),
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true },       // absolute lifetime
  lastActiveAt: { type: Date, required: true },    // idle-timeout clock
  stepUpAt: Date,                                  // last MFA re-auth (PII reveal, ID view, signing)
  ipAddress: String,
  userAgent: String,
}, opts);
SessionSchema.index({ token: 1 }, { unique: true });
SessionSchema.index({ userId: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup

export const StaffProfileSchema = new Schema({
  userId: ref("User"),
  title: String,
  credentials: String,
  npi: { type: String, match: /^\d{10}$/ },
  supervisorUserId: ref("User", false),
  timezone: { type: String, default: "America/New_York" },
  acceptingClients: { type: Boolean, default: true },
}, opts);
StaffProfileSchema.index({ userId: 1 }, { unique: true });
StaffProfileSchema.index({ supervisorUserId: 1 });
StaffProfileSchema.index({ npi: 1 }, { unique: true, partialFilterExpression: { npi: { $type: "string" } } });

// ── Clients ─────────────────────────────────────────────────────────────────
export const ClientProfileSchema = new Schema({
  userId: ref("User", false),                      // null until a portal account exists
  clientNumber: { type: String, required: true },  // 'ABW-001234' from counters collection
  legalFirstName: { type: String, required: true },
  legalLastName: { type: String, required: true },
  nameSearch: { type: Buffer, select: false },     // deterministic-encrypted lowercase last name
  preferredName: String,
  pronouns: String,
  dateOfBirth: encrypted(),
  email: { type: String, lowercase: true },
  phone: e164,
  primaryLanguage: String,
  demographics: { type: Schema.Types.Mixed, default: {} }, // schema-driven (race, ethnicity, …)
  stage: { type: String, enum: CLIENT_STAGES, default: "LEAD" },
  stageChangedAt: { type: Date, default: Date.now },
  intakeOwnerUserId: ref("User", false),
  legalHold: { type: Boolean, default: false },     // blocks retention purges
  archivedAt: Date,
}, opts);
ClientProfileSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } });
ClientProfileSchema.index({ clientNumber: 1 }, { unique: true });
ClientProfileSchema.index({ stage: 1, stageChangedAt: -1 });
ClientProfileSchema.index({ intakeOwnerUserId: 1, stage: 1 });
ClientProfileSchema.index({ nameSearch: 1 });

export const ClientStageEventSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  fromStage: { type: String, enum: CLIENT_STAGES },
  toStage: { type: String, enum: CLIENT_STAGES, required: true },
  changedBy: ref("User", false),
  reason: String,
  at: { type: Date, default: Date.now },
});
ClientStageEventSchema.index({ clientProfileId: 1, at: -1 });
ClientStageEventSchema.index({ toStage: 1, at: -1 }); // funnel reporting

// Caseload. Basis for the "assigned" scope.
export const CareAssignmentSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  staffUserId: ref("User"),
  kind: { type: String, enum: ["PRIMARY", "SECONDARY", "INTAKE"], required: true },
  assignedBy: ref("User", false),
  startedAt: { type: Date, default: Date.now },
  endedAt: Date,
}, opts);
CareAssignmentSchema.index({ staffUserId: 1, endedAt: 1, clientProfileId: 1 });
CareAssignmentSchema.index(
  { clientProfileId: 1 },
  { unique: true, partialFilterExpression: { kind: "PRIMARY", endedAt: null } },
);

export const EmergencyContactSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  fullName: { type: String, required: true },
  relationship: { type: String, required: true },
  phone: { ...e164, required: true },
  altPhone: e164,
  email: { type: String, lowercase: true },
  priority: { type: Number, min: 1, max: 5, default: 1 },
  mayDisclosePhi: { type: Boolean, default: false },  // client authorized sharing info
}, opts);
EmergencyContactSchema.index({ clientProfileId: 1, priority: 1 }, { unique: true });

// Distinct from emergency contacts: carries legal standing.
export const NextOfKinSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  fullName: { type: String, required: true },
  relationship: { type: String, required: true },
  isLegalRepresentative: { type: Boolean, default: false },
  legalAuthority: { type: String, enum: ["GUARDIAN", "POWER_OF_ATTORNEY", "HEALTH_CARE_PROXY", "OTHER"] },
  authorityDocumentId: ref("Document", false),
  phone: e164,
  email: { type: String, lowercase: true },
  address: Address,
  emergencyContactId: ref("EmergencyContact", false), // same person is also an EC
}, opts);
NextOfKinSchema.index({ clientProfileId: 1 });

export const ResidenceSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  address: { type: Address, required: true },
  housingType: { type: String, enum: ["OWN", "RENT", "WITH_FAMILY", "TRANSITIONAL", "SHELTER", "UNHOUSED", "OTHER"] },
  movedInOn: Date,
  movedOutOn: Date,
  isCurrent: { type: Boolean, default: true },
  proofDocumentIds: [ref("Document")],
  verificationStatus: { type: String, enum: VERIFICATION, default: "PENDING" },
  verifiedBy: ref("User", false),
  verifiedAt: Date,
}, opts);
ResidenceSchema.index({ clientProfileId: 1, movedInOn: -1 });
ResidenceSchema.index({ clientProfileId: 1 }, { unique: true, partialFilterExpression: { isCurrent: true } });

// ID images are purged on schedule after review; last4 + outcome survive.
export const IdentityVerificationSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  idType: { type: String, enum: ["DRIVERS_LICENSE", "STATE_ID", "PASSPORT", "PERMANENT_RESIDENT_CARD", "OTHER"], required: true },
  idNumber: encrypted(),
  idNumberLast4: { type: String, maxlength: 4 },
  issuingAuthority: String,
  expiresOn: Date,
  frontDocumentId: ref("Document", false),
  backDocumentId: ref("Document", false),
  status: { type: String, enum: VERIFICATION, default: "PENDING" },
  reviewedBy: ref("User", false),
  reviewedAt: Date,
  failureReason: String,
  imagesPurgeAfter: Date,
  imagesPurgedAt: Date,
}, opts);
IdentityVerificationSchema.index({ clientProfileId: 1, createdAt: -1 });
IdentityVerificationSchema.index({ imagesPurgeAfter: 1 }, { partialFilterExpression: { imagesPurgedAt: null } });

export const InsurancePolicySchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  priority: { type: String, enum: ["PRIMARY", "SECONDARY", "TERTIARY"], required: true },
  payerName: { type: String, required: true },
  payerId: String,
  planName: String,
  memberId: encrypted(true),
  memberIdLast4: { type: String, maxlength: 4, required: true },
  groupNumber: String,
  subscriber: {
    relationship: { type: String, default: "SELF" },
    name: String,
    dateOfBirth: encrypted(),
  },
  effectiveOn: Date,
  terminatesOn: Date,
  cardFrontDocumentId: ref("Document", false),
  cardBackDocumentId: ref("Document", false),
  eligibilityCheckedAt: Date,
  eligibilityCheckedBy: ref("User", false),
  active: { type: Boolean, default: true },
}, opts);
InsurancePolicySchema.index(
  { clientProfileId: 1, priority: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

export const ResponsiblePartySchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  type: { type: String, enum: ["SELF", "GUARDIAN", "OTHER_PERSON", "ORGANIZATION"], required: true },
  fullName: String,
  organizationName: String,
  relationship: String,
  email: { type: String, lowercase: true },
  phone: e164,
  billingAddress: Address,
  stripeCustomerId: String,
  isDefault: { type: Boolean, default: true },
}, opts);
ResponsiblePartySchema.index({ clientProfileId: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });
ResponsiblePartySchema.index({ stripeCustomerId: 1 }, { unique: true, partialFilterExpression: { stripeCustomerId: { $type: "string" } } });

// ── Intake engine ───────────────────────────────────────────────────────────
export const IntakeFormSchema = new Schema({
  key: { type: String, required: true },           // 'demographics', 'residency', …
  title: { type: String, required: true },
  description: String,
  module: { type: String, enum: ["DEMOGRAPHICS", "CONTACTS", "RESIDENCY", "IDENTITY", "INSURANCE", "AVATAR", "CUSTOM"], required: true },
  isRequired: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdBy: ref("User", false),
  archivedAt: Date,
}, opts);
IntakeFormSchema.index({ key: 1 }, { unique: true });

// Immutable once PUBLISHED (enforced in the repository layer + DB role cannot
// update published docs via a filtered update path).
export const IntakeFormVersionSchema = new Schema({
  formId: ref("IntakeForm"),
  version: { type: Number, required: true, min: 1 },
  jsonSchema: { type: Schema.Types.Mixed, required: true }, // JSON Schema 2020-12 → Zod at runtime
  uiSchema: { type: Schema.Types.Mixed, default: {} },      // steps, widgets, x-sensitive / x-upload flags
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "RETIRED"], default: "DRAFT" },
  publishedBy: ref("User", false),
  publishedAt: Date,
}, opts);
IntakeFormVersionSchema.index({ formId: 1, version: 1 }, { unique: true });
IntakeFormVersionSchema.index({ formId: 1 }, { unique: true, partialFilterExpression: { status: "PUBLISHED" } });

export const IntakeSubmissionSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  formVersionId: ref("IntakeFormVersion"),
  status: {
    type: String,
    enum: ["DRAFT", "SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED"],
    default: "DRAFT",
  },
  data: { type: Schema.Types.Mixed, default: {} },  // x-sensitive answers stored as Binary ciphertext
  currentStep: { type: Number, default: 0 },
  revision: { type: Number, default: 0 },           // optimistic concurrency for autosave
  lastSavedAt: Date,
  assignedBy: ref("User", false),
  dueOn: Date,
  submittedAt: Date,
  submittedBy: ref("User", false),
  reviewedBy: ref("User", false),
  reviewedAt: Date,
  reviewNotes: String,
  promotedAt: Date,                                  // answers written to relational collections
}, { ...opts, minimize: false });
IntakeSubmissionSchema.index({ clientProfileId: 1, status: 1 });
IntakeSubmissionSchema.index({ status: 1, submittedAt: 1 }); // review queue

// ── Documents (metadata only; bytes in private S3, SSE-KMS) ─────────────────
export const DocumentSchema = new Schema({
  clientProfileId: ref("ClientProfile", false),     // null = org template
  category: { type: String, enum: DOCUMENT_CATEGORIES, required: true },
  status: {
    type: String,
    enum: ["PENDING_UPLOAD", "SCANNING", "AVAILABLE", "QUARANTINED", "APPROVED", "REJECTED", "PURGED"],
    default: "PENDING_UPLOAD",
  },
  bucket: { type: String, enum: ["CLIENT_DOCS", "IDENTITY", "AVATARS", "SIGNED_RECORDS"], required: true },
  objectKey: { type: String, required: true },      // '{clientId}/{documentId}', never a filename
  originalFilename: encrypted(),                    // filenames often contain names/diagnoses
  mimeType: { type: String, required: true },
  byteSize: { type: Number, min: 1, max: 25 * 1024 * 1024 },
  sha256: String,                                   // hex; set after scan, binds signatures to bytes
  versionGroupId: { type: Schema.Types.ObjectId, required: true },
  version: { type: Number, default: 1, min: 1 },
  intakeSubmissionId: ref("IntakeSubmission", false),
  uploadedBy: ref("User"),
  reviewedBy: ref("User", false),
  reviewedAt: Date,
  reviewNote: String,
  retentionUntil: Date,
  purgedAt: Date,
}, opts);
DocumentSchema.index({ objectKey: 1 }, { unique: true });
DocumentSchema.index({ versionGroupId: 1, version: 1 }, { unique: true });
DocumentSchema.index({ clientProfileId: 1, category: 1, createdAt: -1 });
DocumentSchema.index({ status: 1, createdAt: 1 });  // review queue
DocumentSchema.index({ retentionUntil: 1 }, { partialFilterExpression: { purgedAt: null } });
DocumentSchema.pre("validate", function () {
  if (this.reviewedBy && this.reviewedBy.equals(this.uploadedBy)) {
    throw new Error("A document cannot be reviewed by its uploader");
  }
});

// ── E-signatures (ESIGN / UETA evidence record) ─────────────────────────────
export const SignatureRequestSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  documentId: ref("Document"),                      // exact version
  documentSha256: { type: String, required: true }, // snapshot at request time
  signerUserId: ref("User"),
  requestedBy: ref("User"),
  status: { type: String, enum: ["PENDING", "SIGNED", "DECLINED", "EXPIRED", "CANCELED"], default: "PENDING" },
  message: String,
  expiresAt: { type: Date, required: true },
}, opts);
SignatureRequestSchema.index({ signerUserId: 1, status: 1 });
SignatureRequestSchema.index({ clientProfileId: 1, createdAt: -1 });

// Write-once: the runtime DB role has insert/find only on this collection;
// the signed-record PDF pointer is written by a separate worker role.
export const ElectronicSignatureSchema = new Schema({
  signatureRequestId: ref("SignatureRequest"),
  clientProfileId: ref("ClientProfile"),
  documentId: ref("Document"),
  documentSha256: { type: String, required: true }, // must equal request.documentSha256
  signerUserId: ref("User"),
  signerTypedName: { type: String, required: true },
  method: { type: String, enum: ["DRAWN", "TYPED"], required: true },
  signatureImageDocumentId: ref("Document", false),
  signatureImageSha256: String,
  esignConsentVersion: { type: String, required: true },
  intentStatement: { type: String, required: true }, // exact attestation text shown
  authContext: {
    sessionId: { type: String, required: true },
    mfa: { type: Boolean, required: true },
    stepUpAt: Date,
    method: String,
  },
  ipAddress: { type: String, required: true },
  userAgent: { type: String, required: true },
  signedAt: { type: Date, default: Date.now },
  signedRecordDocumentId: ref("Document", false),   // flattened PDF + certificate page
  signedRecordSha256: String,
  recordHash: { type: String, required: true },     // sha256 over canonical JSON of the evidence
});
ElectronicSignatureSchema.index({ signatureRequestId: 1 }, { unique: true });
ElectronicSignatureSchema.index({ signerUserId: 1, signedAt: -1 });
ElectronicSignatureSchema.index({ clientProfileId: 1, signedAt: -1 });

export const ConsentSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  kind: {
    type: String,
    enum: ["ESIGN_DISCLOSURE", "PRIVACY_NOTICE_ACK", "TREATMENT", "TELEHEALTH", "RELEASE_OF_INFORMATION"],
    required: true,
  },
  version: { type: String, required: true },
  grantedBy: ref("User"),
  grantedAt: { type: Date, default: Date.now },
  signatureId: ref("ElectronicSignature", false),
  revokedAt: Date,
  revokedBy: ref("User", false),
});
ConsentSchema.index({ clientProfileId: 1, kind: 1, grantedAt: -1 });

// ── Scheduling ──────────────────────────────────────────────────────────────
export const AppointmentTypeSchema = new Schema({
  key: { type: String, required: true },
  name: { type: String, required: true },
  durationMinutes: { type: Number, min: 5, max: 480, required: true },
  defaultModality: { type: String, enum: ["IN_PERSON", "VIDEO", "PHONE"], required: true },
  clientBookable: { type: Boolean, default: false },
  priceCents: { type: Number, min: 0 },
  active: { type: Boolean, default: true },
});
AppointmentTypeSchema.index({ key: 1 }, { unique: true });

export const StaffAvailabilitySchema = new Schema({
  staffUserId: ref("User"),
  weekly: [{
    _id: false,
    weekday: { type: Number, min: 0, max: 6, required: true },
    start: { type: String, match: /^\d{2}:\d{2}$/, required: true },
    end: { type: String, match: /^\d{2}:\d{2}$/, required: true },
  }],
  timezone: { type: String, required: true },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: Date,
  exceptions: [{ _id: false, startsAt: Date, endsAt: Date, reason: String }],
}, opts);
StaffAvailabilitySchema.index({ staffUserId: 1, effectiveFrom: -1 });

export const AppointmentSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  staffUserId: ref("User"),
  appointmentTypeId: ref("AppointmentType"),
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  status: {
    type: String,
    enum: ["REQUESTED", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELED", "NO_SHOW"],
    default: "REQUESTED",
  },
  modality: { type: String, enum: ["IN_PERSON", "VIDEO", "PHONE"], required: true },
  location: String,
  videoRoomId: String,
  clientNote: encrypted(),                          // reason for visit; hidden from billing
  bookedBy: ref("User"),
  canceledBy: ref("User", false),
  canceledAt: Date,
  cancelReason: String,
}, opts);
AppointmentSchema.index({ clientProfileId: 1, startsAt: -1 });
AppointmentSchema.index({ staffUserId: 1, startsAt: 1 });

// Double-booking guard (MongoDB has no exclusion constraints): one document per
// 15-minute slot, inserted in the same transaction as the appointment. The
// unique index makes a conflicting booking fail atomically. Deleted on cancel.
export const AppointmentSlotSchema = new Schema({
  staffUserId: ref("User"),
  slotStart: { type: Date, required: true },
  appointmentId: ref("Appointment"),
});
AppointmentSlotSchema.index({ staffUserId: 1, slotStart: 1 }, { unique: true });
AppointmentSlotSchema.index({ appointmentId: 1 });

// ── Secure messaging ────────────────────────────────────────────────────────
export const MessageThreadSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  category: { type: String, enum: ["GENERAL", "CARE", "BILLING", "INTAKE"], default: "GENERAL" },
  subject: { type: String, required: true, maxlength: 140 },
  participants: [{
    _id: false,
    userId: ref("User"),
    lastReadAt: Date,
    addedAt: { type: Date, default: Date.now },
  }],
  createdBy: ref("User"),
  lastMessageAt: Date,
  closedAt: Date,
}, opts);
MessageThreadSchema.index({ clientProfileId: 1, lastMessageAt: -1 });
MessageThreadSchema.index({ "participants.userId": 1, lastMessageAt: -1 });

export const MessageSchema = new Schema({
  threadId: ref("MessageThread"),
  senderUserId: ref("User"),
  body: encrypted(true),
  attachmentDocumentIds: [ref("Document")],
  redactedAt: Date,                                 // never edited; admins may redact (audited)
  redactedBy: ref("User", false),
}, { timestamps: { createdAt: true, updatedAt: false } });
MessageSchema.index({ threadId: 1, createdAt: 1 });

// ── Session notes (most restricted collection) ──────────────────────────────
export const SessionNoteSchema = new Schema({
  clientProfileId: ref("ClientProfile"),
  appointmentId: ref("Appointment", false),
  authorUserId: ref("User"),
  status: { type: String, enum: ["DRAFT", "SIGNED", "AMENDED"], default: "DRAFT" },
  body: encrypted(true),
  signedAt: Date,
  cosignedBy: ref("User", false),
  cosignedAt: Date,
  amendsNoteId: ref("SessionNote", false),
}, opts);
SessionNoteSchema.index({ clientProfileId: 1, createdAt: -1 });
SessionNoteSchema.index(
  { appointmentId: 1 },
  { unique: true, partialFilterExpression: { appointmentId: { $type: "objectId" }, amendsNoteId: null } },
);

// ── Billing (Stripe is processor of record; no card data stored) ────────────
export const InvoiceSchema = new Schema({
  number: { type: String, required: true },         // 'INV-0000123' from counters collection
  clientProfileId: ref("ClientProfile"),
  responsiblePartyId: ref("ResponsibleParty"),
  status: { type: String, enum: ["DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE"], default: "DRAFT" },
  currency: { type: String, default: "usd" },
  lineItems: [{
    appointmentId: ref("Appointment", false),
    serviceCode: String,                              // internal or CPT/HCPCS
    description: { type: String, required: true },   // generic service name; never diagnoses
    quantity: { type: Number, min: 1, default: 1 },
    unitAmountCents: { type: Number, min: 0, required: true },
  }],
  subtotalCents: { type: Number, min: 0, default: 0 },
  taxCents: { type: Number, min: 0, default: 0 },
  totalCents: { type: Number, min: 0, default: 0 },
  amountPaidCents: { type: Number, min: 0, default: 0 },
  issuedAt: Date,
  dueOn: Date,
  paidAt: Date,
  voidedAt: Date,
  voidedBy: ref("User", false),
  voidReason: String,
  stripeInvoiceId: String,
  createdBy: ref("User"),
}, opts);
InvoiceSchema.index({ number: 1 }, { unique: true });
InvoiceSchema.index({ stripeInvoiceId: 1 }, { unique: true, partialFilterExpression: { stripeInvoiceId: { $type: "string" } } });
InvoiceSchema.index({ clientProfileId: 1, createdAt: -1 });
InvoiceSchema.index({ status: 1, dueOn: 1 });
InvoiceSchema.pre("validate", function () {
  const subtotal = this.lineItems.reduce((s, li) => s + (li.quantity ?? 1) * li.unitAmountCents, 0);
  this.subtotalCents = subtotal;
  this.totalCents = subtotal + (this.taxCents ?? 0);
});

export const PaymentSchema = new Schema({
  invoiceId: ref("Invoice"),
  stripePaymentIntentId: { type: String, required: true },
  amountCents: { type: Number, min: 1, required: true },
  refundedCents: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ["PENDING", "SUCCEEDED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"], required: true },
  cardBrand: String,
  cardLast4: { type: String, maxlength: 4 },
  receivedAt: Date,
}, opts);
PaymentSchema.index({ stripePaymentIntentId: 1 }, { unique: true });
PaymentSchema.index({ invoiceId: 1 });

// Webhook idempotency: insert first; duplicate-key error = already handled.
export const StripeEventSchema = new Schema({
  _id: String,                                      // evt_…
  type: { type: String, required: true },
  receivedAt: { type: Date, default: Date.now },
  processedAt: Date,
  error: String,
});

// ── Public-site intake (pre-account; treated as PHI) ────────────────────────
export const InquirySchema = new Schema({
  kind: { type: String, enum: ["CONTACT", "SERVICE_REQUEST"], required: true },
  fullName: { type: String, required: true },
  email: { type: String, lowercase: true, required: true },
  phone: e164,
  preferredContact: String,
  servicesInterested: [String],
  message: encrypted(),
  status: { type: String, enum: ["NEW", "CONTACTED", "CONVERTED", "CLOSED", "SPAM"], default: "NEW" },
  assignedTo: ref("User", false),
  convertedClientProfileId: ref("ClientProfile", false),
  source: String,
  utm: { type: Schema.Types.Mixed },
  ipAddress: String,
}, opts);
InquirySchema.index({ status: 1, createdAt: -1 });

// EmailSubscriber (existing waitlist model) is kept as-is.

// ── Configuration ───────────────────────────────────────────────────────────
export const RetentionPolicySchema = new Schema({
  _id: { type: String, enum: DOCUMENT_CATEGORIES }, // category is the id
  retainDays: { type: Number, min: 1, required: true },
  startsOn: { type: String, enum: ["AFTER_UPLOAD", "AFTER_VERIFICATION", "AFTER_DISCHARGE"], required: true },
  updatedBy: ref("User", false),
}, opts);

export const SystemSettingSchema = new Schema({
  _id: String,                                      // 'session.idle_timeout_minutes'
  value: { type: Schema.Types.Mixed, required: true },
  isSecurity: { type: Boolean, default: false },    // SUPER_ADMIN-only
  updatedBy: ref("User", false),
}, opts);

// Atomic sequences for client numbers and invoice numbers ($inc, upsert).
export const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });

// ── Audit log: append-only, hash-chained ────────────────────────────────────
// Runtime DB role: insert + find only (no update/remove/drop). Each insert
// runs in a transaction that advances the single AuditChainHead document,
// so concurrent writers serialize via write-conflict retry.
export const AuditLogSchema = new Schema({
  seq: { type: Number, required: true },
  at: { type: Date, default: Date.now },
  actorType: { type: String, enum: ["USER", "SYSTEM", "WEBHOOK"], required: true },
  actorUserId: { type: Schema.Types.ObjectId },     // deliberately no ref; outlives targets
  actorRoles: [{ type: String, enum: ROLE_KEYS }],
  sessionId: String,
  action: { type: String, required: true },         // 'document.download', 'pii.reveal', …
  targetType: { type: String, required: true },
  targetId: String,
  clientProfileId: { type: Schema.Types.ObjectId }, // whose data (accounting of disclosures)
  outcome: { type: String, enum: ["SUCCESS", "DENIED", "ERROR"], required: true },
  reason: String,                                   // required for break-glass and PII reveal
  ipAddress: String,
  userAgent: String,
  requestId: String,
  metadata: { type: Schema.Types.Mixed, default: {} }, // field names changed, never values
  prevHash: String,
  hash: { type: String, required: true },
}, { versionKey: false });
AuditLogSchema.index({ seq: 1 }, { unique: true });
AuditLogSchema.index({ clientProfileId: 1, at: -1 });
AuditLogSchema.index({ actorUserId: 1, at: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1 });
AuditLogSchema.index({ action: 1, at: -1 });

export const AuditChainHeadSchema = new Schema({
  _id: { type: String, default: "head" },
  seq: { type: Number, required: true },
  hash: { type: String, required: true },
});

export type Id = Types.ObjectId;
```

## Transaction boundaries

These operations must be single multi-document transactions (`session.withTransaction`, which retries on write conflicts):

| Operation | Documents written together |
|---|---|
| Book / reschedule appointment | Appointment + all AppointmentSlots for its 15-min slots (cancel deletes the slots) |
| Append audit entry | AuditLog insert + AuditChainHead `{seq, hash}` compare-and-set |
| Sign document | ElectronicSignature insert + SignatureRequest → SIGNED + Consent (first signature) + AuditLog |
| Approve intake submission | Submission → APPROVED + promoted EmergencyContact / NextOfKin / Residence / InsurancePolicy / … + ClientStageEvent |
| Stage change | ClientProfile.stage + ClientStageEvent |
| Stripe webhook | StripeEvent insert + Payment + Invoice totals/status |

## Seed data (Phase 2)

- `roles`: the 7 roles with `rank` (SA 100, AD 80, SUP 60, PRA/INT/BIL 40, CLI 10) and `mfaRequired` (all staff).
- `systemsettings`: `session.idle_timeout_minutes` `{staff: 15, client: 15}`, `session.absolute_lifetime_hours` `{staff: 10, client: 12}`, `session.step_up_window_minutes` `5`, `storage.download_url_ttl_seconds` `60`.
- `retentionpolicies`: IDENTITY 30 days after verification; CLINICAL/SIGNED_RECORD/CONSENT 2,555 days (7 years) after discharge; others per counsel.
- `intakeforms` + first published versions for the six modules: Demographics, Contacts, Residency, Identity, Insurance & Billing, Avatar.

import { randomBytes } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { recordAudit } from "@/lib/audit";
import { getAuth } from "@/lib/auth";
import { blindIndex, ENC, encrypt, encryptJson, last4 } from "@/lib/crypto";
import { authorizeDoc, createScoped, systemToken } from "@/lib/db/phi-guard";
import type { Role } from "@/lib/rbac";
import { buildSignature, noteSigningContent, sha256 } from "@/lib/signatures";
import {
  Allergy,
  Appointment,
  AppointmentSlot,
  Claim,
  ClinicalDocument,
  ClinicalNote,
  ComplianceRecord,
  ConsentTemplate,
  Counter,
  Diagnosis,
  HealthAssessment,
  InsurancePolicy,
  Invoice,
  MedicalCode,
  Medication,
  MessageThread,
  Patient,
  ProviderSchedule,
  RemittanceAdvice,
  SecureMessage,
  SignedConsent,
  slotStartsFor,
  StaffProfile,
  VisitSurvey,
  TelehealthSession,
  TreatmentPlan,
  WaitlistEntry,
} from "@/models";

/**
 * Development dataset for the six end-to-end use cases. Everything here is
 * fictitious: names, contact details, SSNs (900-series, never issued),
 * member IDs, and the NPI (CMS's published example, 1234567893). Staff and
 * patient emails use example.com so no message can reach a real inbox.
 *
 * Corrections to the original brief's data: a PsyD's initial evaluation is
 * billed as CPT 90791 (99204 is an E/M code for physicians/NPs/PAs), and the
 * Use Case 3 remittance balances: $125 paid + $35 contractual + $50 patient = $210.
 */

const SEED = systemToken("seed-emr");
const id = (hex: string) => new Types.ObjectId(hex);
const at = (iso: string) => new Date(iso);
const IP = { elena: "203.0.113.44", david: "203.0.113.71", sofia: "203.0.113.90", thorne: "198.51.100.12", office: "198.51.100.10" }; // RFC 5737 documentation ranges

export const IDS = {
  staff: { thorne: id("673000000000000000000001"), marcus: id("673000000000000000000002"), camila: id("673000000000000000000003"), priya: id("673000000000000000000004"), ellis: id("673000000000000000000005") },
  patients: { elena: id("673100000000000000000001"), david: id("673100000000000000000002"), sofia: id("673100000000000000000003") },
  appointments: { elenaInitial: id("673200000000000000000001"), davidCancelled: id("673200000000000000000002"), elenaFollowUp: id("673200000000000000000003"), davidEarlier: id("673200000000000000000004") },
  notes: { elenaSoap: id("673300000000000000000001"), davidProgress: id("673300000000000000000002") },
  claims: { elena: id("673400000000000000000001"), david: id("673400000000000000000002") },
};

// ── Accounts ────────────────────────────────────────────────────────────────

interface SeedUser {
  key: string;
  name: string;
  email: string;
  role: Role;
}

export const SEED_USERS: SeedUser[] = [
  { key: "camila", name: "Camila Reyes", email: "admin@example.com", role: "SUPER_ADMIN" },
  { key: "thorne", name: "Dr. Aris Thorne", email: "aris.thorne@example.com", role: "PROVIDER" },
  { key: "ellis", name: "Jordan Ellis", email: "jordan.ellis@example.com", role: "PROVIDER" },
  { key: "marcus", name: "Marcus Bell", email: "billing@example.com", role: "BILLING_STAFF" },
  { key: "priya", name: "Priya Shah", email: "frontdesk@example.com", role: "FRONT_DESK" },
  { key: "elena", name: "Elena Vance", email: "elena.vance@example.com", role: "PATIENT" },
  { key: "david", name: "David Morales", email: "david.morales@example.com", role: "PATIENT" },
  { key: "sofia", name: "Sofia Lin", email: "sofia.lin@example.com", role: "PATIENT" },
];

async function createAccounts(password: string) {
  const ctx = await getAuth().$context;
  const hash = await ctx.password.hash(password);
  const userIds: Record<string, string> = {};
  for (const user of SEED_USERS) {
    const created = await ctx.internalAdapter.createUser({
      name: user.name,
      email: user.email,
      emailVerified: true,
      role: user.role,
      status: "ACTIVE",
    }, { method: "admin" });
    await ctx.internalAdapter.linkAccount({ providerId: "credential", accountId: created.id, userId: created.id, password: hash });
    userIds[user.key] = created.id;
  }
  return userIds;
}

/** Remove seeded accounts (and their sessions, credentials, 2FA records). */
async function deleteSeedAccounts() {
  const db = mongoose.connection.db!;
  const users = await db.collection("user").find({ email: { $in: SEED_USERS.map((u) => u.email) } }, { projection: { _id: 1 } }).toArray();
  const ids = users.map((u) => u._id);
  if (ids.length === 0) return;
  for (const collection of ["session", "account", "twoFactor"]) {
    await db.collection(collection).deleteMany({ userId: { $in: ids } });
  }
  await db.collection("user").deleteMany({ _id: { $in: ids } });
}

// ── Reference data ──────────────────────────────────────────────────────────

// Short descriptors written for this project. CPT is AMA-licensed: load the
// official code set only under a license (scripts/import-icd10.ts covers ICD-10-CM).
export const MEDICAL_CODES = [
  ["ICD10CM", "F41.1", "Generalized anxiety disorder", 0],
  ["ICD10CM", "F41.9", "Anxiety disorder, unspecified", 0],
  ["ICD10CM", "F32.0", "Major depressive disorder, single episode, mild", 0],
  ["ICD10CM", "F32.1", "Major depressive disorder, single episode, moderate", 0],
  ["ICD10CM", "F33.1", "Major depressive disorder, recurrent, moderate", 0],
  ["ICD10CM", "F43.10", "Post-traumatic stress disorder, unspecified", 0],
  ["ICD10CM", "F43.20", "Adjustment disorder, unspecified", 0],
  ["ICD10CM", "F43.23", "Adjustment disorder with mixed anxiety and depressed mood", 0],
  ["ICD10CM", "F10.20", "Alcohol dependence, uncomplicated", 0],
  ["ICD10CM", "F51.01", "Primary insomnia", 0],
  ["ICD10CM", "Z73.0", "Burn-out", 0],
  ["ICD10CM", "Z59.00", "Homelessness, unspecified", 0],
  ["ICD10CM", "Z59.819", "Housing instability, housed, unspecified", 0],
  ["ICD10CM", "Z56.6", "Other physical and mental strain related to work", 0],
  ["ICD10CM", "Z63.0", "Problems in relationship with spouse or partner", 0],
  ["ICD10CM", "E66.9", "Obesity, unspecified", 0],
  ["CPT", "90791", "Psychiatric diagnostic evaluation", 21000],
  ["CPT", "90832", "Psychotherapy, 30 minutes", 9500],
  ["CPT", "90834", "Psychotherapy, 45 minutes", 15500],
  ["CPT", "90837", "Psychotherapy, 60 minutes", 18500],
  ["CPT", "90846", "Family psychotherapy without patient", 15000],
  ["CPT", "90847", "Family psychotherapy with patient", 16000],
  ["CPT", "96127", "Brief emotional/behavioral assessment", 2500],
  ["CPT", "99204", "New patient office visit, moderate complexity", 21000],
  ["CPT", "99214", "Established patient office visit, moderate complexity", 16500],
  ["CPT", "97802", "Medical nutrition therapy, initial, each 15 min", 6500],
  ["HCPCS", "G0447", "Behavioral counseling for obesity, 15 minutes", 5500],
  ["HCPCS", "H0004", "Behavioral health counseling, per 15 minutes", 3000],
  ["HCPCS", "H0031", "Mental health assessment by non-physician", 9000],
] as const;

const DRAFT_NOTICE = "> DRAFT FOR DEVELOPMENT. This text must be replaced with counsel-approved language before use with real patients.\n\n";

export const CONSENT_TEMPLATES = [
  {
    type: "HIPAA_PRIVACY_NOTICE",
    version: "v2.1-2026",
    title: "Notice of Privacy Practices Acknowledgment",
    body: "I acknowledge that I have received and had the opportunity to read AB Wellness Consulting's Notice of Privacy Practices, which describes how my health information may be used and disclosed and how I can access it.",
    renewalDays: null,
  },
  {
    type: "CONSENT_FOR_TREATMENT",
    version: "v1.2-2026",
    title: "General Consent for Services",
    body: "I consent to receive services from AB Wellness Consulting. I understand the nature of the services, that I may ask questions at any time, and that I may withdraw consent in writing.",
    renewalDays: 365,
  },
  {
    type: "TELEHEALTH_CONSENT",
    version: "v1.4-2026",
    title: "Telehealth Informed Consent",
    body: "I consent to receive services by secure video. I understand the benefits and limits of telehealth, that sessions are not recorded without my permission, and that I should join from a private location.",
    renewalDays: 365,
  },
  {
    type: "FINANCIAL_RESPONSIBILITY",
    version: "v1.0-2026",
    title: "Financial Responsibility and Cancellation Policy",
    body: "I am responsible for copays, deductibles, coinsurance, and any balance not paid by insurance. Appointments cancelled with less than 24 hours' notice, or missed, may incur a $75.00 fee.",
    renewalDays: 365,
    terms: { lateCancellationHours: 24, lateCancellationFeeCents: 7500, noShowFeeCents: 7500 },
  },
  {
    type: "RELEASE_OF_INFORMATION",
    version: "v1.0-2026",
    title: "Authorization to Release Information",
    body: "I authorize AB Wellness Consulting to disclose the information described below to the recipient named, for the purpose stated, until the expiration date. I may revoke this authorization in writing at any time.",
    renewalDays: null,
  },
] as const;

// ── Seeding ─────────────────────────────────────────────────────────────────

const EMR_COLLECTIONS = [
  StaffProfile, Patient, HealthAssessment, ClinicalNote, Diagnosis, TreatmentPlan, Medication, Allergy, ClinicalDocument,
  MedicalCode, InsurancePolicy, Claim, RemittanceAdvice, Invoice, ConsentTemplate, SignedConsent, ComplianceRecord,
  ProviderSchedule, Appointment, AppointmentSlot, WaitlistEntry, MessageThread, SecureMessage, TelehealthSession, VisitSurvey,
].map((model) => model.collection.collectionName);

/** Drop EMR collections and seeded accounts (development databases only; the guard runs first). */
export async function resetEmrData() {
  const db = mongoose.connection.db!;
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of [...EMR_COLLECTIONS, "auditlogs", "paymenttransactions", "paymentplans"]) {
    if (existing.has(name)) await db.dropCollection(name);
  }
  await Counter.deleteMany({ _id: { $regex: "^(mrn|claim|invoice|receipt):" } });
  await deleteSeedAccounts();
}

export async function isSeeded() {
  return (await Patient.countDocuments({ _id: IDS.patients.elena }).setOptions({ authz: SEED })) > 0;
}

export interface SeedResult {
  password: string;
  counts: Record<string, number>;
}

export async function seedEmr(options: { password?: string } = {}): Promise<SeedResult> {
  const password = options.password ?? randomBytes(12).toString("base64url");
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));

  const userIds = await createAccounts(password);
  const user = (key: string) => new Types.ObjectId(userIds[key]);
  const signer = (key: string, role: string, name: string) => ({ signerId: userIds[key], signerName: name, signerRole: role });

  // Staff profiles & schedules
  await StaffProfile.create([
    { _id: IDS.staff.camila, userId: user("camila"), displayName: "Camila Reyes", credentials: "Practice Administrator" },
    {
      _id: IDS.staff.thorne,
      userId: user("thorne"),
      displayName: "Dr. Aris Thorne, PsyD",
      credentials: "PsyD",
      npi: "1234567893",
      specialty: "Behavioral Health & Integrative Wellness",
      licenses: [{ type: "Psychologist", number: "TEST-000000", state: "NY", expiresOn: at("2028-06-30") }],
    },
    { _id: IDS.staff.ellis, userId: user("ellis"), displayName: "Jordan Ellis, LCSW", credentials: "LCSW", specialty: "Housing & Community Services" },
    { _id: IDS.staff.marcus, userId: user("marcus"), displayName: "Marcus Bell, CPC", credentials: "CPC" },
    { _id: IDS.staff.priya, userId: user("priya"), displayName: "Priya Shah", credentials: "Patient Services" },
  ]);
  await ProviderSchedule.create({
    providerId: IDS.staff.thorne,
    timezone: "America/New_York",
    weeklyAvailability: [
      { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", mode: "HYBRID" },
      { dayOfWeek: 3, startTime: "10:00", endTime: "18:00", mode: "VIRTUAL" },
      { dayOfWeek: 5, startTime: "09:00", endTime: "15:00", mode: "IN_PERSON" },
    ],
    bufferMinutes: 10,
    visitTypes: [
      { key: "initial-evaluation", name: "Initial evaluation", durationMinutes: 50, modes: ["IN_PERSON", "VIRTUAL"], patientBookable: false },
      { key: "therapy-45", name: "Session (45 min)", durationMinutes: 45, modes: ["IN_PERSON", "VIRTUAL"], patientBookable: true },
      { key: "therapy-60", name: "Session (60 min)", durationMinutes: 60, modes: ["IN_PERSON", "VIRTUAL"], patientBookable: true },
    ],
  });
  await ProviderSchedule.create({
    providerId: IDS.staff.ellis,
    weeklyAvailability: [
      { dayOfWeek: 2, startTime: "09:00", endTime: "17:00", mode: "HYBRID" },
      { dayOfWeek: 4, startTime: "09:00", endTime: "17:00", mode: "HYBRID" },
    ],
    visitTypes: [{ key: "housing-consult", name: "Housing stabilization consult", durationMinutes: 45, modes: ["IN_PERSON", "VIRTUAL"], patientBookable: true }],
  });

  // Reference data
  await MedicalCode.create(MEDICAL_CODES.map(([system, code, description, fee]) => ({ system, code, description, defaultFeeCents: fee })));
  const templates: Record<string, InstanceType<typeof ConsentTemplate>> = {};
  for (const t of CONSENT_TEMPLATES) {
    const bodyMarkdown = DRAFT_NOTICE + t.body;
    templates[t.type] = await ConsentTemplate.create({
      type: t.type,
      version: t.version,
      title: t.title,
      bodyMarkdown,
      contentHash: sha256(bodyMarkdown),
      status: "PUBLISHED",
      effectiveDate: at("2026-08-01"),
      renewalDays: t.renewalDays,
      terms: "terms" in t ? t.terms : undefined,
      publishedBy: user("camila"),
      publishedAt: at("2026-08-01"),
    });
  }

  // Patients
  const patient = (key: "elena" | "david" | "sofia", data: Record<string, unknown>, ssn: string) =>
    createScoped(Patient, SEED, {
      _id: IDS.patients[key],
      userId: user(key),
      ssnEnc: encrypt(ssn, ENC.patientSsn),
      ssnLast4: last4(ssn),
      ssnHash: blindIndex(ssn, ENC.patientSsn),
      portalInvitedAt: data.registeredAt,
      ...data,
    });
  await patient("elena", {
    mrn: "ABW-2026-0001", firstName: "Elena", lastName: "Vance", dob: at("1989-04-18"), gender: "Female", sexAtBirth: "FEMALE", pronouns: "she/her",
    email: "elena.vance@example.com", phone: "+12125550148", address: { street: "412 W 42nd St", street2: "Apt 9B", city: "New York", state: "NY", zip: "10036" },
    emergencyContacts: [{ name: "Marisol Vance", relationship: "Sister", phone: "+12125550177", isNextOfKin: true, mayDisclosePhi: true }],
    assignedProviderId: IDS.staff.thorne, referralSource: "PROVIDER_REFERRAL", registeredAt: at("2026-11-09T17:55:00Z"),
  }, "900-12-3401");
  await patient("david", {
    mrn: "ABW-2026-0002", firstName: "David", lastName: "Morales", dob: at("1978-11-02"), gender: "Male", sexAtBirth: "MALE", preferredLanguage: "es",
    email: "david.morales@example.com", phone: "+17185550192", address: { street: "88-15 Queens Blvd", city: "Elmhurst", state: "NY", zip: "11373" },
    emergencyContacts: [{ name: "Ana Morales", relationship: "Spouse", phone: "+17185550193", isNextOfKin: true, mayDisclosePhi: true }],
    assignedProviderId: IDS.staff.thorne, referralSource: "INSURANCE", registeredAt: at("2026-10-20T13:00:00Z"),
  }, "900-12-3402");
  await patient("sofia", {
    mrn: "ABW-2026-0003", firstName: "Sofia", lastName: "Lin", dob: at("1994-07-09"), gender: "Female", sexAtBirth: "FEMALE",
    email: "sofia.lin@example.com", phone: "+13475550116", address: { street: "150 Lafayette St", city: "New York", state: "NY", zip: "10013" },
    assignedProviderId: IDS.staff.ellis, referralSource: "COMMUNITY_PARTNER", registeredAt: at("2026-11-12T16:20:00Z"),
  }, "900-12-3403");
  await Counter.updateOne({ _id: "mrn:2026" }, { $max: { seq: 3 } }, { upsert: true });

  // Documents (metadata only; files are placeholders in development)
  const doc = async (category: string, fileName: string, mimeType: string, uploadedAt: string) => {
    const documentId = new Types.ObjectId();
    const key = `${IDS.patients.elena}/${documentId}`;
    return createScoped(ClinicalDocument, SEED, {
      _id: documentId, patientId: IDS.patients.elena, category, storage: { provider: "LOCAL", key },
      fileNameEnc: encrypt(fileName, ENC.documentFileName), mimeType, byteSize: 240_000, sha256: sha256(key),
      status: "AVAILABLE", uploadedBy: user("elena"), uploadedByRole: "PATIENT", createdAt: at(uploadedAt),
    });
  };
  await doc("GOVERNMENT_ID", "drivers-license.jpg", "image/jpeg", "2026-11-09T18:02:00Z");
  const cardFront = await doc("INSURANCE_CARD_FRONT", "bcbs-front.jpg", "image/jpeg", "2026-11-09T18:03:00Z");
  const cardBack = await doc("INSURANCE_CARD_BACK", "bcbs-back.jpg", "image/jpeg", "2026-11-09T18:03:30Z");
  await doc("REFERRAL", "pcp-referral.pdf", "application/pdf", "2026-11-09T18:05:00Z");

  // Insurance (Elena: after the 11/11 claim, $370 of $500 deductible met)
  const memberId = (value: string) => ({ memberIdEnc: encrypt(value, ENC.insuranceMemberId), memberIdLast4: last4(value), memberIdHash: blindIndex(value, ENC.insuranceMemberId) });
  const elenaPolicy = await createScoped(InsurancePolicy, SEED, {
    patientId: IDS.patients.elena, priority: "PRIMARY", payerName: "BlueCross BlueShield of NY", payerId: "TEST-BCBSNY", planName: "PPO Gold",
    ...memberId("XYZ993847102"), groupNumber: "GRP-88412", copayCents: 3000, deductibleTotalCents: 50000, deductibleMetCents: 37000, coinsurancePercent: 20,
    cardFrontDocumentId: cardFront._id, cardBackDocumentId: cardBack._id,
    eligibility: { status: "VERIFIED", verifiedAt: at("2026-11-10T14:00:00Z"), verifiedBy: user("priya"), reference: "ELIG-TEST-0001" },
  });
  const davidPolicy = await createScoped(InsurancePolicy, SEED, {
    patientId: IDS.patients.david, priority: "PRIMARY", payerName: "Aetna Health", payerId: "TEST-AETNA", planName: "Open Access Managed Choice",
    ...memberId("W44120987"), groupNumber: "GRP-10294", copayCents: 2500, deductibleTotalCents: 100000, deductibleMetCents: 100000, coinsurancePercent: 10,
    eligibility: { status: "VERIFIED", verifiedAt: at("2026-11-12T09:30:00Z"), verifiedBy: user("priya") },
  });

  // Consents: Elena and David signed all four; Sofia signed privacy + financial so far.
  const signConsent = (patientKey: "elena" | "david" | "sofia", name: string, type: string, signedAt: string, ip: string) => {
    const template = templates[type];
    return createScoped(SignedConsent, SEED, {
      patientId: IDS.patients[patientKey], templateId: template._id, consentType: type, version: template.version,
      signature: buildSignature({ content: template.bodyMarkdown, ...signer(patientKey, "PATIENT", name), ipAddress: ip, method: "TYPED", signedAt: at(signedAt), userAgent: "Mozilla/5.0 (seed)" }),
      expiresAt: template.renewalDays ? new Date(at(signedAt).getTime() + template.renewalDays * 86_400_000) : undefined,
    });
  };
  const mandatory = ["HIPAA_PRIVACY_NOTICE", "CONSENT_FOR_TREATMENT", "TELEHEALTH_CONSENT", "FINANCIAL_RESPONSIBILITY"];
  for (const [i, type] of mandatory.entries()) {
    await signConsent("elena", "Elena Vance", type, `2026-11-09T18:1${2 + i}:00Z`, IP.elena);
    await signConsent("david", "David Morales", type, `2026-10-20T13:1${i}:00Z`, IP.david);
  }
  await signConsent("sofia", "Sofia Lin", "HIPAA_PRIVACY_NOTICE", "2026-11-12T16:30:00Z", IP.sofia);
  await signConsent("sofia", "Sofia Lin", "FINANCIAL_RESPONSIBILITY", "2026-11-12T16:31:00Z", IP.sofia);

  // Intake: assessments, medications, allergies
  const assess = (type: string, responses: unknown, score: number, severity: string, completedAt: string, history?: unknown) =>
    createScoped(HealthAssessment, SEED, {
      patientId: IDS.patients.elena, type, responsesEnc: encryptJson(responses, ENC.assessmentResponses),
      historyEnc: history ? encryptJson(history, ENC.assessmentHistory) : undefined,
      score, severity, completedBy: user("elena"), completedByRole: "PATIENT", completedAt: at(completedAt),
    });
  await assess("INTAKE_HISTORY", { reasonForVisit: "Work stress and poor sleep" }, 0, "NONE", "2026-11-09T18:00:00Z", {
    medical: ["Seasonal allergies"], surgical: ["Appendectomy (2008)"], family: ["Mother: hypertension"], social: { alcohol: "Social, 2-3 drinks/week", tobacco: "Never", exercise: "1x/week" },
  });
  await assess("PHQ9", [1, 1, 2, 1, 1, 1, 1, 0, 0], 8, "MILD", "2026-11-09T18:08:00Z");
  await assess("GAD7", [2, 2, 2, 2, 1, 2, 2], 13, "MODERATE", "2026-11-09T18:10:00Z");
  await createScoped(Medication, SEED, { patientId: IDS.patients.elena, name: "Sertraline", dosage: "50 mg", frequency: "Once daily", route: "ORAL", prescriber: "Dr. Primary Care (external)", reportedBy: "PATIENT", recordedById: user("elena") });
  await createScoped(Medication, SEED, { patientId: IDS.patients.david, name: "Metformin", dosage: "500 mg", frequency: "Twice daily", route: "ORAL", reportedBy: "PATIENT", recordedById: user("david") });
  await createScoped(Allergy, SEED, { patientId: IDS.patients.elena, allergen: "Penicillin", reaction: "Hives / rash", severity: "MODERATE", reportedBy: "PATIENT", recordedById: user("elena") });

  // Appointments & telehealth
  const appointment = (data: Record<string, unknown>) => createScoped(Appointment, SEED, { providerId: IDS.staff.thorne, bookedByRole: "FRONT_DESK", bookedBy: user("priya"), ...data });
  await appointment({
    _id: IDS.appointments.elenaInitial, patientId: IDS.patients.elena, visitType: "initial-evaluation", mode: "VIRTUAL",
    scheduledStart: at("2026-11-11T15:00:00Z"), scheduledEnd: at("2026-11-11T15:50:00Z"), status: "COMPLETED",
    reasonEnc: encrypt("Initial evaluation: work stress, sleep", ENC.appointmentReason),
    reminders: [{ kind: "H24", channel: "EMAIL", sentAt: at("2026-11-10T15:00:00Z") }, { kind: "H1", channel: "SMS", sentAt: at("2026-11-11T14:00:00Z") }],
  });
  await appointment({
    _id: IDS.appointments.davidEarlier, patientId: IDS.patients.david, visitType: "therapy-45", mode: "IN_PERSON", location: "Office",
    scheduledStart: at("2026-11-06T14:00:00Z"), scheduledEnd: at("2026-11-06T14:45:00Z"), status: "COMPLETED",
  });
  const lateCancelled = await appointment({
    _id: IDS.appointments.davidCancelled, patientId: IDS.patients.david, visitType: "therapy-45", mode: "IN_PERSON", location: "Office",
    scheduledStart: at("2026-11-13T14:00:00Z"), scheduledEnd: at("2026-11-13T14:45:00Z"), status: "LATE_CANCELLED",
    cancellation: { at: at("2026-11-13T08:00:00Z"), by: user("david"), byRole: "PATIENT", reason: "Work conflict", hoursNotice: 6 },
  });
  const followUp = await appointment({
    _id: IDS.appointments.elenaFollowUp, patientId: IDS.patients.elena, visitType: "therapy-45", mode: "VIRTUAL",
    scheduledStart: at("2026-11-25T15:00:00Z"), scheduledEnd: at("2026-11-25T15:45:00Z"), status: "CONFIRMED",
  });
  await AppointmentSlot.create(slotStartsFor(followUp.scheduledStart, followUp.scheduledEnd).map((slotStart) => ({ providerId: IDS.staff.thorne, slotStart, appointmentId: followUp._id })));

  const completedSession = await createScoped(TelehealthSession, SEED, {
    appointmentId: IDS.appointments.elenaInitial, patientId: IDS.patients.elena, providerId: IDS.staff.thorne, videoProvider: "MOCK",
    roomName: "abw-seed-initial", patientTokenHash: sha256(randomBytes(32).toString("hex")), tokenExpiresAt: at("2026-11-11T16:30:00Z"),
    status: "COMPLETED", waitingSince: at("2026-11-11T14:58:00Z"), admittedAt: at("2026-11-11T15:02:00Z"),
    startedAt: at("2026-11-11T15:02:00Z"), endedAt: at("2026-11-11T15:52:00Z"),
    events: [
      { type: "PATIENT_JOINED_WAITING_ROOM", at: at("2026-11-11T14:58:00Z"), by: user("elena") },
      { type: "ADMITTED", at: at("2026-11-11T15:02:00Z"), by: user("thorne") },
      { type: "ENDED", at: at("2026-11-11T15:52:00Z"), by: user("thorne") },
    ],
  });
  const upcomingSession = await createScoped(TelehealthSession, SEED, {
    appointmentId: followUp._id, patientId: IDS.patients.elena, providerId: IDS.staff.thorne, videoProvider: "MOCK",
    roomName: "abw-seed-followup", patientTokenHash: sha256(randomBytes(32).toString("hex")), tokenExpiresAt: at("2026-11-25T16:30:00Z"),
  });
  for (const [appointmentId, sessionId] of [[IDS.appointments.elenaInitial, completedSession._id], [followUp._id, upcomingSession._id]] as const) {
    const a = authorizeDoc(await Appointment.findById(appointmentId).setOptions({ authz: SEED }).orFail(), SEED);
    a.telehealthSessionId = sessionId;
    await a.save();
  }

  // Clinical notes (signed and locked)
  const soap = {
    subjective: "Patient reports persistent work-related stress, fragmented sleep (about 5 hours a night), and muscle tension over the past 3 months.",
    objective: "Alert, oriented x4, cooperative via telehealth video. Affect anxious but congruent. PHQ-9: 8, GAD-7: 13.",
    assessment: "Moderate generalized anxiety exacerbated by occupational burnout (F41.1, Z73.0).",
    plan: "Begin biweekly CBT sessions, sleep hygiene protocol, and mindfulness breathing exercises. Follow up in 2 weeks.",
  };
  const elenaServiceLines = [{ cptCode: "90791", modifiers: ["95"], units: 1, minutes: 50 }];
  await createScoped(ClinicalNote, SEED, {
    _id: IDS.notes.elenaSoap, patientId: IDS.patients.elena, providerId: IDS.staff.thorne, appointmentId: IDS.appointments.elenaInitial, noteType: "SOAP",
    subjectiveEnc: encrypt(soap.subjective, ENC.noteSection("subjective")), objectiveEnc: encrypt(soap.objective, ENC.noteSection("objective")),
    assessmentEnc: encrypt(soap.assessment, ENC.noteSection("assessment")), planEnc: encrypt(soap.plan, ENC.noteSection("plan")),
    diagnosisCodes: ["F41.1", "Z73.0"], serviceLines: elenaServiceLines, sessionMinutes: 50, status: "SIGNED_LOCKED",
    signature: buildSignature({
      content: noteSigningContent({ id: String(IDS.notes.elenaSoap), ...soap, diagnosisCodes: ["F41.1", "Z73.0"], serviceLines: elenaServiceLines }),
      ...signer("thorne", "PROVIDER", "Dr. Aris Thorne, PsyD"), ipAddress: IP.thorne, method: "TYPED", signedAt: at("2026-11-11T16:05:00Z"),
    }),
  });
  const davidBody = "Session focused on low mood and motivation. Reviewed behavioral activation plan; patient engaged and agreed to weekly goals.";
  await createScoped(ClinicalNote, SEED, {
    _id: IDS.notes.davidProgress, patientId: IDS.patients.david, providerId: IDS.staff.thorne, appointmentId: IDS.appointments.davidEarlier, noteType: "PROGRESS",
    bodyEnc: encrypt(davidBody, ENC.noteSection("body")), diagnosisCodes: ["F32.1"], serviceLines: [{ cptCode: "90834", units: 1, minutes: 45 }],
    sessionMinutes: 45, status: "SIGNED_LOCKED",
    signature: buildSignature({
      content: noteSigningContent({ id: String(IDS.notes.davidProgress), body: davidBody, diagnosisCodes: ["F32.1"], serviceLines: [{ cptCode: "90834" }] }),
      ...signer("thorne", "PROVIDER", "Dr. Aris Thorne, PsyD"), ipAddress: IP.office, method: "TYPED", signedAt: at("2026-11-06T15:10:00Z"),
    }),
  });

  // Problem list & treatment plan
  const gad = await createScoped(Diagnosis, SEED, { patientId: IDS.patients.elena, icd10Code: "F41.1", description: "Generalized anxiety disorder", isPrimary: true, onsetDate: at("2026-08-01"), recordedBy: IDS.staff.thorne, sourceNoteId: IDS.notes.elenaSoap, detailsEnc: encrypt("Onset with job change; worse on weekdays.", ENC.diagnosisDetails) });
  const burnout = await createScoped(Diagnosis, SEED, { patientId: IDS.patients.elena, icd10Code: "Z73.0", description: "Burn-out", recordedBy: IDS.staff.thorne, sourceNoteId: IDS.notes.elenaSoap });
  await createScoped(Diagnosis, SEED, { patientId: IDS.patients.david, icd10Code: "F32.1", description: "Major depressive disorder, single episode, moderate", isPrimary: true, recordedBy: IDS.staff.thorne, sourceNoteId: IDS.notes.davidProgress });

  const planContent = JSON.stringify({ patient: String(IDS.patients.elena), goals: ["GAD-7 below 8", "7 hours of sleep"], interventions: ["Biweekly CBT", "Sleep hygiene", "Mindfulness"] });
  await createScoped(TreatmentPlan, SEED, {
    patientId: IDS.patients.elena, providerId: IDS.staff.thorne, diagnosisIds: [gad._id, burnout._id], status: "ACTIVE", reviewDate: at("2027-01-13"),
    goals: [
      { description: "Reduce anxiety symptoms", measure: "GAD-7 score", baseline: "13", target: "Below 8", targetDate: at("2027-02-01"), status: "IN_PROGRESS" },
      { description: "Restore restful sleep", measure: "Self-reported hours per night", baseline: "5", target: "7", targetDate: at("2027-01-15"), status: "IN_PROGRESS" },
    ],
    interventions: [
      { description: "Cognitive behavioral therapy", frequency: "Every 2 weeks", responsible: "Dr. Thorne" },
      { description: "Sleep hygiene protocol", frequency: "Daily", responsible: "Patient" },
      { description: "Mindfulness breathing exercises", frequency: "Twice daily", responsible: "Patient" },
    ],
    providerSignature: buildSignature({ content: planContent, ...signer("thorne", "PROVIDER", "Dr. Aris Thorne, PsyD"), ipAddress: IP.thorne, method: "TYPED", signedAt: at("2026-11-11T16:20:00Z") }),
    patientSignature: buildSignature({ content: planContent, ...signer("elena", "PATIENT", "Elena Vance"), ipAddress: IP.elena, method: "DRAWN", signedAt: at("2026-11-12T09:15:00Z") }),
  });

  // Claims: Elena's went through the Use Case 3 denial/resubmission and was paid; David's was denied (CO-16).
  await createScoped(Claim, SEED, {
    _id: IDS.claims.elena, claimNumber: "CLM-2026-10041", patientId: IDS.patients.elena, providerId: IDS.staff.thorne,
    clinicalNoteId: IDS.notes.elenaSoap, appointmentId: IDS.appointments.elenaInitial, insurancePolicyId: elenaPolicy._id, payerName: "BlueCross BlueShield of NY",
    lines: [{ serviceDate: at("2026-11-11T15:00:00Z"), cptCode: "90791", modifiers: ["GT"], units: 1, icdPointers: ["F41.1", "Z73.0"], placeOfService: "10", chargeCents: 21000, allowedCents: 17500, paidCents: 12500 }],
    status: "PAID",
    statusHistory: [
      { status: "DRAFT", at: at("2026-11-11T16:05:00Z"), note: "Generated from signed note" },
      { status: "READY_TO_SUBMIT", at: at("2026-11-11T16:40:00Z"), by: user("marcus") },
      { status: "SUBMITTED", at: at("2026-11-11T17:00:00Z"), by: user("marcus") },
      { status: "DENIED", at: at("2026-11-12T10:00:00Z"), note: "CO-4: procedure code inconsistent with modifier (95)" },
      { status: "SUBMITTED", at: at("2026-11-12T11:30:00Z"), by: user("marcus"), note: "Resubmitted with modifier GT" },
      { status: "PAID", at: at("2026-11-13T11:20:00Z"), note: "ERA-835-992817" },
    ],
    denial: { carc: "CO-4", description: "Procedure code inconsistent with the modifier used.", receivedAt: at("2026-11-12T10:00:00Z") },
    appealNotes: [{ text: "Payer requires GT for this plan's telehealth claims; corrected modifier 95 to GT.", by: user("marcus"), at: at("2026-11-12T11:25:00Z") }],
    resubmissionCount: 1, insurancePaidCents: 12500, contractualAdjustmentCents: 3500, patientResponsibilityCents: 5000,
    eraReference: "ERA-835-992817", submittedAt: at("2026-11-12T11:30:00Z"), adjudicatedAt: at("2026-11-13T11:20:00Z"),
  });
  await createScoped(Claim, SEED, {
    _id: IDS.claims.david, claimNumber: "CLM-2026-10042", patientId: IDS.patients.david, providerId: IDS.staff.thorne,
    clinicalNoteId: IDS.notes.davidProgress, appointmentId: IDS.appointments.davidEarlier, insurancePolicyId: davidPolicy._id, payerName: "Aetna Health",
    lines: [{ serviceDate: at("2026-11-06T14:00:00Z"), cptCode: "90834", modifiers: [], units: 1, icdPointers: ["F32.1"], placeOfService: "11", chargeCents: 15500 }],
    status: "DENIED",
    statusHistory: [
      { status: "DRAFT", at: at("2026-11-06T15:10:00Z") },
      { status: "READY_TO_SUBMIT", at: at("2026-11-08T09:45:00Z"), by: user("marcus") },
      { status: "SUBMITTED", at: at("2026-11-08T10:00:00Z"), by: user("marcus") },
      { status: "DENIED", at: at("2026-11-12T08:00:00Z"), note: "CO-16" },
    ],
    denial: { carc: "CO-16", rarc: ["M76"], description: "Claim lacks information needed for adjudication: missing or incomplete diagnosis.", receivedAt: at("2026-11-12T08:00:00Z") },
    resubmissionCount: 0, submittedAt: at("2026-11-08T10:00:00Z"),
  });
  await Counter.updateOne({ _id: "claim:2026" }, { $max: { seq: 10042 } }, { upsert: true });

  await createScoped(RemittanceAdvice, SEED, {
    eraReference: "ERA-835-990114", kind: "ERA", claimId: IDS.claims.elena, patientId: IDS.patients.elena, payerName: "BlueCross BlueShield of NY",
    paymentDate: at("2026-11-12"), lines: [{ cptCode: "90791", billedCents: 21000, adjustments: [{ groupCode: "CO", reasonCode: "4", amountCents: 21000 }] }],
    denial: { carc: "CO-4", description: "Procedure code inconsistent with the modifier used." }, postedBy: user("marcus"), postedAt: at("2026-11-12T10:05:00Z"),
  });
  await createScoped(RemittanceAdvice, SEED, {
    eraReference: "ERA-835-992817", kind: "ERA", claimId: IDS.claims.elena, patientId: IDS.patients.elena, payerName: "BlueCross BlueShield of NY",
    checkOrEftNumber: "EFT-TEST-55120", paymentDate: at("2026-11-13"),
    lines: [{
      cptCode: "90791", billedCents: 21000, allowedCents: 17500, paidCents: 12500,
      adjustments: [{ groupCode: "CO", reasonCode: "45", amountCents: 3500 }, { groupCode: "PR", reasonCode: "3", amountCents: 3000 }, { groupCode: "PR", reasonCode: "1", amountCents: 2000 }],
    }],
    totalPaidCents: 12500, totalContractualCents: 3500, patientResponsibility: { copayCents: 3000, deductibleCents: 2000, coinsuranceCents: 0 },
    postedBy: user("marcus"), postedAt: at("2026-11-13T11:20:00Z"),
  });
  await createScoped(RemittanceAdvice, SEED, {
    eraReference: "ERA-835-991450", kind: "ERA", claimId: IDS.claims.david, patientId: IDS.patients.david, payerName: "Aetna Health", paymentDate: at("2026-11-12"),
    lines: [{ cptCode: "90834", billedCents: 15500, adjustments: [{ groupCode: "CO", reasonCode: "16", amountCents: 15500 }] }],
    denial: { carc: "CO-16", rarc: ["M76"], description: "Missing or incomplete diagnosis." }, postedBy: user("marcus"), postedAt: at("2026-11-12T08:05:00Z"),
  });

  // Invoices (Use Case 4 starts with Elena's two balances; Use Case 5's fee is David's)
  await createScoped(Invoice, SEED, {
    invoiceNumber: "INV-2026-5001", patientId: IDS.patients.elena, kind: "CLAIM_PATIENT_RESPONSIBILITY", claimId: IDS.claims.elena,
    lineItems: [{ description: "Copay: 11/11/2026 visit", amountCents: 3000 }, { description: "Deductible: 11/11/2026 visit", amountCents: 2000 }],
    breakdown: { copayCents: 3000, deductibleCents: 2000 }, status: "UNPAID", issuedAt: at("2026-11-13T12:00:00Z"), dueDate: at("2026-12-13T23:59:59Z"), publishedToPortal: true,
  });
  await createScoped(Invoice, SEED, {
    invoiceNumber: "INV-2026-5002", patientId: IDS.patients.david, kind: "LATE_CANCELLATION", appointmentId: lateCancelled._id,
    lineItems: [{ description: "Late cancellation fee (less than 24 hours' notice), 11/13/2026", amountCents: 7500 }],
    breakdown: { feesCents: 7500 }, status: "UNPAID", issuedAt: at("2026-11-13T08:05:00Z"), dueDate: at("2026-11-28T23:59:59Z"), publishedToPortal: true,
    notes: "Per the signed Financial Responsibility Agreement (v1.0-2026).",
  });
  await createScoped(Invoice, SEED, {
    invoiceNumber: "INV-2026-5003", patientId: IDS.patients.elena, kind: "PACKAGE",
    lineItems: [{ description: "Thrive Together skills workshop package (6 sessions)", amountCents: 24000 }],
    status: "UNPAID", issuedAt: at("2026-11-12T10:00:00Z"), dueDate: at("2026-12-01T23:59:59Z"), publishedToPortal: true,
  });
  const fee = authorizeDoc(await Appointment.findById(lateCancelled._id).setOptions({ authz: SEED }).orFail(), SEED);
  fee.cancellation!.feeInvoiceId = (await Invoice.findOne({ invoiceNumber: "INV-2026-5002" }).setOptions({ authz: SEED }).orFail())._id;
  await fee.save();
  await Counter.updateOne({ _id: "invoice:2026" }, { $max: { seq: 5003 } }, { upsert: true });

  // Waitlist (Use Case 5: Sofia gets offered David's freed Friday slot)
  await createScoped(WaitlistEntry, SEED, {
    patientId: IDS.patients.sofia, providerId: IDS.staff.thorne, visitType: "therapy-45", modes: ["IN_PERSON"], preferredDays: [5],
    earliestDate: at("2026-11-12"), latestDate: at("2026-12-31"), priority: 1, addedBy: user("priya"),
  });

  // Post-visit survey: Elena rated her 11/11 evaluation.
  await createScoped(VisitSurvey, SEED, {
    patientId: IDS.patients.elena, appointmentId: IDS.appointments.elenaInitial, providerId: IDS.staff.thorne, rating: 5,
    commentEnc: encrypt("Felt heard and left with a clear plan.", ENC.surveyComment), submittedAt: at("2026-11-11T20:00:00Z"),
  });

  // Secure messages
  const thread = await createScoped(MessageThread, SEED, {
    patientId: IDS.patients.elena, category: "CLINICAL", subject: "Question after our session",
    participants: [{ userId: user("elena"), role: "PATIENT", lastReadAt: at("2026-11-12T19:00:00Z") }, { userId: user("thorne"), role: "PROVIDER", lastReadAt: at("2026-11-12T18:40:00Z") }],
    lastMessageAt: at("2026-11-12T18:40:00Z"), createdBy: user("elena"),
  });
  await createScoped(SecureMessage, SEED, { threadId: thread._id, patientId: IDS.patients.elena, senderId: user("elena"), senderRole: "PATIENT", bodyEnc: encrypt("Should I do the breathing exercises before bed or in the morning?", ENC.messageBody) });
  await createScoped(SecureMessage, SEED, { threadId: thread._id, patientId: IDS.patients.elena, senderId: user("thorne"), senderRole: "PROVIDER", bodyEnc: encrypt("Both work. Try the evening first for the next two weeks and note how you sleep.", ENC.messageBody) });
  await createScoped(MessageThread, SEED, {
    patientId: IDS.patients.elena, category: "BILLING", subject: "Question about my invoice",
    participants: [{ userId: user("elena"), role: "PATIENT" }, { userId: user("marcus"), role: "BILLING_STAFF" }], createdBy: user("elena"),
  });

  // Compliance registry
  await ComplianceRecord.create([
    { kind: "BAA", vendor: "MongoDB Atlas (M10+ dedicated)", service: "Encrypted database", baaStatus: "PENDING", notes: "Required before real patient data.", recordedBy: user("camila") },
    { kind: "BAA", vendor: "Vercel", service: "Application hosting and logs", baaStatus: "PENDING", recordedBy: user("camila") },
    { kind: "BAA", vendor: "AWS (S3, KMS)", service: "Document vault and keys", baaStatus: "PENDING", recordedBy: user("camila") },
    { kind: "BAA", vendor: "Daily.co", service: "Telehealth video", baaStatus: "PENDING", recordedBy: user("camila") },
    { kind: "BAA", vendor: "Stripe", service: "Payment processing", baaStatus: "NOT_APPLICABLE", notApplicableReason: "Payment processing exemption (HIPAA §1179); no PHI in payment metadata.", recordedBy: user("camila") },
    { kind: "BAA", vendor: "Resend", service: "Transactional email", baaStatus: "NOT_APPLICABLE", notApplicableReason: "No PHI sent: notification-only emails.", recordedBy: user("camila") },
    { kind: "BACKUP_VERIFICATION", vendor: "MongoDB Atlas", backup: { snapshotAt: at("2026-11-10T03:00:00Z"), restoreTestedAt: at("2026-11-10T15:00:00Z"), restoredTo: "abwellness_restore_test", result: "PASSED", durationMinutes: 18 }, notes: "Sample record (development).", recordedBy: user("camila") },
  ]);

  const counts: Record<string, number> = {};
  for (const [name, model] of Object.entries(mongoose.models)) {
    counts[name] = await model.countDocuments({}).setOptions({ authz: SEED });
  }
  counts.User = await mongoose.connection.db!.collection("user").countDocuments({ email: { $in: SEED_USERS.map((u) => u.email) } });

  await recordAudit({ actorRole: "SYSTEM" }, { action: "CREATE", resourceType: "SeedData", metadata: { dataset: "emr-dev-v1", counts } });
  return { password, counts };
}

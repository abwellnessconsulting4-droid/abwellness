/**
 * Role-based access control: the single source of truth for who may do what.
 *
 * Each grant carries a scope:
 *   "all"      every record
 *   "assigned" patients assigned to this provider (Patient.assignedProviderId)
 *   "own"      the patient's own records (PATIENT) or the user's own records (staff schedules)
 *   "author"   records the user wrote (psychotherapy notes)
 *
 * Psychotherapy notes are a separate HIPAA category: only the author has a
 * standing grant. Anyone else needs an explicit, audited per-note grant
 * (ClinicalNote.accessGrants), checked in lib/authz.ts.
 */

export const ROLES = ["SUPER_ADMIN", "PROVIDER", "BILLING_STAFF", "FRONT_DESK", "PATIENT"] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: readonly Role[] = ["SUPER_ADMIN", "PROVIDER", "BILLING_STAFF", "FRONT_DESK"];

export const ACTIONS = ["read", "create", "update", "delete", "export", "sign"] as const;
export type Action = (typeof ACTIONS)[number];

export type Scope = "all" | "assigned" | "own" | "author";

export const RESOURCES = [
  "patient",
  "healthAssessment",
  "clinicalNote",
  "psychotherapyNote",
  "diagnosis",
  "treatmentPlan",
  "medication",
  "allergy",
  "document",
  "medicalCode",
  "insurance",
  "claim",
  "remittance",
  "invoice",
  "payment",
  "paymentPlan",
  "consentTemplate",
  "signedConsent",
  "compliance",
  "schedule",
  "appointment",
  "waitlist",
  "message",
  "telehealth",
  "auditLog",
  "user",
  "analytics",
] as const;
export type Resource = (typeof RESOURCES)[number];

type Grants = Partial<Record<Action, Scope>>;
type Matrix = Record<Role, Partial<Record<Resource, Grants>>>;

const ALL_CRUD: Grants = { read: "all", create: "all", update: "all", delete: "all" };

export const PERMISSIONS: Matrix = {
  SUPER_ADMIN: {
    patient: { ...ALL_CRUD, export: "all" },
    healthAssessment: { read: "all", export: "all" },
    clinicalNote: { read: "all", export: "all" },
    // psychotherapyNote: none. Requires an explicit per-note grant (break-glass).
    diagnosis: { read: "all", export: "all" },
    treatmentPlan: { read: "all", export: "all" },
    medication: { read: "all" },
    allergy: { read: "all" },
    document: { ...ALL_CRUD, export: "all" },
    medicalCode: ALL_CRUD,
    insurance: ALL_CRUD,
    claim: { ...ALL_CRUD, export: "all" },
    remittance: { read: "all", create: "all", update: "all", export: "all" },
    invoice: { ...ALL_CRUD, export: "all" },
    payment: { read: "all", create: "all", update: "all", export: "all" },
    paymentPlan: ALL_CRUD,
    consentTemplate: ALL_CRUD,
    signedConsent: { read: "all", export: "all" },
    compliance: ALL_CRUD,
    schedule: ALL_CRUD,
    appointment: ALL_CRUD,
    waitlist: ALL_CRUD,
    message: { read: "all" },
    telehealth: { read: "all" },
    auditLog: { read: "all", export: "all" },
    user: ALL_CRUD,
    analytics: { read: "all", export: "all" },
  },

  PROVIDER: {
    patient: { read: "assigned", update: "assigned" },
    healthAssessment: { read: "assigned", create: "assigned", update: "assigned" },
    clinicalNote: { read: "assigned", create: "assigned", update: "assigned", sign: "assigned", export: "assigned" },
    psychotherapyNote: { read: "author", create: "assigned", update: "author", sign: "author" },
    diagnosis: { read: "assigned", create: "assigned", update: "assigned" },
    treatmentPlan: { read: "assigned", create: "assigned", update: "assigned", sign: "assigned" },
    medication: { read: "assigned", create: "assigned", update: "assigned" },
    allergy: { read: "assigned", create: "assigned", update: "assigned" },
    document: { read: "assigned", create: "assigned" },
    medicalCode: { read: "all" },
    insurance: { read: "assigned" },
    claim: { read: "assigned" },
    invoice: { read: "assigned" },
    consentTemplate: { read: "all" },
    signedConsent: { read: "assigned" },
    schedule: { read: "own", create: "own", update: "own", delete: "own" },
    appointment: { read: "assigned", create: "assigned", update: "assigned" },
    waitlist: { read: "all" },
    message: { read: "assigned", create: "assigned" },
    telehealth: { read: "assigned", create: "assigned", update: "assigned" },
    analytics: { read: "own" },
  },

  BILLING_STAFF: {
    patient: { read: "all" }, // demographics only; DTOs strip clinical fields
    diagnosis: { read: "all" }, // codes needed on claims
    document: { read: "all", create: "all" }, // insurance/billing categories only (lib/authz.ts)
    medicalCode: { read: "all" },
    insurance: { read: "all", create: "all", update: "all" },
    claim: { ...ALL_CRUD, export: "all" },
    remittance: { read: "all", create: "all", update: "all", export: "all" },
    invoice: { read: "all", create: "all", update: "all", export: "all" },
    payment: { read: "all", create: "all", update: "all", export: "all" },
    paymentPlan: { read: "all", create: "all", update: "all" },
    signedConsent: { read: "all" }, // financial agreements
    appointment: { read: "all" },
    analytics: { read: "all", export: "all" },
  },

  FRONT_DESK: {
    patient: { read: "all", create: "all", update: "all" },
    document: { read: "all", create: "all" }, // ID/insurance/referral categories only (lib/authz.ts)
    insurance: { read: "all", create: "all", update: "all" },
    invoice: { read: "all" },
    payment: { read: "all", create: "all" }, // copay collection
    paymentPlan: { read: "all" },
    consentTemplate: { read: "all" },
    signedConsent: { read: "all" },
    schedule: { read: "all" },
    appointment: { ...ALL_CRUD },
    waitlist: { ...ALL_CRUD },
    message: { read: "all", create: "all" }, // GENERAL/BILLING threads only (lib/authz.ts)
    telehealth: { read: "all", update: "all" }, // check-in status
  },

  PATIENT: {
    patient: { read: "own", update: "own" },
    healthAssessment: { read: "own", create: "own" },
    clinicalNote: { read: "own" }, // signed, non-psychotherapy notes only (lib/authz.ts)
    diagnosis: { read: "own" },
    treatmentPlan: { read: "own", sign: "own" },
    medication: { read: "own", create: "own" },
    allergy: { read: "own", create: "own" },
    document: { read: "own", create: "own" },
    insurance: { read: "own", create: "own", update: "own" },
    claim: { read: "own" },
    invoice: { read: "own" },
    payment: { read: "own", create: "own" },
    paymentPlan: { read: "own", create: "own" },
    consentTemplate: { read: "all" },
    signedConsent: { read: "own", create: "own", sign: "own" },
    appointment: { read: "own", create: "own", update: "own" },
    waitlist: { read: "own", create: "own", delete: "own" },
    message: { read: "own", create: "own" },
    telehealth: { read: "own", update: "own" },
  },
};

/** The scope a role holds for an action on a resource, or null when denied. */
export function scopeFor(role: Role, resource: Resource, action: Action): Scope | null {
  return PERMISSIONS[role]?.[resource]?.[action] ?? null;
}

export function can(role: Role, resource: Resource, action: Action): boolean {
  return scopeFor(role, resource, action) !== null;
}

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

/** Inactivity timeouts (minutes) and absolute session lifetimes (hours). */
export const SESSION_POLICY = {
  staff: { idleMinutes: 15, absoluteHours: 10 },
  patient: { idleMinutes: 30, absoluteHours: 12 },
  warningSeconds: 120,
  stepUpMinutes: 5,
} as const;

export function sessionPolicyFor(role: Role) {
  return isStaff(role) ? SESSION_POLICY.staff : SESSION_POLICY.patient;
}

/** Document categories each staff role may handle (patients: their own, any category). */
export const DOCUMENT_CATEGORY_ACCESS: Partial<Record<Role, readonly string[]>> = {
  BILLING_STAFF: ["INSURANCE_CARD_FRONT", "INSURANCE_CARD_BACK", "INVOICE", "RECEIPT", "SIGNED_CONSENT"],
  FRONT_DESK: ["GOVERNMENT_ID", "INSURANCE_CARD_FRONT", "INSURANCE_CARD_BACK", "REFERRAL", "SIGNED_CONSENT"],
};

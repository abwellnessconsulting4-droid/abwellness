import "server-only";

import { Types } from "mongoose";
import { recordAudit } from "@/lib/audit";
import { authorize, authorizeAny, authzToken, withScope, type AuthContext } from "@/lib/authz";
import { systemToken } from "@/lib/db/phi-guard";
import { can } from "@/lib/rbac";
import {
  Allergy,
  Appointment,
  Claim,
  ClinicalDocument,
  ClinicalNote,
  Diagnosis,
  HealthAssessment,
  InsurancePolicy,
  Invoice,
  Medication,
  Patient,
  SignedConsent,
  StaffProfile,
  TreatmentPlan,
} from "@/models";

/**
 * Client directory and chart. Every section is included only when the role may
 * read that resource (RBAC), lists are limited by scopeFilter, and opening a
 * chart is audited as a VIEW of that client. Encrypted fields are never
 * decrypted here: the chart shows last-four values and note metadata only.
 */

const LOOKUP = systemToken("chart-lookup");

export interface PatientSummary {
  id: string;
  mrn: string;
  name: string;
  dob: Date;
  status: string;
  phone?: string;
  provider?: string;
}

async function providerNames(ids: (Types.ObjectId | string | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map<string, string>();
  const staff = await StaffProfile.find({ _id: { $in: unique } }, { displayName: 1 }).lean();
  return new Map(staff.map((s) => [String(s._id), s.displayName]));
}

export async function searchPatients(ctx: AuthContext, query: string): Promise<PatientSummary[]> {
  await authorizeAny(ctx, "patient", "read");
  const q = query.trim();
  const filter: Record<string, unknown> = {};
  if (q) {
    const escaped = q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const dob = q.match(/^(\d{4})-(\d{2})-(\d{2})$/) ? new Date(`${q}T00:00:00Z`) : null;
    filter.$or = [
      { mrn: q.toUpperCase() },
      { lastNameLower: { $regex: `^${escaped}` } },
      { firstNameLower: { $regex: `^${escaped}` } },
      ...(dob ? [{ dob }] : []),
    ];
  }
  const rows = await Patient.find(await withScope(ctx, "patient", filter), { mrn: 1, firstName: 1, lastName: 1, preferredName: 1, dob: 1, status: 1, phone: 1, assignedProviderId: 1 })
    .sort({ lastNameLower: 1, firstNameLower: 1 })
    .limit(100)
    .setOptions({ authz: authzToken(ctx) })
    .lean();
  const names = await providerNames(rows.map((r) => r.assignedProviderId));
  await recordAudit(ctx, { action: "VIEW", resourceType: "PatientSearch", metadata: { results: rows.length, searched: Boolean(q) } });
  return rows.map((r) => ({
    id: String(r._id),
    mrn: r.mrn,
    name: `${r.lastName}, ${r.preferredName ?? r.firstName}`,
    dob: r.dob,
    status: r.status,
    phone: r.phone ?? undefined,
    provider: r.assignedProviderId ? names.get(String(r.assignedProviderId)) : undefined,
  }));
}

/** Load the patient and enforce chart access. Returns null when the record doesn't exist. */
export async function loadPatientForAccess(ctx: AuthContext, patientId: string, action: "read" | "update" = "read") {
  if (!Types.ObjectId.isValid(patientId)) return null;
  const patient = await Patient.findById(patientId).setOptions({ authz: LOOKUP }).lean();
  if (!patient) return null;
  await authorize(ctx, "patient", action, { resourceId: patientId, patientId, assignedProviderId: patient.assignedProviderId ?? null });
  return patient;
}

export async function getChart(ctx: AuthContext, patientId: string) {
  const patient = await loadPatientForAccess(ctx, patientId);
  if (!patient) return null;
  const authz = { authz: authzToken(ctx) };
  const pid = new Types.ObjectId(patientId);
  const sections: string[] = [];
  const section = async <T>(name: string, allowed: boolean, load: () => Promise<T>): Promise<T | null> => {
    if (!allowed) return null;
    sections.push(name);
    return load();
  };
  const role = ctx.role;

  const [insurance, allergies, medications, diagnoses, plans, assessments, notes, psychNotes, documents, appointments, claims, invoices, consents] = await Promise.all([
    section("insurance", can(role, "insurance", "read"), async () =>
      InsurancePolicy.find(await withScope(ctx, "insurance", { patientId: pid, active: true })).sort({ priority: 1 }).setOptions(authz).lean()),
    section("allergies", can(role, "allergy", "read"), async () =>
      Allergy.find(await withScope(ctx, "allergy", { patientId: pid, status: "ACTIVE" })).setOptions(authz).lean()),
    section("medications", can(role, "medication", "read"), async () =>
      Medication.find(await withScope(ctx, "medication", { patientId: pid })).sort({ status: 1, name: 1 }).setOptions(authz).lean()),
    section("diagnoses", can(role, "diagnosis", "read"), async () =>
      Diagnosis.find(await withScope(ctx, "diagnosis", { patientId: pid })).sort({ status: 1, isPrimary: -1 }).setOptions(authz).lean()),
    section("treatmentPlans", can(role, "treatmentPlan", "read"), async () =>
      TreatmentPlan.find(await withScope(ctx, "treatmentPlan", { patientId: pid })).sort({ createdAt: -1 }).setOptions(authz).lean()),
    section("assessments", can(role, "healthAssessment", "read"), async () =>
      HealthAssessment.find(await withScope(ctx, "healthAssessment", { patientId: pid }), { type: 1, score: 1, severity: 1, completedAt: 1, safetyFlag: 1 }).sort({ completedAt: -1 }).setOptions(authz).lean()),
    section("notes", can(role, "clinicalNote", "read"), async () =>
      ClinicalNote.find(await withScope(ctx, "clinicalNote", { patientId: pid }), { noteType: 1, status: 1, providerId: 1, appointmentId: 1, createdAt: 1, "signature.signedAt": 1, addenda: 1 }).sort({ createdAt: -1 }).setOptions(authz).lean()),
    section("psychotherapyNotes", can(role, "psychotherapyNote", "read"), async () =>
      ClinicalNote.find(await withScope(ctx, "psychotherapyNote", { patientId: pid }), { noteType: 1, status: 1, providerId: 1, createdAt: 1, "signature.signedAt": 1 }).sort({ createdAt: -1 }).setOptions(authz).lean()),
    section("documents", can(role, "document", "read"), async () =>
      ClinicalDocument.find(await withScope(ctx, "document", { patientId: pid, status: { $ne: "DELETED" } }), { category: 1, mimeType: 1, byteSize: 1, status: 1, createdAt: 1, uploadedByRole: 1 }).sort({ createdAt: -1 }).setOptions(authz).lean()),
    section("appointments", can(role, "appointment", "read"), async () =>
      Appointment.find(await withScope(ctx, "appointment", { patientId: pid }), { scheduledStart: 1, scheduledEnd: 1, status: 1, mode: 1, visitType: 1, providerId: 1 }).sort({ scheduledStart: -1 }).limit(20).setOptions(authz).lean()),
    section("claims", can(role, "claim", "read"), async () =>
      Claim.find(await withScope(ctx, "claim", { patientId: pid }), { claimNumber: 1, status: 1, totalBilledCents: 1, insurancePaidCents: 1, patientResponsibilityCents: 1, createdAt: 1, "denial.carc": 1 }).sort({ createdAt: -1 }).setOptions(authz).lean()),
    section("invoices", can(role, "invoice", "read"), async () =>
      Invoice.find(await withScope(ctx, "invoice", { patientId: pid }), { invoiceNumber: 1, kind: 1, status: 1, amountDueCents: 1, amountPaidCents: 1, dueDate: 1 }).sort({ createdAt: -1 }).setOptions(authz).lean()),
    section("consents", can(role, "signedConsent", "read"), async () =>
      SignedConsent.find(await withScope(ctx, "signedConsent", { patientId: pid }), { consentType: 1, version: 1, "signature.signedAt": 1, expiresAt: 1, revokedAt: 1 }).sort({ "signature.signedAt": -1 }).setOptions(authz).lean()),
  ]);

  const names = await providerNames([
    patient.assignedProviderId,
    ...(notes ?? []).map((n) => n.providerId),
    ...(psychNotes ?? []).map((n) => n.providerId),
    ...(appointments ?? []).map((a) => a.providerId),
  ]);

  await recordAudit(ctx, { action: "VIEW", resourceType: "Patient", resourceId: patientId, patientId, metadata: { sections } });

  return {
    patient: {
      id: patientId,
      mrn: patient.mrn,
      firstName: patient.firstName,
      lastName: patient.lastName,
      preferredName: patient.preferredName ?? undefined,
      pronouns: patient.pronouns ?? undefined,
      dob: patient.dob,
      gender: patient.gender ?? undefined,
      preferredLanguage: patient.preferredLanguage,
      email: patient.email ?? undefined,
      phone: patient.phone ?? undefined,
      address: patient.address ?? undefined,
      status: patient.status,
      ssnLast4: patient.ssnLast4 ?? undefined,
      emergencyContacts: patient.emergencyContacts ?? [],
      assignedProvider: patient.assignedProviderId ? names.get(String(patient.assignedProviderId)) : undefined,
      assignedProviderId: patient.assignedProviderId ? String(patient.assignedProviderId) : undefined,
    },
    insurance,
    allergies,
    medications,
    diagnoses,
    plans,
    assessments,
    notes: notes?.map((n) => ({ ...n, provider: names.get(String(n.providerId)) })) ?? null,
    psychNotes: psychNotes?.map((n) => ({ ...n, provider: names.get(String(n.providerId)) })) ?? null,
    documents,
    appointments: appointments?.map((a) => ({ ...a, provider: names.get(String(a.providerId)) })) ?? null,
    claims,
    invoices,
    consents,
  };
}

export type Chart = NonNullable<Awaited<ReturnType<typeof getChart>>>;

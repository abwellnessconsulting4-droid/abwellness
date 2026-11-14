import "server-only";

import { Types } from "mongoose";
import { recordAudit } from "@/lib/audit";
import { authorize, authzToken, type AuthContext } from "@/lib/authz";
import { authorizeDoc, createScoped, systemToken } from "@/lib/db/phi-guard";
import { loadPatientForAccess } from "@/lib/services/patients";
import { Allergy, Diagnosis, MedicalCode, Medication } from "@/models";

/** Problem list, medications, and allergies on the chart. */

const LOOKUP = systemToken("clinical-lookup");
export class ClinicalError extends Error {}

async function patientFor(ctx: AuthContext, patientId: string, resource: "diagnosis" | "medication" | "allergy", action: "create" | "update") {
  const patient = await loadPatientForAccess(ctx, patientId);
  if (!patient) throw new ClinicalError("Client not found.");
  await authorize(ctx, resource, action, { patientId, assignedProviderId: patient.assignedProviderId ?? null });
  return patient;
}

export async function addDiagnosis(ctx: AuthContext, patientId: string, input: { code: string; isPrimary?: boolean; onsetDate?: string }) {
  await patientFor(ctx, patientId, "diagnosis", "create");
  if (!ctx.staffProfileId) throw new ClinicalError("Only providers add diagnoses.");
  const code = input.code.trim().toUpperCase();
  const known = await MedicalCode.findOne({ system: "ICD10CM", code, active: true }).lean();
  if (!known) throw new ClinicalError(`${code} isn't a known ICD-10-CM code.`);
  const duplicate = await Diagnosis.findOne({ patientId, icd10Code: code, status: "ACTIVE" }, { _id: 1 }).setOptions({ authz: LOOKUP }).lean();
  if (duplicate) throw new ClinicalError(`${code} is already on the active problem list.`);

  const dx = await createScoped(Diagnosis, authzToken(ctx), {
    patientId,
    icd10Code: code,
    description: known.description,
    isPrimary: Boolean(input.isPrimary),
    onsetDate: input.onsetDate ? new Date(input.onsetDate) : undefined,
    recordedBy: ctx.staffProfileId,
  });
  await recordAudit(ctx, { action: "CREATE", resourceType: "Diagnosis", resourceId: String(dx._id), patientId, metadata: { code } });
}

export async function resolveDiagnosis(ctx: AuthContext, patientId: string, diagnosisId: string) {
  await patientFor(ctx, patientId, "diagnosis", "update");
  if (!Types.ObjectId.isValid(diagnosisId)) throw new ClinicalError("Diagnosis not found.");
  const dx = await Diagnosis.findOne({ _id: diagnosisId, patientId }).setOptions({ authz: authzToken(ctx) });
  if (!dx) throw new ClinicalError("Diagnosis not found.");
  dx.status = "RESOLVED";
  dx.resolvedDate = new Date();
  await authorizeDoc(dx, authzToken(ctx)).save();
  await recordAudit(ctx, { action: "UPDATE", resourceType: "Diagnosis", resourceId: diagnosisId, patientId, changedFields: ["status", "resolvedDate"] });
}

export async function addMedication(ctx: AuthContext, patientId: string, input: { name: string; dosage?: string; frequency?: string; route?: string; prescriber?: string }) {
  await patientFor(ctx, patientId, "medication", "create");
  const name = input.name.trim();
  if (name.length < 2) throw new ClinicalError("Enter the medication name.");
  const med = await createScoped(Medication, authzToken(ctx), {
    patientId,
    name: name.slice(0, 120),
    dosage: input.dosage?.trim() || undefined,
    frequency: input.frequency?.trim() || undefined,
    route: input.route || undefined,
    prescriber: input.prescriber?.trim() || undefined,
    reportedBy: ctx.role === "PATIENT" ? "PATIENT" : "STAFF",
    recordedById: ctx.userId,
    startDate: new Date(),
  });
  await recordAudit(ctx, { action: "CREATE", resourceType: "Medication", resourceId: String(med._id), patientId });
}

export async function discontinueMedication(ctx: AuthContext, patientId: string, medicationId: string) {
  await patientFor(ctx, patientId, "medication", "update");
  if (!Types.ObjectId.isValid(medicationId)) throw new ClinicalError("Medication not found.");
  const med = await Medication.findOne({ _id: medicationId, patientId }).setOptions({ authz: authzToken(ctx) });
  if (!med) throw new ClinicalError("Medication not found.");
  med.status = "DISCONTINUED";
  med.endDate = new Date();
  await authorizeDoc(med, authzToken(ctx)).save();
  await recordAudit(ctx, { action: "UPDATE", resourceType: "Medication", resourceId: medicationId, patientId, changedFields: ["status", "endDate"] });
}

export async function addAllergy(ctx: AuthContext, patientId: string, input: { allergen: string; reaction?: string; severity?: string }) {
  await patientFor(ctx, patientId, "allergy", "create");
  const allergen = input.allergen.trim();
  if (allergen.length < 2) throw new ClinicalError("Enter the allergen.");
  const allergy = await createScoped(Allergy, authzToken(ctx), {
    patientId,
    allergen: allergen.slice(0, 120),
    reaction: input.reaction?.trim() || undefined,
    severity: input.severity || "UNKNOWN",
    reportedBy: ctx.role === "PATIENT" ? "PATIENT" : "STAFF",
    recordedById: ctx.userId,
  });
  await recordAudit(ctx, { action: "CREATE", resourceType: "Allergy", resourceId: String(allergy._id), patientId });
}

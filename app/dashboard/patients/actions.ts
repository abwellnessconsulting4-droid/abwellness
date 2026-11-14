"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditedDenial } from "@/lib/audit";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { addAllergy, addDiagnosis, addMedication, ClinicalError, discontinueMedication, resolveDiagnosis } from "@/lib/services/clinical";
import { addAddendum, createNote, NoteError, searchCodes, signNote, updateDraft, type NoteInput } from "@/lib/services/notes";

export interface FormState {
  error?: string;
  success?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

async function staff() {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  return ctx;
}

async function evidence() {
  const h = await headers();
  return { ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown", userAgent: h.get("user-agent") ?? undefined };
}

async function attempt(work: () => Promise<void>, success: string): Promise<FormState> {
  try {
    await work();
    return { success };
  } catch (error) {
    if (error instanceof NoteError || error instanceof ClinicalError) return { error: error.message };
    if (error instanceof AuditedDenial) return { error: "You don't have permission to do that. The attempt was recorded." };
    throw error;
  }
}

function noteInput(form: FormData): Omit<NoteInput, "noteType" | "appointmentId"> {
  const lines = JSON.parse(text(form, "serviceLines") || "[]") as NoteInput["serviceLines"];
  return {
    sections: {
      subjective: text(form, "subjective"),
      objective: text(form, "objective"),
      assessment: text(form, "assessment"),
      plan: text(form, "plan"),
      body: text(form, "body"),
    },
    diagnosisCodes: text(form, "diagnosisCodes").split(/[\s,]+/).filter(Boolean),
    serviceLines: Array.isArray(lines) ? lines.slice(0, 10) : [],
  };
}

export async function createNoteAction(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await staff();
  let noteId = "";
  const result = await attempt(async () => {
    noteId = await createNote(ctx, patientId, {
      ...noteInput(form),
      noteType: text(form, "noteType") as NoteInput["noteType"],
      appointmentId: text(form, "appointmentId") || undefined,
    });
  }, "Draft saved.");
  if (result.error) return result;
  redirect(`/dashboard/patients/${patientId}/notes/${noteId}?saved=1`);
}

export async function saveDraftAction(patientId: string, noteId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await staff();
  const intent = text(form, "intent");
  const result = await attempt(async () => {
    await updateDraft(ctx, noteId, noteInput(form));
    if (intent === "sign") {
      const { claimId } = await signNote(ctx, noteId, await evidence());
      if (claimId) revalidatePath("/dashboard/billing");
    }
  }, intent === "sign" ? "Note signed and locked." : "Draft saved.");
  revalidatePath(`/dashboard/patients/${patientId}`);
  revalidatePath(`/dashboard/patients/${patientId}/notes/${noteId}`);
  return result;
}

export async function addendumAction(patientId: string, noteId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await staff();
  const signedFrom = await evidence();
  const result = await attempt(() => addAddendum(ctx, noteId, text(form, "addendum"), signedFrom), "Addendum added and signed.");
  revalidatePath(`/dashboard/patients/${patientId}/notes/${noteId}`);
  return result;
}

export async function clinicalAction(patientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await staff();
  const intent = text(form, "intent");
  const result = await attempt(async () => {
    switch (intent) {
      case "add-diagnosis":
        return addDiagnosis(ctx, patientId, { code: text(form, "code"), isPrimary: form.get("isPrimary") === "on", onsetDate: text(form, "onsetDate") || undefined });
      case "resolve-diagnosis":
        return resolveDiagnosis(ctx, patientId, text(form, "id"));
      case "add-medication":
        return addMedication(ctx, patientId, { name: text(form, "name"), dosage: text(form, "dosage"), frequency: text(form, "frequency"), route: text(form, "route") || undefined, prescriber: text(form, "prescriber") });
      case "discontinue-medication":
        return discontinueMedication(ctx, patientId, text(form, "id"));
      case "add-allergy":
        return addAllergy(ctx, patientId, { allergen: text(form, "allergen"), reaction: text(form, "reaction"), severity: text(form, "severity") || undefined });
      default:
        throw new ClinicalError("Unknown action.");
    }
  }, "Saved.");
  revalidatePath(`/dashboard/patients/${patientId}`);
  return result;
}

/** Code lookup for the note editor. */
export async function codeSearchAction(kind: "diagnosis" | "procedure", query: string) {
  await staff();
  const rows = await searchCodes(kind, query);
  return rows.map((r) => ({ code: r.code, description: r.description }));
}

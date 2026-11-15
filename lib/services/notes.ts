import "server-only";

import { Types } from "mongoose";
import { AuditedDenial, recordAudit } from "@/lib/audit";
import { authorize, authzToken, type AuthContext } from "@/lib/authz";
import { decrypt, ENC, encrypt } from "@/lib/crypto";
import { authorizeDoc, createScoped, systemToken } from "@/lib/db/phi-guard";
import { buildSignature, noteSigningContent } from "@/lib/signatures";
import { createClaimFromNote } from "@/lib/services/billing";
import { loadPatientForAccess } from "@/lib/services/patients";
import { Appointment, ClinicalNote, MedicalCode, StaffProfile } from "@/models";

/**
 * Clinical notes: drafts, signing (locks the note and generates the draft
 * claim), and addenda. Psychotherapy notes use the stricter
 * `psychotherapyNote` permission throughout. Note text is encrypted at rest and
 * only decrypted for an authorized, audited VIEW.
 */

const LOOKUP = systemToken("note-lookup");
const SECTIONS = ["subjective", "objective", "assessment", "plan", "body"] as const;
type Section = (typeof SECTIONS)[number];
const FIELD: Record<Section, "subjectiveEnc" | "objectiveEnc" | "assessmentEnc" | "planEnc" | "bodyEnc"> = {
  subjective: "subjectiveEnc",
  objective: "objectiveEnc",
  assessment: "assessmentEnc",
  plan: "planEnc",
  body: "bodyEnc",
};
const ALL_FIELDS = "+subjectiveEnc +objectiveEnc +assessmentEnc +planEnc +bodyEnc +addenda.textEnc";

export class NoteError extends Error {}

export interface NoteInput {
  noteType: "SOAP" | "PROGRESS" | "INTAKE" | "PSYCHOTHERAPY";
  appointmentId?: string;
  sections: Partial<Record<Section, string>>;
  diagnosisCodes: string[];
  serviceLines: { cptCode: string; modifiers?: string[]; units?: number; minutes?: number }[];
}

export interface SignatureContext {
  ipAddress: string;
  userAgent?: string;
}

const resourceFor = (noteType: string) => (noteType === "PSYCHOTHERAPY" ? "psychotherapyNote" : "clinicalNote");

function normalizeCodes(input: NoteInput) {
  const diagnosisCodes = [...new Set(input.diagnosisCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))].slice(0, 12);
  const serviceLines = input.serviceLines
    .filter((l) => l.cptCode.trim())
    .map((l) => ({
      cptCode: l.cptCode.trim().toUpperCase(),
      modifiers: (l.modifiers ?? []).map((m) => m.trim().toUpperCase()).filter(Boolean).slice(0, 4),
      units: Math.max(1, Math.min(24, Math.round(l.units ?? 1))),
      minutes: l.minutes,
    }));
  return { diagnosisCodes, serviceLines };
}

async function validateCodes(diagnosisCodes: string[], serviceLines: { cptCode: string }[]) {
  const known = await MedicalCode.find({ code: { $in: [...diagnosisCodes, ...serviceLines.map((l) => l.cptCode)] }, active: true }, { code: 1, system: 1 }).lean();
  const icd = new Set(known.filter((k) => k.system === "ICD10CM").map((k) => k.code));
  const proc = new Set(known.filter((k) => k.system !== "ICD10CM").map((k) => k.code));
  const badDx = diagnosisCodes.filter((c) => !icd.has(c));
  const badProc = serviceLines.map((l) => l.cptCode).filter((c) => !proc.has(c));
  if (badDx.length || badProc.length) {
    throw new NoteError(`Unknown code${badDx.length + badProc.length > 1 ? "s" : ""}: ${[...badDx, ...badProc].join(", ")}. Use the code search to pick valid codes.`);
  }
}

function encryptSections(sections: Partial<Record<Section, string>>) {
  const out: Record<string, string | undefined> = {};
  for (const s of SECTIONS) {
    const text = sections[s]?.trim();
    out[FIELD[s]] = text ? encrypt(text.slice(0, 20_000), ENC.noteSection(s)) : undefined;
  }
  return out;
}

function decryptSections(note: Partial<Record<(typeof FIELD)[Section], string | null>>) {
  const out: Partial<Record<Section, string>> = {};
  for (const s of SECTIONS) {
    const value = note[FIELD[s]];
    if (value) out[s] = decrypt(value, ENC.noteSection(s));
  }
  return out;
}

/** Load a note with its text and enforce access for the given action. */
async function loadNote(ctx: AuthContext, noteId: string, action: "read" | "update" | "sign") {
  if (!Types.ObjectId.isValid(noteId)) throw new NoteError("Note not found.");
  const note = await ClinicalNote.findById(noteId).select(ALL_FIELDS).setOptions({ authz: LOOKUP });
  if (!note) throw new NoteError("Note not found.");
  await authorize(ctx, resourceFor(note.noteType), action, {
    resourceId: noteId,
    patientId: note.patientId,
    providerId: note.providerId,
    noteType: note.noteType,
    noteStatus: note.status,
    accessGrants: note.accessGrants?.map((g) => ({ userId: g.userId, expiresAt: g.expiresAt })),
  });
  return note;
}

async function requireAuthor(ctx: AuthContext, note: { _id: unknown; providerId: unknown; patientId: unknown }, what: string) {
  if (ctx.staffProfileId && String(note.providerId) === ctx.staffProfileId) return;
  await recordAudit(ctx, { action: "UNAUTHORIZED_ACCESS_ATTEMPT", outcome: "DENIED", resourceType: "ClinicalNote", resourceId: String(note._id), patientId: String(note.patientId), metadata: { attempted: what, reason: "not the author" } });
  throw new AuditedDenial("Only the note's author can do that.");
}

export async function createNote(ctx: AuthContext, patientId: string, input: NoteInput) {
  const patient = await loadPatientForAccess(ctx, patientId);
  if (!patient) throw new NoteError("Client not found.");
  if (!ctx.staffProfileId) throw new NoteError("Only providers write clinical notes.");
  await authorize(ctx, resourceFor(input.noteType), "create", { patientId, assignedProviderId: patient.assignedProviderId ?? null });

  const { diagnosisCodes, serviceLines } = normalizeCodes(input);
  await validateCodes(diagnosisCodes, serviceLines);
  let appointmentId: Types.ObjectId | undefined;
  if (input.appointmentId) {
    const appt = await Appointment.findOne({ _id: input.appointmentId, patientId }, { _id: 1 }).setOptions({ authz: LOOKUP }).lean();
    if (!appt) throw new NoteError("That appointment doesn't belong to this client.");
    appointmentId = appt._id as Types.ObjectId;
  }

  const note = await createScoped(ClinicalNote, authzToken(ctx), {
    patientId,
    providerId: ctx.staffProfileId,
    appointmentId,
    noteType: input.noteType,
    ...encryptSections(input.sections),
    diagnosisCodes,
    serviceLines,
    status: "DRAFT",
  });
  await recordAudit(ctx, { action: "CREATE", resourceType: "ClinicalNote", resourceId: String(note._id), patientId, changedFields: Object.keys(input.sections).filter((k) => input.sections[k as Section]) });
  return String(note._id);
}

export async function updateDraft(ctx: AuthContext, noteId: string, input: Omit<NoteInput, "noteType" | "appointmentId">) {
  const note = await loadNote(ctx, noteId, "update");
  await requireAuthor(ctx, note, "edit draft");
  if (note.status === "SIGNED_LOCKED") throw new NoteError("This note is signed. Add an addendum instead.");

  const { diagnosisCodes, serviceLines } = normalizeCodes({ ...input, noteType: note.noteType as NoteInput["noteType"] });
  await validateCodes(diagnosisCodes, serviceLines);
  const before = decryptSections(note.toObject());
  Object.assign(note, encryptSections(input.sections), { diagnosisCodes, serviceLines });
  await authorizeDoc(note, authzToken(ctx)).save();

  const changed = SECTIONS.filter((s) => (before[s] ?? "") !== (input.sections[s]?.trim() ?? ""));
  await recordAudit(ctx, { action: "UPDATE", resourceType: "ClinicalNote", resourceId: noteId, patientId: String(note.patientId), changedFields: [...changed, "diagnosisCodes", "serviceLines"] });
}

export async function getNote(ctx: AuthContext, noteId: string) {
  const note = await loadNote(ctx, noteId, "read");
  const staff = await StaffProfile.find({ _id: { $in: [note.providerId, ...note.addenda.map((a) => a.authorId)] } }, { displayName: 1 }).lean();
  const name = new Map(staff.map((s) => [String(s._id), s.displayName]));
  await recordAudit(ctx, { action: "VIEW", resourceType: "ClinicalNote", resourceId: noteId, patientId: String(note.patientId) });
  return {
    id: noteId,
    patientId: String(note.patientId),
    noteType: note.noteType,
    status: note.status,
    author: name.get(String(note.providerId)),
    isAuthor: Boolean(ctx.staffProfileId && String(note.providerId) === ctx.staffProfileId),
    appointmentId: note.appointmentId ? String(note.appointmentId) : undefined,
    createdAt: note.get("createdAt") as Date,
    sections: decryptSections(note.toObject()),
    diagnosisCodes: note.diagnosisCodes,
    serviceLines: note.serviceLines.map((l) => ({ cptCode: l.cptCode, modifiers: l.modifiers ?? [], units: l.units ?? 1, minutes: l.minutes ?? undefined })),
    sessionMinutes: note.sessionMinutes ?? undefined,
    signature: note.signature ? { signerName: note.signature.signerName, signedAt: note.signature.signedAt, contentHash: note.signature.contentHash } : undefined,
    addenda: note.addenda.map((a) => ({ author: name.get(String(a.authorId)), createdAt: a.createdAt, text: decrypt(a.textEnc, ENC.noteAddendum) })),
  };
}

/** Sign and lock the note, then generate the draft claim for billable services. */
export async function signNote(ctx: AuthContext, noteId: string, evidence: SignatureContext) {
  const note = await loadNote(ctx, noteId, "sign");
  await requireAuthor(ctx, note, "sign");
  if (note.status === "SIGNED_LOCKED") throw new NoteError("This note is already signed.");
  const sections = decryptSections(note.toObject());
  if (!Object.values(sections).some((t) => t && t.trim().length > 0)) throw new NoteError("Add note content before signing.");

  const content = noteSigningContent({ id: noteId, ...sections, diagnosisCodes: note.diagnosisCodes, serviceLines: note.serviceLines });
  note.signature = buildSignature({
    content,
    signerId: ctx.userId,
    signerName: ctx.displayName ?? "Provider",
    signerRole: ctx.role,
    ipAddress: evidence.ipAddress,
    userAgent: evidence.userAgent,
    method: "CLICK",
  }) as unknown as typeof note.signature;
  note.status = "SIGNED_LOCKED";
  await authorizeDoc(note, authzToken(ctx)).save();
  await recordAudit(ctx, { action: "SIGN", resourceType: "ClinicalNote", resourceId: noteId, patientId: String(note.patientId), metadata: { contentHash: note.signature!.contentHash } });

  const claimId = note.noteType === "PSYCHOTHERAPY" || note.serviceLines.length === 0 ? null : await createClaimFromNote(ctx, noteId);
  return { claimId };
}

export async function addAddendum(ctx: AuthContext, noteId: string, text: string, evidence: SignatureContext) {
  const note = await loadNote(ctx, noteId, "update");
  const body = text.trim();
  if (body.length < 3) throw new NoteError("Write the addendum first.");
  if (note.status !== "SIGNED_LOCKED") throw new NoteError("Edit the draft directly; addenda are for signed notes.");
  if (!ctx.staffProfileId) throw new NoteError("Only providers add addenda.");

  note.addenda.push({
    authorId: new Types.ObjectId(ctx.staffProfileId),
    textEnc: encrypt(body.slice(0, 10_000), ENC.noteAddendum),
    signature: buildSignature({ content: body, signerId: ctx.userId, signerName: ctx.displayName ?? "Provider", signerRole: ctx.role, ipAddress: evidence.ipAddress, userAgent: evidence.userAgent, method: "CLICK" }),
  } as never);
  await authorizeDoc(note, authzToken(ctx)).save();
  await recordAudit(ctx, { action: "UPDATE", resourceType: "ClinicalNote", resourceId: noteId, patientId: String(note.patientId), changedFields: ["addenda"] });
}

/** Code lookup for the note editor (ICD-10-CM for diagnoses; CPT/HCPCS for services). */
export async function searchCodes(kind: "diagnosis" | "procedure", query: string) {
  const q = query.trim().toUpperCase();
  if (q.length < 2) return [];
  const systems: ("ICD10CM" | "CPT" | "HCPCS")[] = kind === "diagnosis" ? ["ICD10CM"] : ["CPT", "HCPCS"];
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return MedicalCode.find(
    { system: { $in: systems }, active: true, $or: [{ code: { $regex: `^${escaped}` } }, { description: { $regex: escaped, $options: "i" } }] },
    { code: 1, description: 1, system: 1, defaultFeeCents: 1 },
  )
    .limit(15)
    .lean();
}

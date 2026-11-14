import "server-only";

import { Types } from "mongoose";
import { recordAudit } from "@/lib/audit";
import { authorize, authorizeAny, authzToken, withScope, type AuthContext } from "@/lib/authz";
import { authorizeDoc, systemToken } from "@/lib/db/phi-guard";
import { DEFAULT_TZ } from "@/lib/services/scheduling";
import { createNote } from "@/lib/services/notes";
import { timeBasedCodeWarning } from "@/lib/telehealth";
import { zonedTime, dateKey } from "@/lib/tz";
import { Appointment, ClinicalNote, Patient, StaffProfile, TelehealthSession } from "@/models";

/**
 * Virtual visits: waiting room, admission, and visit timing. The visit's
 * duration is written to the linked draft note so time-based CPT codes can be
 * checked before the note is signed and the claim is generated.
 */

const LOOKUP = systemToken("telehealth-lookup");
export class TelehealthError extends Error {}

async function loadSession(ctx: AuthContext, sessionId: string, action: "read" | "update") {
  if (!Types.ObjectId.isValid(sessionId)) throw new TelehealthError("Visit not found.");
  const session = await TelehealthSession.findById(sessionId).setOptions({ authz: LOOKUP });
  if (!session) throw new TelehealthError("Visit not found.");
  const patient = await Patient.findById(session.patientId, { assignedProviderId: 1 }).setOptions({ authz: LOOKUP }).lean();
  await authorize(ctx, "telehealth", action, { resourceId: sessionId, patientId: session.patientId, assignedProviderId: patient?.assignedProviderId ?? null });
  return session;
}

/** Today's video visits (a provider sees their own; front desk and admins see all). */
export async function waitingRoom(ctx: AuthContext, date = dateKey(new Date(), DEFAULT_TZ)) {
  await authorizeAny(ctx, "telehealth", "read");
  const start = zonedTime(date, "00:00", DEFAULT_TZ);
  const end = zonedTime(date, "23:59", DEFAULT_TZ);
  const appointments = await Appointment.find(
    await withScope(ctx, "appointment", {
      mode: "VIRTUAL",
      scheduledStart: { $gte: start, $lte: end },
      status: { $nin: ["CANCELLED", "LATE_CANCELLED"] },
      ...(ctx.role === "PROVIDER" ? { providerId: ctx.staffProfileId } : {}),
    }),
    { scheduledStart: 1, scheduledEnd: 1, patientId: 1, providerId: 1, status: 1 },
  )
    .sort({ scheduledStart: 1 })
    .setOptions({ authz: authzToken(ctx) })
    .lean();
  const [sessions, patients, staff] = await Promise.all([
    TelehealthSession.find({ appointmentId: { $in: appointments.map((a) => a._id) } }).setOptions({ authz: LOOKUP }).lean(),
    Patient.find({ _id: { $in: appointments.map((a) => a.patientId) } }, { firstName: 1, lastName: 1 }).setOptions({ authz: LOOKUP }).lean(),
    StaffProfile.find({ _id: { $in: appointments.map((a) => a.providerId) } }, { displayName: 1 }).lean(),
  ]);
  const byAppointment = new Map(sessions.map((s) => [String(s.appointmentId), s]));
  const patientName = new Map(patients.map((p) => [String(p._id), `${p.firstName} ${p.lastName}`]));
  const providerName = new Map(staff.map((s) => [String(s._id), s.displayName]));
  await recordAudit(ctx, { action: "VIEW", resourceType: "WaitingRoom", metadata: { date, results: appointments.length } });
  return appointments
    .map((a) => {
      const s = byAppointment.get(String(a._id));
      return s
        ? {
            sessionId: String(s._id),
            patient: patientName.get(String(a.patientId)) ?? "Client",
            provider: providerName.get(String(a.providerId)),
            start: a.scheduledStart,
            status: s.status,
            waitingSince: s.waitingSince ?? undefined,
            startedAt: s.startedAt ?? undefined,
            durationSeconds: s.durationSeconds ?? undefined,
          }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

export async function getVisit(ctx: AuthContext, sessionId: string) {
  const session = await loadSession(ctx, sessionId, "read");
  const appointment = await Appointment.findById(session.appointmentId).setOptions({ authz: LOOKUP }).lean();
  const note = appointment
    ? await ClinicalNote.findOne({ appointmentId: appointment._id, providerId: session.providerId, noteType: { $ne: "PSYCHOTHERAPY" } }, { status: 1, serviceLines: 1, sessionMinutes: 1 })
        .sort({ createdAt: -1 })
        .setOptions({ authz: LOOKUP })
        .lean()
    : null;
  await recordAudit(ctx, { action: "VIEW", resourceType: "TelehealthSession", resourceId: sessionId, patientId: String(session.patientId) });
  const minutes = session.durationSeconds ? Math.round(session.durationSeconds / 60) : note?.sessionMinutes ?? undefined;
  return {
    sessionId,
    status: session.status,
    patientId: String(session.patientId),
    providerId: String(session.providerId),
    isProvider: ctx.staffProfileId === String(session.providerId),
    appointment: appointment ? { id: String(appointment._id), start: appointment.scheduledStart, end: appointment.scheduledEnd, visitType: appointment.visitType } : null,
    waitingSince: session.waitingSince ?? undefined,
    startedAt: session.startedAt ?? undefined,
    endedAt: session.endedAt ?? undefined,
    minutes,
    note: note ? { id: String(note._id), status: note.status } : null,
    codeWarnings: (note?.serviceLines ?? []).map((l) => timeBasedCodeWarning(l.cptCode, minutes)).filter((w): w is string => Boolean(w)),
  };
}

async function requireVisitProvider(ctx: AuthContext, session: { providerId: Types.ObjectId }) {
  if (ctx.staffProfileId !== String(session.providerId)) throw new TelehealthError("Only the visit's provider can do that.");
}

export async function admit(ctx: AuthContext, sessionId: string) {
  const session = await loadSession(ctx, sessionId, "update");
  await requireVisitProvider(ctx, session);
  if (!["IN_WAITING_ROOM", "NOT_ARRIVED"].includes(session.status)) throw new TelehealthError("This visit has already started or ended.");
  const now = new Date();
  session.status = "IN_SESSION";
  session.admittedAt = now;
  session.startedAt = session.startedAt ?? now;
  session.events.push({ type: "ADMITTED", at: now, by: new Types.ObjectId(ctx.userId) } as never);
  await authorizeDoc(session, authzToken(ctx)).save();
  await Appointment.updateOne({ _id: session.appointmentId }, { $set: { status: "IN_SESSION" } }).setOptions({ authz: LOOKUP });
  await recordAudit(ctx, { action: "UPDATE", resourceType: "TelehealthSession", resourceId: sessionId, patientId: String(session.patientId), changedFields: ["status"], metadata: { to: "IN_SESSION" } });
}

export async function endVisit(ctx: AuthContext, sessionId: string) {
  const session = await loadSession(ctx, sessionId, "update");
  await requireVisitProvider(ctx, session);
  if (session.status !== "IN_SESSION") throw new TelehealthError("Only a visit in progress can be ended.");
  const now = new Date();
  session.status = "COMPLETED";
  session.endedAt = now;
  session.events.push({ type: "ENDED", at: now, by: new Types.ObjectId(ctx.userId) } as never);
  await authorizeDoc(session, authzToken(ctx)).save(); // durationSeconds computed by the model
  const minutes = Math.round((session.durationSeconds ?? 0) / 60);

  await Appointment.updateOne({ _id: session.appointmentId }, { $set: { status: "COMPLETED" } }).setOptions({ authz: LOOKUP });
  // Record the length on the visit's draft note (signed notes are locked).
  const note = await ClinicalNote.findOne({ appointmentId: session.appointmentId, providerId: session.providerId, status: "DRAFT" }).setOptions({ authz: LOOKUP });
  if (note) {
    note.sessionMinutes = minutes;
    note.serviceLines.forEach((l) => {
      l.minutes = minutes;
    });
    await authorizeDoc(note, authzToken(ctx)).save();
  }
  await recordAudit(ctx, { action: "UPDATE", resourceType: "TelehealthSession", resourceId: sessionId, patientId: String(session.patientId), changedFields: ["status", "endedAt", "durationSeconds"], metadata: { minutes } });
  return { minutes };
}

/** Start the visit's SOAP note (linked to the appointment, with the session length if the visit already ended). */
export async function startVisitNote(ctx: AuthContext, sessionId: string) {
  const session = await loadSession(ctx, sessionId, "read");
  await requireVisitProvider(ctx, session);
  const existing = await ClinicalNote.findOne({ appointmentId: session.appointmentId, providerId: session.providerId, noteType: { $ne: "PSYCHOTHERAPY" } }, { _id: 1 })
    .setOptions({ authz: LOOKUP })
    .lean();
  if (existing) return String(existing._id);
  const noteId = await createNote(ctx, String(session.patientId), {
    noteType: "SOAP",
    appointmentId: String(session.appointmentId),
    sections: {},
    diagnosisCodes: [],
    serviceLines: [],
  });
  if (session.durationSeconds) {
    await ClinicalNote.updateOne({ _id: noteId, status: "DRAFT" }, { $set: { sessionMinutes: Math.round(session.durationSeconds / 60) } }).setOptions({ authz: LOOKUP });
  }
  return noteId;
}

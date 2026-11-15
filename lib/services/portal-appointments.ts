import "server-only";

import { Types } from "mongoose";
import { recordAudit } from "@/lib/audit";
import { authorizeAny, authzToken, withScope, type AuthContext } from "@/lib/authz";
import { systemToken } from "@/lib/db/phi-guard";
import { availableSlots, bookAppointment, cancelAppointment, checkIn, DEFAULT_TZ, listProviders, SchedulingError, signedPolicy } from "@/lib/services/scheduling";
import { addDays, dateKey } from "@/lib/tz";
import { ACTIVE_APPOINTMENT_STATUSES, Appointment, Patient, SignedConsent, StaffProfile, TelehealthSession, type ConsentType } from "@/models";

/**
 * The client's side of scheduling: their visits, self-booking (patient-
 * bookable visit types with their own provider), cancellation with the signed
 * policy shown up front, and joining a video visit's waiting room.
 */

const LOOKUP = systemToken("portal-appointments");
export const JOIN_EARLY_MINUTES = 15;
type Mode = "IN_PERSON" | "VIRTUAL";

function requirePatient(ctx: AuthContext) {
  if (ctx.role !== "PATIENT" || !ctx.patientId) throw new SchedulingError("Your account isn't linked to a client record yet.");
  return ctx.patientId;
}

/** Can the client join this video visit now? (15 minutes before start until it ends.) */
export function joinWindow(a: { mode: string; status: string; scheduledStart: Date; scheduledEnd: Date }, now = new Date()) {
  if (a.mode !== "VIRTUAL" || !["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_SESSION"].includes(a.status)) return "closed" as const;
  const opens = a.scheduledStart.getTime() - JOIN_EARLY_MINUTES * 60_000;
  if (now.getTime() < opens) return "not-yet" as const;
  if (now.getTime() > a.scheduledEnd.getTime()) return "closed" as const;
  return "open" as const;
}

async function hasCurrentConsent(patientId: string, type: ConsentType, now: Date) {
  return Boolean(
    await SignedConsent.exists({ patientId, consentType: type, revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }).setOptions({ authz: LOOKUP }),
  );
}

async function visitNames(providerIds: unknown[]) {
  const providers = await listProviders();
  const staff = await StaffProfile.find({ _id: { $in: providerIds } }, { displayName: 1 }).lean();
  return {
    provider: new Map(staff.map((s) => [String(s._id), s.displayName])),
    visit: (providerId: string, key: string) => providers.find((p) => p.id === providerId)?.visitTypes.find((v) => v.key === key)?.name ?? key,
  };
}

export async function myAppointments(ctx: AuthContext, now = new Date()) {
  requirePatient(ctx);
  await authorizeAny(ctx, "appointment", "read");
  const appointments = await Appointment.find(await withScope(ctx, "appointment", {}), { scheduledStart: 1, scheduledEnd: 1, status: 1, mode: 1, visitType: 1, providerId: 1, location: 1, cancellation: 1 })
    .sort({ scheduledStart: -1 })
    .limit(100)
    .setOptions({ authz: authzToken(ctx) })
    .lean();
  const names = await visitNames(appointments.map((a) => a.providerId));
  await recordAudit(ctx, { action: "VIEW", resourceType: "PortalAppointments", patientId: ctx.patientId });
  const rows = appointments.map((a) => ({
    id: String(a._id),
    start: a.scheduledStart,
    end: a.scheduledEnd,
    status: a.status,
    mode: a.mode as Mode,
    visit: names.visit(String(a.providerId), a.visitType),
    provider: names.provider.get(String(a.providerId)) ?? "Your provider",
    location: a.location ?? undefined,
    join: joinWindow(a, now),
    cancellable: (ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(a.status) && a.status !== "IN_SESSION" && a.scheduledStart > now,
    lateCancelled: a.status === "LATE_CANCELLED",
    feeInvoiced: Boolean(a.cancellation?.feeInvoiceId),
  }));
  const upcoming = rows.filter((r) => r.end >= now && (ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(r.status)).reverse();
  const past = rows.filter((r) => !upcoming.includes(r));
  return { upcoming, past };
}

/** Providers and visit types the client may book themselves. */
export async function bookingOptions(ctx: AuthContext, now = new Date()) {
  const patientId = requirePatient(ctx);
  const [patient, providers, telehealthConsent] = await Promise.all([
    Patient.findById(patientId, { assignedProviderId: 1 }).setOptions({ authz: LOOKUP }).lean(),
    listProviders(),
    hasCurrentConsent(patientId, "TELEHEALTH_CONSENT", now),
  ]);
  const assigned = patient?.assignedProviderId ? String(patient.assignedProviderId) : null;
  const allowed = providers
    .filter((p) => !assigned || p.id === assigned)
    .map((p) => ({ id: p.id, name: p.name, visitTypes: p.visitTypes.filter((v) => v.patientBookable).map((v) => ({ key: v.key, name: v.name, durationMinutes: v.durationMinutes, modes: (v.modes?.length ? v.modes : ["IN_PERSON", "VIRTUAL"]) as Mode[] })) }))
    .filter((p) => p.visitTypes.length > 0);
  return { providers: allowed, telehealthConsent };
}

/** Open times over the next 7 days, grouped by day (provider's time zone). */
export async function weekSlots(ctx: AuthContext, input: { providerId: string; visitType: string; mode: Mode; from?: string }, now = new Date()) {
  const { providers } = await bookingOptions(ctx, now);
  const provider = providers.find((p) => p.id === input.providerId);
  if (!provider) throw new SchedulingError("You can book with your own provider only. Message us to see someone else.");
  if (!provider.visitTypes.some((v) => v.key === input.visitType && v.modes.includes(input.mode))) throw new SchedulingError("That visit type isn't available to book online in this format.");
  const today = dateKey(now, DEFAULT_TZ);
  const from = input.from && input.from > today ? input.from : today;
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(from, i);
    const slots = await availableSlots({ providerId: input.providerId, date, visitType: input.visitType, mode: input.mode, patientBookableOnly: true }, now);
    // Clients see half-hour starts only (staff can book any 15-minute slot).
    days.push({ date, slots: slots.filter((t) => t.getUTCMinutes() % 30 === 0) });
  }
  return { from, days };
}

export async function bookMine(ctx: AuthContext, input: { providerId: string; visitType: string; mode: Mode; start: string }, now = new Date()) {
  const patientId = requirePatient(ctx);
  const { providers, telehealthConsent } = await bookingOptions(ctx, now);
  if (!providers.some((p) => p.id === input.providerId)) throw new SchedulingError("You can book with your own provider only.");
  if (input.mode === "VIRTUAL" && !telehealthConsent) throw new SchedulingError("Sign the telehealth consent before booking a video visit (Consents page).");
  return bookAppointment(ctx, { ...input, patientId }, now);
}

/** What cancelling now would mean under the client's signed policy. */
export async function cancellationPreview(ctx: AuthContext, appointmentId: string, now = new Date()) {
  const patientId = requirePatient(ctx);
  if (!Types.ObjectId.isValid(appointmentId)) throw new SchedulingError("Appointment not found.");
  const appointment = await Appointment.findOne({ _id: appointmentId, patientId }, { scheduledStart: 1, scheduledEnd: 1, status: 1, mode: 1, visitType: 1, providerId: 1 }).setOptions({ authz: authzToken(ctx) }).lean();
  if (!appointment) throw new SchedulingError("Appointment not found.");
  const policy = await signedPolicy(patientId);
  const hoursNotice = Math.round(((appointment.scheduledStart.getTime() - now.getTime()) / 3_600_000) * 10) / 10;
  const late = Boolean(policy?.lateCancellationHours && hoursNotice < policy.lateCancellationHours);
  const names = await visitNames([appointment.providerId]);
  return {
    id: appointmentId,
    start: appointment.scheduledStart,
    visit: names.visit(String(appointment.providerId), appointment.visitType),
    provider: names.provider.get(String(appointment.providerId)) ?? "Your provider",
    mode: appointment.mode as Mode,
    cancellable: (ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(appointment.status) && appointment.status !== "IN_SESSION" && appointment.scheduledStart > now,
    hoursNotice,
    late,
    feeCents: late ? (policy?.lateCancellationFeeCents ?? 0) : 0,
    policyHours: policy?.lateCancellationHours ?? null,
    policyVersion: policy?.version ?? null,
  };
}

export async function cancelMine(ctx: AuthContext, appointmentId: string, reason: string, now = new Date()) {
  requirePatient(ctx);
  const preview = await cancellationPreview(ctx, appointmentId, now);
  if (!preview.cancellable) throw new SchedulingError("This appointment can't be cancelled online. Please message us.");
  return cancelAppointment(ctx, appointmentId, { reason }, now);
}

/** Enter the video waiting room (checks the client in). */
export async function joinVideo(ctx: AuthContext, appointmentId: string, now = new Date()) {
  const patientId = requirePatient(ctx);
  if (!Types.ObjectId.isValid(appointmentId)) throw new SchedulingError("Appointment not found.");
  const appointment = await Appointment.findOne({ _id: appointmentId, patientId }, { scheduledStart: 1, scheduledEnd: 1, status: 1, mode: 1 }).setOptions({ authz: authzToken(ctx) }).lean();
  if (!appointment) throw new SchedulingError("Appointment not found.");
  const window = joinWindow(appointment, now);
  if (window === "not-yet") throw new SchedulingError(`The waiting room opens ${JOIN_EARLY_MINUTES} minutes before your visit.`);
  if (window === "closed") throw new SchedulingError("This visit isn't available to join.");
  if (!(await hasCurrentConsent(patientId, "TELEHEALTH_CONSENT", now))) throw new SchedulingError("Sign the telehealth consent before joining (Consents page).");
  if (["SCHEDULED", "CONFIRMED"].includes(appointment.status)) await checkIn(ctx, appointmentId);
}

/** The client's view of a video visit (waiting room / in session). */
export async function myVisit(ctx: AuthContext, appointmentId: string, now = new Date()) {
  const patientId = requirePatient(ctx);
  if (!Types.ObjectId.isValid(appointmentId)) throw new SchedulingError("Appointment not found.");
  const appointment = await Appointment.findOne({ _id: appointmentId, patientId }, { scheduledStart: 1, scheduledEnd: 1, status: 1, mode: 1, visitType: 1, providerId: 1 }).setOptions({ authz: authzToken(ctx) }).lean();
  if (!appointment || appointment.mode !== "VIRTUAL") throw new SchedulingError("Appointment not found.");
  const session = await TelehealthSession.findOne({ appointmentId: appointment._id }, { status: 1, waitingSince: 1, startedAt: 1, endedAt: 1 }).setOptions({ authz: LOOKUP }).lean();
  const names = await visitNames([appointment.providerId]);
  await recordAudit(ctx, { action: "VIEW", resourceType: "TelehealthSession", resourceId: session ? String(session._id) : undefined, patientId });
  return {
    id: appointmentId,
    start: appointment.scheduledStart,
    end: appointment.scheduledEnd,
    visit: names.visit(String(appointment.providerId), appointment.visitType),
    provider: names.provider.get(String(appointment.providerId)) ?? "Your provider",
    join: joinWindow(appointment, now),
    status: session?.status ?? "NOT_ARRIVED",
    waitingSince: session?.waitingSince ?? undefined,
    startedAt: session?.startedAt ?? undefined,
  };
}

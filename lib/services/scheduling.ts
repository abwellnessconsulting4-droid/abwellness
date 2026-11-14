import "server-only";

import { createHash, randomBytes } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { AuditedDenial, recordAudit } from "@/lib/audit";
import { authorize, authorizeAny, authzToken, withScope, type AuthContext } from "@/lib/authz";
import { authorizeDoc, createScoped, systemToken } from "@/lib/db/phi-guard";
import { isStaff } from "@/lib/rbac";
import { createFeeInvoice } from "@/lib/services/billing";
import { loadPatientForAccess } from "@/lib/services/patients";
import { dateKey, weekdayOf, zonedTime } from "@/lib/tz";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  Appointment,
  AppointmentSlot,
  ConsentTemplate,
  Patient,
  ProviderSchedule,
  SignedConsent,
  slotStartsFor,
  StaffProfile,
  TelehealthSession,
  WaitlistEntry,
} from "@/models";

/**
 * Scheduling: availability from each provider's weekly hours, transactional
 * booking (appointment + 15-minute slot reservations, so double-booking fails
 * atomically), check-in, no-shows, cancellations with the signed late-cancel
 * policy (Use Case 5), and the waitlist.
 */

const LOOKUP = systemToken("scheduling-lookup");
const STEP_MINUTES = 15;
export const DEFAULT_TZ = "America/New_York";

export class SchedulingError extends Error {}

type Mode = "IN_PERSON" | "VIRTUAL";

export interface SlotQuery {
  providerId: string;
  date: string; // YYYY-MM-DD in the provider's time zone
  visitType: string;
  mode: Mode;
  patientBookableOnly?: boolean;
}

async function scheduleFor(providerId: string) {
  if (!Types.ObjectId.isValid(providerId)) throw new SchedulingError("Unknown provider.");
  const schedule = await ProviderSchedule.findOne({ providerId }).lean();
  if (!schedule) throw new SchedulingError("This provider has no schedule set up.");
  return schedule;
}

/** Bookable providers (those with a weekly schedule), for pickers. */
export async function listProviders() {
  const schedules = await ProviderSchedule.find({}, { providerId: 1, visitTypes: 1, timezone: 1 }).lean();
  const staff = await StaffProfile.find({ _id: { $in: schedules.map((s) => s.providerId) }, active: true }, { displayName: 1 }).lean();
  const name = new Map(staff.map((s) => [String(s._id), s.displayName]));
  return schedules
    .filter((s) => name.has(String(s.providerId)))
    .map((s) => ({ id: String(s.providerId), name: name.get(String(s.providerId))!, timezone: s.timezone, visitTypes: s.visitTypes }));
}

/** Open start times for a visit on a date (provider's local time), excluding conflicts and buffers. */
export async function availableSlots(query: SlotQuery, now = new Date()) {
  const schedule = await scheduleFor(query.providerId);
  const tz = schedule.timezone || DEFAULT_TZ;
  const visit = schedule.visitTypes.find((v) => v.key === query.visitType);
  if (!visit) throw new SchedulingError("Unknown visit type for this provider.");
  if (query.patientBookableOnly && !visit.patientBookable) throw new SchedulingError("This visit type is booked by the office.");
  if (visit.modes.length && !visit.modes.includes(query.mode)) throw new SchedulingError("That visit type isn't offered in this format.");

  const weekday = weekdayOf(query.date);
  const blocks = schedule.weeklyAvailability.filter((b) => b.dayOfWeek === weekday && (b.mode === "HYBRID" || b.mode === query.mode));
  if (blocks.length === 0) return [];

  const dayStart = zonedTime(query.date, "00:00", tz);
  const dayEnd = new Date(dayStart.getTime() + 36 * 3_600_000);
  const existing = await Appointment.find(
    { providerId: query.providerId, status: { $in: ACTIVE_APPOINTMENT_STATUSES }, scheduledStart: { $lt: dayEnd }, scheduledEnd: { $gt: dayStart } },
    { scheduledStart: 1, scheduledEnd: 1 },
  )
    .setOptions({ authz: LOOKUP })
    .lean();
  const buffer = (schedule.bufferMinutes ?? 0) * 60_000;
  const duration = visit.durationMinutes * 60_000;
  const busy = [
    ...existing.map((a) => ({ start: a.scheduledStart.getTime() - buffer, end: a.scheduledEnd.getTime() + buffer })),
    ...schedule.exceptions.map((e) => ({ start: new Date(e.startsAt).getTime(), end: new Date(e.endsAt).getTime() })),
  ];

  const slots: Date[] = [];
  for (const block of blocks) {
    const blockStart = zonedTime(query.date, block.startTime, tz).getTime();
    const blockEnd = zonedTime(query.date, block.endTime, tz).getTime();
    for (let t = blockStart; t + duration <= blockEnd; t += STEP_MINUTES * 60_000) {
      if (t <= now.getTime()) continue;
      if (busy.some((b) => b.start < t + duration && b.end > t)) continue;
      slots.push(new Date(t));
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime());
}

export interface BookInput {
  patientId: string;
  providerId: string;
  visitType: string;
  mode: Mode;
  start: string; // ISO instant
  location?: string;
}

function newJoinToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export async function bookAppointment(ctx: AuthContext, input: BookInput, now = new Date()) {
  const patient = await loadPatientForAccess(ctx, input.patientId);
  if (!patient) throw new SchedulingError("Client not found.");
  await authorize(ctx, "appointment", "create", { patientId: input.patientId, assignedProviderId: patient.assignedProviderId ?? null });

  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) throw new SchedulingError("Choose a time.");
  const schedule = await scheduleFor(input.providerId);
  const tz = schedule.timezone || DEFAULT_TZ;
  const open = await availableSlots(
    { providerId: input.providerId, date: dateKey(start, tz), visitType: input.visitType, mode: input.mode, patientBookableOnly: ctx.role === "PATIENT" },
    now,
  );
  if (!open.some((s) => s.getTime() === start.getTime())) throw new SchedulingError("That time isn't available any more. Pick another.");
  const visit = schedule.visitTypes.find((v) => v.key === input.visitType)!;
  const end = new Date(start.getTime() + visit.durationMinutes * 60_000);

  const session = await mongoose.startSession();
  let appointmentId = "";
  try {
    await session.withTransaction(async () => {
      const appointment = await createScoped(
        Appointment,
        authzToken(ctx),
        {
          patientId: input.patientId,
          providerId: input.providerId,
          visitType: input.visitType,
          mode: input.mode,
          scheduledStart: start,
          scheduledEnd: end,
          status: "SCHEDULED",
          location: input.mode === "IN_PERSON" ? input.location || "Office" : undefined,
          bookedBy: ctx.userId,
          bookedByRole: ctx.role,
        },
        { session },
      );
      appointmentId = String(appointment._id);
      await AppointmentSlot.create(
        slotStartsFor(start, end).map((slotStart) => ({ providerId: input.providerId, slotStart, appointmentId: appointment._id })),
        { session, ordered: true },
      );
      if (input.mode === "VIRTUAL") {
        // Only a hash is stored; the join link token is (re)issued when reminders go out.
        const { hash } = newJoinToken();
        const telehealth = await createScoped(
          TelehealthSession,
          authzToken(ctx),
          {
            appointmentId: appointment._id,
            patientId: input.patientId,
            providerId: input.providerId,
            videoProvider: process.env.TELEHEALTH_PROVIDER === "daily" ? "DAILY" : "MOCK",
            roomName: `abw-${appointment._id}`,
            patientTokenHash: hash,
            tokenExpiresAt: new Date(end.getTime() + 30 * 60_000),
          },
          { session },
        );
        appointment.telehealthSessionId = telehealth._id;
        await authorizeDoc(appointment, authzToken(ctx)).save({ session });
      }
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new SchedulingError("That time was just booked by someone else. Pick another.");
    throw error;
  } finally {
    await session.endSession();
  }

  await recordAudit(ctx, { action: "CREATE", resourceType: "Appointment", resourceId: appointmentId, patientId: input.patientId, metadata: { mode: input.mode, visitType: input.visitType } });
  return appointmentId;
}

async function loadAppointment(ctx: AuthContext, appointmentId: string) {
  if (!Types.ObjectId.isValid(appointmentId)) throw new SchedulingError("Appointment not found.");
  const appointment = await Appointment.findById(appointmentId).setOptions({ authz: LOOKUP });
  if (!appointment) throw new SchedulingError("Appointment not found.");
  const patient = await Patient.findById(appointment.patientId, { assignedProviderId: 1 }).setOptions({ authz: LOOKUP }).lean();
  await authorize(ctx, "appointment", "update", { resourceId: appointmentId, patientId: appointment.patientId, assignedProviderId: patient?.assignedProviderId ?? null });
  return appointment;
}

/** The cancellation/no-show terms from the client's current signed financial agreement. */
async function signedPolicy(patientId: Types.ObjectId | string) {
  const signed = await SignedConsent.findOne({ patientId, consentType: "FINANCIAL_RESPONSIBILITY", revokedAt: null }).sort({ "signature.signedAt": -1 }).setOptions({ authz: LOOKUP }).lean();
  if (!signed) return null;
  const template = await ConsentTemplate.findById(signed.templateId, { terms: 1, version: 1 }).lean();
  return template?.terms ? { ...template.terms, version: signed.version } : null;
}

/** Waiting entries that fit a freed slot, best first. */
export async function waitlistMatches(slot: { providerId: Types.ObjectId | string; mode: Mode; start: Date }, tz = DEFAULT_TZ) {
  const weekday = weekdayOf(dateKey(slot.start, tz));
  const entries = await WaitlistEntry.find({
    status: "WAITING",
    $and: [
      { $or: [{ providerId: null }, { providerId: slot.providerId }] },
      { $or: [{ modes: { $size: 0 } }, { modes: slot.mode }] },
      { $or: [{ preferredDays: { $size: 0 } }, { preferredDays: weekday }] },
      { $or: [{ earliestDate: null }, { earliestDate: { $lte: slot.start } }] },
      { $or: [{ latestDate: null }, { latestDate: { $gte: slot.start } }] },
    ],
  })
    .sort({ priority: -1, createdAt: 1 })
    .setOptions({ authz: LOOKUP })
    .lean();
  const patients = await Patient.find({ _id: { $in: entries.map((e) => e.patientId) } }, { firstName: 1, lastName: 1, mrn: 1 }).setOptions({ authz: LOOKUP }).lean();
  const name = new Map(patients.map((p) => [String(p._id), `${p.firstName} ${p.lastName}`]));
  return entries.map((e) => ({ id: String(e._id), patientName: name.get(String(e.patientId)) ?? "Client", patientId: String(e.patientId) }));
}

export interface CancelResult {
  status: "CANCELLED" | "LATE_CANCELLED";
  feeInvoiceId?: string;
  hoursNotice: number;
  freedSlot: { providerId: string; mode: Mode; visitType: string; start: string };
  matches: Awaited<ReturnType<typeof waitlistMatches>>;
}

export async function cancelAppointment(ctx: AuthContext, appointmentId: string, input: { reason: string; waiveFee?: boolean }, now = new Date()): Promise<CancelResult> {
  const appointment = await loadAppointment(ctx, appointmentId);
  if (!(ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(appointment.status)) throw new SchedulingError("This appointment can't be cancelled.");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new SchedulingError("Give a short reason for the cancellation.");
  if (input.waiveFee && !isStaff(ctx.role)) throw new AuditedDenial("Only staff can waive fees.");

  const hoursNotice = Math.round(((appointment.scheduledStart.getTime() - now.getTime()) / 3_600_000) * 10) / 10;
  const policy = await signedPolicy(appointment.patientId);
  const late = Boolean(policy?.lateCancellationHours && hoursNotice < policy.lateCancellationHours);
  const charge = late && !input.waiveFee && (policy?.lateCancellationFeeCents ?? 0) > 0;

  const session = await mongoose.startSession();
  let feeInvoiceId: string | undefined;
  try {
    await session.withTransaction(async () => {
      if (charge) {
        const invoice = await createFeeInvoice(
          ctx,
          {
            patientId: String(appointment.patientId),
            appointmentId,
            kind: "LATE_CANCELLATION",
            amountCents: policy!.lateCancellationFeeCents!,
            description: `Late cancellation fee (${hoursNotice} hours' notice; policy requires ${policy!.lateCancellationHours})`,
            policyVersion: policy!.version,
          },
          { session },
        );
        feeInvoiceId = String(invoice._id);
      }
      appointment.status = late ? "LATE_CANCELLED" : "CANCELLED";
      appointment.cancellation = { at: now, by: new Types.ObjectId(ctx.userId), byRole: ctx.role, reason: reason.slice(0, 500), hoursNotice, feeInvoiceId: feeInvoiceId ? new Types.ObjectId(feeInvoiceId) : undefined, feeWaived: late && Boolean(input.waiveFee) } as never;
      await authorizeDoc(appointment, authzToken(ctx)).save({ session });
      await AppointmentSlot.deleteMany({ appointmentId: appointment._id }, { session });
      await TelehealthSession.updateOne({ appointmentId: appointment._id }, { $set: { status: "CANCELLED" } }, { session }).setOptions({ authz: LOOKUP });
    });
  } finally {
    await session.endSession();
  }

  await recordAudit(ctx, { action: "UPDATE", resourceType: "Appointment", resourceId: appointmentId, patientId: String(appointment.patientId), reason, changedFields: ["status", "cancellation"], metadata: { hoursNotice, late, feeCharged: charge, feeWaived: late && Boolean(input.waiveFee) } });

  const tz = (await ProviderSchedule.findOne({ providerId: appointment.providerId }, { timezone: 1 }).lean())?.timezone ?? DEFAULT_TZ;
  const matches = isStaff(ctx.role) ? await waitlistMatches({ providerId: appointment.providerId, mode: appointment.mode, start: appointment.scheduledStart }, tz) : [];
  return {
    status: appointment.status as CancelResult["status"],
    feeInvoiceId,
    hoursNotice,
    freedSlot: { providerId: String(appointment.providerId), mode: appointment.mode, visitType: appointment.visitType, start: appointment.scheduledStart.toISOString() },
    matches,
  };
}

export async function checkIn(ctx: AuthContext, appointmentId: string) {
  const appointment = await loadAppointment(ctx, appointmentId);
  if (!["SCHEDULED", "CONFIRMED"].includes(appointment.status)) throw new SchedulingError("Only upcoming appointments can be checked in.");
  appointment.status = "CHECKED_IN";
  await authorizeDoc(appointment, authzToken(ctx)).save();
  if (appointment.mode === "VIRTUAL") {
    await TelehealthSession.updateOne(
      { appointmentId: appointment._id, status: "NOT_ARRIVED" },
      { $set: { status: "IN_WAITING_ROOM", waitingSince: new Date() }, $push: { events: { type: "PATIENT_JOINED_WAITING_ROOM", at: new Date(), by: new Types.ObjectId(ctx.userId) } } },
    ).setOptions({ authz: LOOKUP });
  }
  await recordAudit(ctx, { action: "UPDATE", resourceType: "Appointment", resourceId: appointmentId, patientId: String(appointment.patientId), changedFields: ["status"], metadata: { to: "CHECKED_IN" } });
}

export async function markNoShow(ctx: AuthContext, appointmentId: string, input: { waiveFee?: boolean } = {}, now = new Date()) {
  const appointment = await loadAppointment(ctx, appointmentId);
  if (!["SCHEDULED", "CONFIRMED", "CHECKED_IN"].includes(appointment.status)) throw new SchedulingError("This appointment can't be marked as a no-show.");
  if (appointment.scheduledStart > now) throw new SchedulingError("An appointment can only be a no-show after its start time.");
  const policy = await signedPolicy(appointment.patientId);
  const charge = !input.waiveFee && (policy?.noShowFeeCents ?? 0) > 0;
  let feeInvoiceId: string | undefined;
  if (charge) {
    const invoice = await createFeeInvoice(ctx, {
      patientId: String(appointment.patientId),
      appointmentId,
      kind: "NO_SHOW",
      amountCents: policy!.noShowFeeCents!,
      description: "Missed appointment fee",
      policyVersion: policy!.version,
    });
    feeInvoiceId = String(invoice._id);
  }
  appointment.status = "NO_SHOW";
  await authorizeDoc(appointment, authzToken(ctx)).save();
  await AppointmentSlot.deleteMany({ appointmentId: appointment._id });
  await recordAudit(ctx, { action: "UPDATE", resourceType: "Appointment", resourceId: appointmentId, patientId: String(appointment.patientId), changedFields: ["status"], metadata: { to: "NO_SHOW", feeCharged: charge } });
  return { feeInvoiceId };
}

export async function listDay(ctx: AuthContext, input: { date: string; providerId?: string }, tz = DEFAULT_TZ) {
  await authorizeAny(ctx, "appointment", "read");
  const start = zonedTime(input.date, "00:00", tz);
  const end = zonedTime(input.date, "23:59", tz);
  const filter: Record<string, unknown> = { scheduledStart: { $gte: start, $lte: end } };
  if (input.providerId && Types.ObjectId.isValid(input.providerId)) filter.providerId = input.providerId;
  const rows = await Appointment.find(await withScope(ctx, "appointment", filter)).sort({ scheduledStart: 1 }).setOptions({ authz: authzToken(ctx) }).lean();
  const [patients, staff, schedules] = await Promise.all([
    Patient.find({ _id: { $in: rows.map((r) => r.patientId) } }, { firstName: 1, lastName: 1, mrn: 1 }).setOptions({ authz: LOOKUP }).lean(),
    StaffProfile.find({ _id: { $in: rows.map((r) => r.providerId) } }, { displayName: 1 }).lean(),
    ProviderSchedule.find({ providerId: { $in: rows.map((r) => r.providerId) } }, { providerId: 1, visitTypes: 1 }).lean(),
  ]);
  const visitName = new Map(schedules.flatMap((s) => s.visitTypes.map((v) => [`${s.providerId}:${v.key}`, v.name] as const)));
  const patientName = new Map(patients.map((p) => [String(p._id), { name: `${p.firstName} ${p.lastName}`, mrn: p.mrn }]));
  const providerName = new Map(staff.map((s) => [String(s._id), s.displayName]));
  await recordAudit(ctx, { action: "VIEW", resourceType: "Schedule", metadata: { date: input.date, results: rows.length } });
  return rows.map((r) => ({
    id: String(r._id),
    patientId: String(r.patientId),
    patient: patientName.get(String(r.patientId))?.name ?? "Client",
    mrn: patientName.get(String(r.patientId))?.mrn,
    provider: providerName.get(String(r.providerId)),
    providerId: String(r.providerId),
    start: r.scheduledStart,
    end: r.scheduledEnd,
    mode: r.mode,
    visitType: visitName.get(`${r.providerId}:${r.visitType}`) ?? r.visitType,
    status: r.status,
    fee: r.cancellation?.feeInvoiceId ? "fee invoiced" : r.cancellation?.feeWaived ? "fee waived" : undefined,
  }));
}

export async function listWaitlist(ctx: AuthContext) {
  await authorizeAny(ctx, "waitlist", "read");
  const entries = await WaitlistEntry.find(await withScope(ctx, "waitlist", { status: { $in: ["WAITING", "OFFERED"] } })).sort({ priority: -1, createdAt: 1 }).setOptions({ authz: authzToken(ctx) }).lean();
  const [patients, staff] = await Promise.all([
    Patient.find({ _id: { $in: entries.map((e) => e.patientId) } }, { firstName: 1, lastName: 1 }).setOptions({ authz: LOOKUP }).lean(),
    StaffProfile.find({ _id: { $in: entries.map((e) => e.providerId).filter(Boolean) } }, { displayName: 1 }).lean(),
  ]);
  const patientName = new Map(patients.map((p) => [String(p._id), `${p.firstName} ${p.lastName}`]));
  const providerName = new Map(staff.map((s) => [String(s._id), s.displayName]));
  return entries.map((e) => ({
    id: String(e._id),
    patient: patientName.get(String(e.patientId)) ?? "Client",
    patientId: String(e.patientId),
    provider: e.providerId ? providerName.get(String(e.providerId)) : "Any provider",
    modes: e.modes,
    preferredDays: e.preferredDays,
    status: e.status,
    since: (e as unknown as { createdAt: Date }).createdAt,
  }));
}

/** One-click booking of a waitlisted client into a freed slot (Use Case 5). */
export async function bookFromWaitlist(ctx: AuthContext, entryId: string, slot: { providerId: string; visitType: string; mode: Mode; start: string }) {
  await authorize(ctx, "waitlist", "update");
  if (!Types.ObjectId.isValid(entryId)) throw new SchedulingError("Waitlist entry not found.");
  const entry = await WaitlistEntry.findById(entryId).setOptions({ authz: authzToken(ctx) });
  if (!entry || entry.status !== "WAITING") throw new SchedulingError("This waitlist entry is no longer waiting.");
  const appointmentId = await bookAppointment(ctx, { patientId: String(entry.patientId), ...slot });
  entry.status = "BOOKED";
  entry.bookedAppointmentId = new Types.ObjectId(appointmentId);
  await authorizeDoc(entry, authzToken(ctx)).save();
  await recordAudit(ctx, { action: "UPDATE", resourceType: "WaitlistEntry", resourceId: entryId, patientId: String(entry.patientId), changedFields: ["status", "bookedAppointmentId"] });
  return appointmentId;
}

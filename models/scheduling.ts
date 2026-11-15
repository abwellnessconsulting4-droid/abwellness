import { Schema } from "mongoose";
import { phiGuard } from "@/lib/db/phi-guard";
import { baseOptions, defineModel, encrypted, ref } from "@/lib/db/schema";

const HHMM = { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, required: true };
const MODES = ["IN_PERSON", "VIRTUAL", "HYBRID"] as const;

export const ProviderScheduleSchema = new Schema(
  {
    providerId: ref("StaffProfile"),
    timezone: { type: String, required: true, default: "America/New_York" },
    weeklyAvailability: [
      {
        _id: false,
        dayOfWeek: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
        startTime: HHMM,
        endTime: HHMM,
        mode: { type: String, enum: MODES, required: true },
      },
    ],
    bufferMinutes: { type: Number, min: 0, max: 60, default: 10 },
    visitTypes: [
      {
        _id: false,
        key: { type: String, required: true }, // "initial-consult"
        name: { type: String, required: true },
        durationMinutes: { type: Number, min: 5, max: 240, required: true },
        modes: [{ type: String, enum: ["IN_PERSON", "VIRTUAL"] }],
        patientBookable: { type: Boolean, default: false },
      },
    ],
    exceptions: [{ _id: false, startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true }, reason: String }],
  },
  baseOptions,
);
ProviderScheduleSchema.index({ providerId: 1 }, { unique: true });
export const ProviderSchedule = defineModel("ProviderSchedule", ProviderScheduleSchema);

export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_SESSION",
  "COMPLETED",
  "CANCELLED",
  "LATE_CANCELLED",
  "NO_SHOW",
] as const;

/** Statuses that hold the provider's time (double-booking guard applies). */
export const ACTIVE_APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_SESSION"] as const;

export const AppointmentSchema = new Schema(
  {
    patientId: ref("Patient"),
    providerId: ref("StaffProfile"),
    visitType: { type: String, required: true },
    mode: { type: String, enum: ["IN_PERSON", "VIRTUAL"], required: true },
    scheduledStart: { type: Date, required: true },
    scheduledEnd: { type: Date, required: true },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: "SCHEDULED" },
    location: String,
    reasonEnc: encrypted(), // reason for visit (PHI); never in reminders
    seriesId: { type: Schema.Types.ObjectId }, // recurring series
    recurrenceRule: String, // RFC 5545 RRULE, e.g. "FREQ=WEEKLY;INTERVAL=2;COUNT=6"
    cancellation: {
      _id: false,
      at: Date,
      by: ref("User", false),
      byRole: String,
      reason: String,
      hoursNotice: Number,
      feeInvoiceId: ref("Invoice", false),
      feeWaived: Boolean,
    },
    reminders: [
      {
        _id: false,
        kind: { type: String, enum: ["H48", "H24", "H1"], required: true },
        channel: { type: String, enum: ["EMAIL", "SMS"], required: true },
        sentAt: { type: Date, required: true },
      },
    ],
    telehealthSessionId: ref("TelehealthSession", false),
    bookedBy: ref("User"),
    bookedByRole: { type: String, required: true },
  },
  baseOptions,
);
AppointmentSchema.pre("validate", function () {
  if (this.scheduledEnd <= this.scheduledStart) this.invalidate("scheduledEnd", "Appointment must end after it starts.");
});
AppointmentSchema.index({ providerId: 1, scheduledStart: 1 });
AppointmentSchema.index({ patientId: 1, scheduledStart: -1 });
AppointmentSchema.index({ status: 1, scheduledStart: 1 }); // reminder jobs, day sheets
AppointmentSchema.index({ seriesId: 1 });
AppointmentSchema.plugin(phiGuard);
export const Appointment = defineModel("Appointment", AppointmentSchema);

/**
 * Double-booking guard (MongoDB has no exclusion constraints): one document per
 * 15-minute slot, written in the same transaction as the appointment. The
 * unique index makes a conflicting booking fail atomically.
 */
export const SLOT_MINUTES = 15;
export const AppointmentSlotSchema = new Schema({
  providerId: ref("StaffProfile"),
  slotStart: { type: Date, required: true },
  appointmentId: ref("Appointment"),
});
AppointmentSlotSchema.index({ providerId: 1, slotStart: 1 }, { unique: true });
AppointmentSlotSchema.index({ appointmentId: 1 });
export const AppointmentSlot = defineModel("AppointmentSlot", AppointmentSlotSchema);

/** The slot start times an appointment occupies (end is exclusive). */
export function slotStartsFor(start: Date, end: Date): Date[] {
  const step = SLOT_MINUTES * 60_000;
  const first = Math.floor(start.getTime() / step) * step;
  const slots: Date[] = [];
  for (let t = first; t < end.getTime(); t += step) slots.push(new Date(t));
  return slots;
}

export const WaitlistEntrySchema = new Schema(
  {
    patientId: ref("Patient"),
    providerId: ref("StaffProfile", false), // any provider when empty
    visitType: String,
    modes: [{ type: String, enum: ["IN_PERSON", "VIRTUAL"] }],
    preferredDays: [{ type: Number, min: 0, max: 6 }],
    earliestDate: Date,
    latestDate: Date,
    priority: { type: Number, default: 0 },
    status: { type: String, enum: ["WAITING", "OFFERED", "BOOKED", "EXPIRED", "REMOVED"], default: "WAITING" },
    offer: {
      _id: false,
      slotStart: Date,
      slotEnd: Date,
      providerId: ref("StaffProfile", false),
      offeredAt: Date,
      expiresAt: Date,
    },
    bookedAppointmentId: ref("Appointment", false),
    addedBy: ref("User"),
  },
  baseOptions,
);
WaitlistEntrySchema.index({ status: 1, providerId: 1, priority: -1, createdAt: 1 });
WaitlistEntrySchema.index({ patientId: 1, status: 1 });
WaitlistEntrySchema.plugin(phiGuard);
export const WaitlistEntry = defineModel("WaitlistEntry", WaitlistEntrySchema);

/** Post-visit satisfaction survey (portal), one per completed appointment. */
export const VisitSurveySchema = new Schema(
  {
    patientId: ref("Patient"),
    appointmentId: ref("Appointment"),
    providerId: ref("StaffProfile"),
    rating: { type: Number, min: 1, max: 5, required: true },
    commentEnc: encrypted(), // free text may contain health details
    submittedAt: { type: Date, default: Date.now },
  },
  baseOptions,
);
VisitSurveySchema.index({ appointmentId: 1 }, { unique: true });
VisitSurveySchema.index({ providerId: 1, submittedAt: -1 });
VisitSurveySchema.plugin(phiGuard);
export const VisitSurvey = defineModel("VisitSurvey", VisitSurveySchema);

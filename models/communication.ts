import { Schema } from "mongoose";
import { phiGuard } from "@/lib/db/phi-guard";
import { baseOptions, defineModel, encrypted, ref } from "@/lib/db/schema";

// ── Secure messaging ───────────────────────────────────────────────────────

export const MessageThreadSchema = new Schema(
  {
    patientId: ref("Patient"),
    category: { type: String, enum: ["CLINICAL", "GENERAL", "BILLING", "SCHEDULING"], default: "GENERAL" },
    subject: { type: String, required: true, maxlength: 140 }, // no clinical detail
    participants: [
      {
        _id: false,
        userId: ref("User"),
        role: { type: String, required: true },
        lastReadAt: Date,
      },
    ],
    lastMessageAt: Date,
    closedAt: Date,
    createdBy: ref("User"),
  },
  baseOptions,
);
MessageThreadSchema.index({ patientId: 1, lastMessageAt: -1 });
MessageThreadSchema.index({ "participants.userId": 1, lastMessageAt: -1 });
MessageThreadSchema.plugin(phiGuard);
export const MessageThread = defineModel("MessageThread", MessageThreadSchema);

export const SecureMessageSchema = new Schema(
  {
    threadId: ref("MessageThread"),
    patientId: ref("Patient"), // denormalised for access checks
    senderId: ref("User"),
    senderRole: { type: String, required: true },
    bodyEnc: encrypted(true),
    attachmentDocumentIds: [ref("ClinicalDocument")],
    redactedAt: Date, // messages are never edited; admins may redact (audited)
    redactedBy: ref("User", false),
  },
  { timestamps: { createdAt: true, updatedAt: false }, strict: "throw" },
);
SecureMessageSchema.index({ threadId: 1, createdAt: 1 });
SecureMessageSchema.plugin(phiGuard);
export const SecureMessage = defineModel("SecureMessage", SecureMessageSchema);

// ── Telehealth ─────────────────────────────────────────────────────────────

export const TELEHEALTH_STATUSES = ["NOT_ARRIVED", "IN_WAITING_ROOM", "IN_SESSION", "COMPLETED", "CANCELLED"] as const;

export const TelehealthSessionSchema = new Schema(
  {
    appointmentId: ref("Appointment"),
    patientId: ref("Patient"),
    providerId: ref("StaffProfile"),
    videoProvider: { type: String, enum: ["DAILY", "MOCK"], required: true },
    roomName: { type: String, required: true },
    // Only a hash of the patient's join token is stored; the token itself is sent once.
    patientTokenHash: { type: String, required: true, select: false },
    tokenExpiresAt: { type: Date, required: true },
    status: { type: String, enum: TELEHEALTH_STATUSES, default: "NOT_ARRIVED" },
    events: [
      {
        _id: false,
        type: { type: String, enum: ["PATIENT_JOINED_WAITING_ROOM", "ADMITTED", "PROVIDER_JOINED", "PARTICIPANT_LEFT", "ENDED"], required: true },
        at: { type: Date, default: Date.now },
        by: ref("User", false),
      },
    ],
    waitingSince: Date,
    admittedAt: Date,
    startedAt: Date,
    endedAt: Date,
    durationSeconds: Number, // feeds time-based CPT validation
  },
  baseOptions,
);
TelehealthSessionSchema.pre("validate", function () {
  if (this.startedAt && this.endedAt) {
    this.durationSeconds = Math.round((this.endedAt.getTime() - this.startedAt.getTime()) / 1000);
  }
});
TelehealthSessionSchema.index({ appointmentId: 1 }, { unique: true });
TelehealthSessionSchema.index({ providerId: 1, status: 1 }); // provider's waiting room
TelehealthSessionSchema.index({ patientTokenHash: 1 }, { unique: true });
TelehealthSessionSchema.plugin(phiGuard);
export const TelehealthSession = defineModel("TelehealthSession", TelehealthSessionSchema);

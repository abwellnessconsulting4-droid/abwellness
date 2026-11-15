import { Schema } from "mongoose";
import { phiGuard, type AuthzToken } from "@/lib/db/phi-guard";
import { defineModel } from "@/lib/db/schema";

// ── Audit log (append-only, hash-chained; written only through lib/audit.ts) ──

export const AUDIT_ACTIONS = [
  "VIEW",
  "CREATE",
  "UPDATE",
  "DELETE",
  "EXPORT",
  "SIGN",
  "DOWNLOAD",
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "MFA_CHALLENGE",
  "SESSION_TIMEOUT",
  "ACCESS_GRANTED",
  "UNAUTHORIZED_ACCESS_ATTEMPT",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AuditLogSchema = new Schema(
  {
    seq: { type: Number, required: true }, // chain order (unique)
    timestamp: { type: Date, required: true },
    actorId: String, // no ref: the log outlives every record it mentions
    actorRole: { type: String, required: true }, // role, or SYSTEM
    patientId: String,
    resourceType: { type: String, required: true },
    resourceId: String,
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    outcome: { type: String, enum: ["SUCCESS", "DENIED", "ERROR"], required: true },
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    requestId: String,
    reason: String, // required for break-glass access and exports
    changedFields: [String], // field names only, never values
    metadata: { type: Schema.Types.Mixed, default: {} }, // non-PHI context
    prevHash: String,
    hash: { type: String, required: true },
  },
  { versionKey: false, strict: "throw", minimize: false },
);
AuditLogSchema.index({ seq: 1 }, { unique: true });
AuditLogSchema.index({ patientId: 1, timestamp: -1 });
AuditLogSchema.index({ actorId: 1, timestamp: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ outcome: 1, timestamp: -1 });
AuditLogSchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"],
  { document: false, query: true },
  function () {
    throw new Error("The audit log is append-only.");
  },
);
AuditLogSchema.pre("save", function () {
  if (!this.isNew) throw new Error("The audit log is append-only.");
});
AuditLogSchema.plugin(phiGuard);
export const AuditLog = defineModel("AuditLog", AuditLogSchema);

// ── Counters for human-readable numbers (MRN, claim, invoice, receipt) ─────

export const CounterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { versionKey: false });
export const Counter = defineModel("Counter", CounterSchema);

/** Atomically allocate the next number in a sequence, e.g. nextSequence("mrn:2026"). */
export async function nextSequence(name: string): Promise<number> {
  const counter = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  return counter!.seq;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

export async function nextMrn(year = new Date().getFullYear()) {
  return `ABW-${year}-${pad(await nextSequence(`mrn:${year}`), 4)}`;
}
export async function nextClaimNumber(year = new Date().getFullYear()) {
  return `CLM-${year}-${pad(await nextSequence(`claim:${year}`), 5)}`;
}
export async function nextInvoiceNumber(year = new Date().getFullYear()) {
  return `INV-${year}-${pad(await nextSequence(`invoice:${year}`), 4)}`;
}
export async function nextReceiptNumber(year = new Date().getFullYear()) {
  return `RCT-${year}-${pad(await nextSequence(`receipt:${year}`), 5)}`;
}

export type { AuthzToken };

import "server-only";

import mongoose from "mongoose";
import { systemToken } from "@/lib/db/phi-guard";
import { AUDIT_ACTIONS, AuditLog, Patient } from "@/models";

/**
 * Shared by the audit trail page and its CSV export, so both apply the same
 * filters. Callers must have authorized auditLog read/export first.
 */

const LOOKUP = systemToken("audit-viewer-lookup");

export interface AuditFilters {
  mrn?: string;
  action?: string;
  outcome?: string;
  actor?: string; // email
  from?: string; // yyyy-mm-dd
  to?: string;
}

export function parseAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const get = (key: string) => {
    const value = params[key];
    const s = (Array.isArray(value) ? value[0] : value)?.trim();
    return s ? s.slice(0, 120) : undefined;
  };
  const action = get("action");
  const outcome = get("outcome");
  return {
    mrn: get("mrn")?.toUpperCase(),
    action: action && (AUDIT_ACTIONS as readonly string[]).includes(action) ? action : undefined,
    outcome: outcome && ["SUCCESS", "DENIED", "ERROR"].includes(outcome) ? outcome : undefined,
    actor: get("actor")?.toLowerCase(),
    from: get("from")?.match(/^\d{4}-\d{2}-\d{2}$/) ? get("from") : undefined,
    to: get("to")?.match(/^\d{4}-\d{2}-\d{2}$/) ? get("to") : undefined,
  };
}

/** Mongo filter for the audit log, or null when a lookup (MRN / actor) matches nothing. */
export async function buildAuditFilter(filters: AuditFilters): Promise<Record<string, unknown> | null> {
  const filter: Record<string, unknown> = {};
  if (filters.action) filter.action = filters.action;
  if (filters.outcome) filter.outcome = filters.outcome;
  if (filters.from || filters.to) {
    filter.timestamp = {
      ...(filters.from ? { $gte: new Date(`${filters.from}T00:00:00Z`) } : {}),
      ...(filters.to ? { $lt: new Date(new Date(`${filters.to}T00:00:00Z`).getTime() + 86_400_000) } : {}),
    };
  }
  if (filters.mrn) {
    const patient = await Patient.findOne({ mrn: filters.mrn }, { _id: 1 }).setOptions({ authz: LOOKUP }).lean();
    if (!patient) return null;
    filter.patientId = String(patient._id);
  }
  if (filters.actor) {
    const user = await mongoose.connection.db!.collection("user").findOne({ email: filters.actor }, { projection: { _id: 1 } });
    if (!user) return null;
    filter.actorId = String(user._id);
  }
  return filter;
}

export interface AuditRow {
  seq: number;
  timestamp: Date;
  action: string;
  outcome: string;
  actor: string;
  actorRole: string;
  resource: string;
  patientMrn: string;
  ipAddress: string;
  details: string;
}

export async function findAuditRows(filter: Record<string, unknown>, limit: number): Promise<AuditRow[]> {
  const entries = await AuditLog.find(filter).sort({ seq: -1 }).limit(limit).setOptions({ authz: LOOKUP }).lean();

  const userIds = [...new Set(entries.map((e) => e.actorId).filter(Boolean))] as string[];
  const patientIds = [...new Set(entries.map((e) => e.patientId).filter(Boolean))] as string[];
  const [users, patients] = await Promise.all([
    mongoose.connection
      .db!.collection("user")
      .find({ _id: { $in: userIds.filter(mongoose.isValidObjectId).map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { name: 1, email: 1 } })
      .toArray(),
    Patient.find({ _id: { $in: patientIds.filter(mongoose.isValidObjectId) } }, { mrn: 1 }).setOptions({ authz: LOOKUP }).lean(),
  ]);
  const userName = new Map(users.map((u) => [String(u._id), `${u.name} (${u.email})`]));
  const mrn = new Map(patients.map((p) => [String(p._id), p.mrn]));

  return entries.map((e) => {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    const details = [
      e.reason ? `reason: ${e.reason}` : "",
      e.changedFields?.length ? `fields: ${e.changedFields.join(", ")}` : "",
      ...Object.entries(meta)
        .filter(([key]) => key !== "counts")
        .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`),
    ]
      .filter(Boolean)
      .join("; ");
    return {
      seq: e.seq,
      timestamp: e.timestamp,
      action: e.action,
      outcome: e.outcome,
      actor: e.actorId ? (userName.get(e.actorId) ?? e.actorId) : e.actorRole,
      actorRole: e.actorRole,
      resource: [e.resourceType, e.resourceId].filter(Boolean).join(" "),
      patientMrn: e.patientId ? (mrn.get(e.patientId) ?? e.patientId) : "",
      ipAddress: e.ipAddress ?? "",
      details,
    };
  });
}

/** CSV with formula-injection protection (cells starting with = + - @ are prefixed). */
export function toCsv(rows: AuditRow[]) {
  const header = ["Sequence", "Timestamp (UTC)", "Action", "Outcome", "Actor", "Role", "Resource", "Client MRN", "IP address", "Details"];
  const cell = (value: unknown) => {
    let s = value instanceof Date ? value.toISOString() : String(value ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [r.seq, r.timestamp, r.action, r.outcome, r.actor, r.actorRole, r.resource, r.patientMrn, r.ipAddress, r.details].map(cell).join(","));
  return [header.join(","), ...lines].join("\r\n");
}

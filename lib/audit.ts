import { createHash } from "node:crypto";
import { createScoped, systemToken } from "@/lib/db/phi-guard";
import { AuditLog, type AuditAction } from "@/models/system";

/**
 * HIPAA audit trail. Every read or write of PHI goes through here.
 *
 * Entries are append-only and hash-chained: hash = sha256(prevHash | canonical
 * entry). Concurrent writers are serialised by the unique `seq` index: on a
 * collision the writer re-reads the chain head and retries. verifyAuditChain()
 * recomputes the chain to detect edits or deletions.
 *
 * changedFields holds field NAMES only. Values never enter the audit log.
 */

const AUDIT_TOKEN = systemToken("audit-log");
const MAX_ATTEMPTS = 12;

export interface AuditActor {
  actorId?: string;
  actorRole: string; // a Role, or "SYSTEM" / "ANONYMOUS"
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
}

export interface AuditEvent {
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  patientId?: string;
  outcome?: "SUCCESS" | "DENIED" | "ERROR";
  reason?: string;
  changedFields?: string[];
  metadata?: Record<string, unknown>;
}

type ChainFields = AuditActor & Required<Pick<AuditEvent, "action" | "resourceType" | "outcome">> & Omit<AuditEvent, "action" | "resourceType" | "outcome"> & { seq: number; timestamp: Date };

/** Stable JSON: object keys sorted recursively, so hashing is deterministic. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export function hashEntry(prevHash: string | null | undefined, entry: ChainFields): string {
  const body = canonical({
    seq: entry.seq,
    timestamp: entry.timestamp,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    patientId: entry.patientId,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    action: entry.action,
    outcome: entry.outcome,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    sessionId: entry.sessionId,
    requestId: entry.requestId,
    reason: entry.reason,
    changedFields: entry.changedFields ?? [],
    metadata: entry.metadata ?? {},
  });
  return createHash("sha256").update(`${prevHash ?? ""}|${body}`).digest("hex");
}

function isDuplicateKey(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

/** Append one audit entry. Throws if it cannot be written: callers must not proceed silently. */
export async function recordAudit(source: AuditActor, event: AuditEvent) {
  // Accept a full AuthContext but record only the actor fields.
  const actor: AuditActor = {
    actorId: source.actorId,
    actorRole: source.actorRole,
    ipAddress: source.ipAddress,
    userAgent: source.userAgent,
    sessionId: source.sessionId,
    requestId: source.requestId,
  };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const head = await AuditLog.findOne({}, { seq: 1, hash: 1 })
      .sort({ seq: -1 })
      .setOptions({ authz: AUDIT_TOKEN })
      .lean();

    const entry: ChainFields = {
      ...actor,
      ...event,
      outcome: event.outcome ?? "SUCCESS",
      changedFields: event.changedFields ?? [],
      metadata: event.metadata ?? {},
      seq: (head?.seq ?? 0) + 1,
      timestamp: new Date(),
    };
    const prevHash = head?.hash ?? null;

    try {
      return await createScoped(AuditLog, AUDIT_TOKEN, { ...entry, prevHash, hash: hashEntry(prevHash, entry) });
    } catch (error) {
      if (!isDuplicateKey(error) || attempt === MAX_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 15 * attempt));
    }
  }
  throw new Error("Unreachable");
}

/**
 * Run an operation and audit its outcome. Errors are logged as ERROR and rethrown.
 *
 *   const note = await withAudit(actor, { action: "VIEW", resourceType: "ClinicalNote", resourceId, patientId }, () => load());
 */
export async function withAudit<T>(actor: AuditActor, event: AuditEvent, operation: () => Promise<T>): Promise<T> {
  try {
    const result = await operation();
    await recordAudit(actor, { ...event, outcome: event.outcome ?? "SUCCESS" });
    return result;
  } catch (error) {
    if (!(error instanceof AuditedDenial)) {
      await recordAudit(actor, { ...event, outcome: "ERROR", metadata: { ...event.metadata, error: (error as Error).name } });
    }
    throw error;
  }
}

/** Thrown after a denial has already been audited, so withAudit doesn't log it twice. */
export class AuditedDenial extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuditedDenial";
  }
}

/** Names of top-level fields that differ between two snapshots (values are not returned). */
export function changedFields(before: Record<string, unknown> | null | undefined, after: Record<string, unknown>): string[] {
  const ignore = new Set(["updatedAt", "createdAt", "__v"]);
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  return [...keys]
    .filter((key) => !ignore.has(key))
    .filter((key) => canonical(before?.[key]) !== canonical(after[key]))
    .sort();
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  brokenAtSeq?: number;
  problem?: "hash_mismatch" | "broken_link" | "gap";
}

/** Recompute the hash chain (nightly job, and on demand from the audit dashboard). */
export async function verifyAuditChain(): Promise<ChainVerification> {
  const cursor = AuditLog.find({}).sort({ seq: 1 }).setOptions({ authz: AUDIT_TOKEN }).lean().cursor();
  let previous: { seq: number; hash: string } | null = null;
  let checked = 0;

  for await (const doc of cursor) {
    if (previous && doc.seq !== previous.seq + 1) return { ok: false, checked, brokenAtSeq: doc.seq, problem: "gap" };
    if ((doc.prevHash ?? null) !== (previous?.hash ?? null)) return { ok: false, checked, brokenAtSeq: doc.seq, problem: "broken_link" };

    const expected = hashEntry(doc.prevHash, {
      seq: doc.seq,
      timestamp: doc.timestamp,
      actorId: doc.actorId ?? undefined,
      actorRole: doc.actorRole,
      patientId: doc.patientId ?? undefined,
      resourceType: doc.resourceType,
      resourceId: doc.resourceId ?? undefined,
      action: doc.action as AuditAction,
      outcome: doc.outcome as "SUCCESS" | "DENIED" | "ERROR",
      ipAddress: doc.ipAddress ?? undefined,
      userAgent: doc.userAgent ?? undefined,
      sessionId: doc.sessionId ?? undefined,
      requestId: doc.requestId ?? undefined,
      reason: doc.reason ?? undefined,
      changedFields: doc.changedFields ?? [],
      metadata: (doc.metadata as Record<string, unknown>) ?? {},
    });
    if (expected !== doc.hash) return { ok: false, checked, brokenAtSeq: doc.seq, problem: "hash_mismatch" };

    previous = { seq: doc.seq, hash: doc.hash };
    checked++;
  }
  return { ok: true, checked };
}

import { Types } from "mongoose";
import { AuditedDenial, recordAudit, type AuditActor } from "@/lib/audit";
import { systemToken, type AuthzToken } from "@/lib/db/phi-guard";
import { DOCUMENT_CATEGORY_ACCESS, scopeFor, type Action, type Resource, type Role, type Scope } from "@/lib/rbac";
import { Patient } from "@/models/people";

/**
 * Authorization decisions: turns the RBAC matrix (lib/rbac.ts) into
 * per-record checks and MongoDB filters. Independent of Next.js so it can be
 * unit-tested; lib/dal.ts builds the AuthContext from the session.
 */

export interface AuthContext extends AuditActor {
  userId: string;
  actorId: string;
  role: Role;
  actorRole: Role;
  /** The PATIENT's own Patient._id. */
  patientId?: string;
  /** The PROVIDER's StaffProfile._id (also set for other staff with a profile). */
  staffProfileId?: string;
  mfaVerified: boolean;
  /** For display only (header); never written to the audit log. */
  displayName?: string;
  email?: string;
  /** Per-request memo (assigned patient ids). */
  cache?: { assignedPatientIds?: Types.ObjectId[] };
}

/** What we know about the record being accessed. */
export interface AccessTarget {
  resourceId?: string;
  patientId?: string | Types.ObjectId | null;
  /** Patient.assignedProviderId, when already loaded. */
  assignedProviderId?: string | Types.ObjectId | null;
  /** Author / owning provider (notes, schedules). */
  providerId?: string | Types.ObjectId | null;
  noteType?: string | null;
  noteStatus?: string | null;
  accessGrants?: { userId: string | Types.ObjectId; expiresAt: Date }[] | null;
  documentCategory?: string | null;
  messageCategory?: string | null;
}

export function authzToken(ctx: AuthContext): AuthzToken {
  return { actorId: ctx.userId, role: ctx.role };
}

const AUTHZ_LOOKUP = systemToken("authorization-lookup");
const same = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b);
const MODEL_FOR: Partial<Record<Resource, string>> = { psychotherapyNote: "ClinicalNote" };

async function assignedPatientIds(ctx: AuthContext): Promise<Types.ObjectId[]> {
  if (!ctx.staffProfileId) return [];
  if (ctx.cache?.assignedPatientIds) return ctx.cache.assignedPatientIds;
  const ids = await Patient.find({ assignedProviderId: ctx.staffProfileId }, { _id: 1 }).setOptions({ authz: AUTHZ_LOOKUP }).lean();
  const result = ids.map((p) => p._id as Types.ObjectId);
  ctx.cache = { ...ctx.cache, assignedPatientIds: result };
  return result;
}

async function isAssigned(ctx: AuthContext, target: AccessTarget): Promise<boolean> {
  if (!ctx.staffProfileId || !target.patientId) return false;
  if (target.assignedProviderId !== undefined) return same(target.assignedProviderId, ctx.staffProfileId);
  const patient = await Patient.findById(target.patientId, { assignedProviderId: 1 }).setOptions({ authz: AUTHZ_LOOKUP }).lean();
  return same(patient?.assignedProviderId, ctx.staffProfileId);
}

function hasActiveGrant(ctx: AuthContext, target: AccessTarget) {
  const now = Date.now();
  return (target.accessGrants ?? []).some((grant) => same(grant.userId, ctx.userId) && new Date(grant.expiresAt).getTime() > now);
}

/** Pure part of the decision: does the scope cover this target? (assignment checked separately) */
async function scopeAllows(ctx: AuthContext, scope: Scope, resource: Resource, target: AccessTarget) {
  switch (scope) {
    case "all":
      return true;
    case "own":
      if (resource === "schedule") return same(target.providerId, ctx.staffProfileId);
      return ctx.role === "PATIENT" && same(target.patientId, ctx.patientId);
    case "author":
      return same(target.providerId, ctx.staffProfileId);
    case "assigned":
      return isAssigned(ctx, target);
  }
}

/** Extra rules the matrix can't express. Returns a denial reason or null. */
function refinements(ctx: AuthContext, resource: Resource, target: AccessTarget): string | null {
  if (resource === "clinicalNote" && target.noteType === "PSYCHOTHERAPY") {
    return "psychotherapy notes require the psychotherapyNote permission";
  }
  if (ctx.role === "PATIENT" && resource === "clinicalNote" && target.noteStatus !== "SIGNED_LOCKED") {
    return "patients may only view signed notes";
  }
  const categories = DOCUMENT_CATEGORY_ACCESS[ctx.role];
  if (resource === "document" && categories && target.documentCategory && !categories.includes(target.documentCategory)) {
    return `document category ${target.documentCategory} not permitted for ${ctx.role}`;
  }
  if (resource === "message" && ctx.role === "FRONT_DESK" && target.messageCategory === "CLINICAL") {
    return "front desk cannot access clinical threads";
  }
  if (resource === "message" && ctx.role === "BILLING_STAFF" && target.messageCategory && target.messageCategory !== "BILLING") {
    return `message category ${target.messageCategory} not permitted for ${ctx.role}`;
  }
  return null;
}

/** Decide without side effects. */
export async function isAllowed(ctx: AuthContext, resource: Resource, action: Action, target: AccessTarget = {}) {
  if (resource === "psychotherapyNote" && action === "read" && hasActiveGrant(ctx, target)) return true;
  const scope = scopeFor(ctx.role, resource, action);
  if (!scope) return false;
  if (refinements(ctx, resource, target)) return false;
  return scopeAllows(ctx, scope, resource, target);
}

/**
 * Enforce access to one record. Denials are audited as
 * UNAUTHORIZED_ACCESS_ATTEMPT and thrown as AuditedDenial (HTTP 403).
 */
export async function authorize(ctx: AuthContext, resource: Resource, action: Action, target: AccessTarget = {}) {
  if (await isAllowed(ctx, resource, action, target)) return;
  await recordAudit(ctx, {
    action: "UNAUTHORIZED_ACCESS_ATTEMPT",
    outcome: "DENIED",
    resourceType: MODEL_FOR[resource] ?? resource,
    resourceId: target.resourceId,
    patientId: target.patientId ? String(target.patientId) : undefined,
    metadata: { attempted: action, reason: refinements(ctx, resource, target) ?? "no permission" },
  });
  throw new AuditedDenial();
}

/**
 * For list views: may this role read this kind of record at all? (The list is
 * then narrowed by withScope.) Denials are audited like authorize().
 */
export async function authorizeAny(ctx: AuthContext, resource: Resource, action: Action = "read") {
  if (scopeFor(ctx.role, resource, action) !== null) return;
  await recordAudit(ctx, {
    action: "UNAUTHORIZED_ACCESS_ATTEMPT",
    outcome: "DENIED",
    resourceType: MODEL_FOR[resource] ?? resource,
    metadata: { attempted: `${action} (list)`, reason: "no permission" },
  });
  throw new AuditedDenial();
}

/**
 * MongoDB filter limiting a list query to records the user may see.
 * Never spread it into another filter (a shared key like patientId would be
 * silently overwritten); use withScope(), which combines with $and.
 */
export async function scopeFilter(ctx: AuthContext, resource: Resource, action: Action = "read"): Promise<Record<string, unknown>> {
  const scope = scopeFor(ctx.role, resource, action);
  const patientKey = resource === "patient" ? "_id" : "patientId";
  const extra: Record<string, unknown> = {};

  if (resource === "clinicalNote") extra.noteType = { $ne: "PSYCHOTHERAPY" };
  if (resource === "clinicalNote" && ctx.role === "PATIENT") extra.status = "SIGNED_LOCKED";
  const categories = DOCUMENT_CATEGORY_ACCESS[ctx.role];
  if (resource === "document" && categories) extra.category = { $in: categories };
  if (resource === "message" && ctx.role === "FRONT_DESK") extra.category = { $ne: "CLINICAL" };
  if (resource === "message" && ctx.role === "BILLING_STAFF") extra.category = "BILLING";

  if (resource === "psychotherapyNote") {
    const grant = { accessGrants: { $elemMatch: { userId: new Types.ObjectId(ctx.userId), expiresAt: { $gt: new Date() } } } };
    const own = scope === "author" && ctx.staffProfileId ? [{ providerId: new Types.ObjectId(ctx.staffProfileId) }] : [];
    return { noteType: "PSYCHOTHERAPY", $or: [...own, grant] };
  }

  switch (scope) {
    case "all":
      return extra;
    case "own":
      if (resource === "schedule") return { ...extra, providerId: ctx.staffProfileId };
      if (ctx.role !== "PATIENT" || !ctx.patientId) break;
      return { ...extra, [patientKey]: new Types.ObjectId(ctx.patientId) };
    case "author":
      return { ...extra, providerId: ctx.staffProfileId };
    case "assigned":
      if (resource === "patient") return { ...extra, assignedProviderId: ctx.staffProfileId };
      return { ...extra, patientId: { $in: await assignedPatientIds(ctx) } };
  }
  // No permission: match nothing (and callers should have used authorize() first).
  return { _id: { $in: [] } };
}

/**
 * The caller's filter AND the user's access scope, combined with $and so neither
 * can override the other (e.g. "this client" plus "my assigned clients").
 */
export async function withScope(ctx: AuthContext, resource: Resource, filter: Record<string, unknown> = {}, action: Action = "read") {
  return { $and: [filter, await scopeFilter(ctx, resource, action)] };
}

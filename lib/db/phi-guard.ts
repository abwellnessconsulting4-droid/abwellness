import type { Schema } from "mongoose";

/**
 * Fail-closed guard for collections holding PHI (MongoDB has no row-level
 * security). Every query must carry an authorization token in its options:
 *
 *   Patient.find(scopeFilter(ctx, "patient")).setOptions({ authz: token(ctx) })
 *
 * and every new document must be created through createScoped(), which sets
 * doc.$locals.authz. A query or save without one throws, so a forgotten
 * access check becomes an error instead of a data leak.
 *
 * System jobs (seeding, cron, audit writes) use systemToken("reason").
 */

export interface AuthzToken {
  actorId?: string;
  role?: string;
  /** Set for non-user work; the reason is recorded for review. */
  system?: string;
}

export class UnscopedQueryError extends Error {
  constructor(model: string, op: string) {
    super(`Refusing ${op} on ${model} without an authorization token (see lib/db/phi-guard.ts).`);
    this.name = "UnscopedQueryError";
  }
}

export function systemToken(reason: string): AuthzToken {
  return Object.freeze({ system: reason });
}

const QUERY_OPS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "countDocuments",
  "estimatedDocumentCount",
  "distinct",
  "updateOne",
  "updateMany",
  "replaceOne",
  "deleteOne",
  "deleteMany",
] as const;

export function phiGuard(schema: Schema) {
  schema.pre([...QUERY_OPS], { document: false, query: true }, function () {
    const options = this.getOptions() as { authz?: AuthzToken };
    if (!options.authz) throw new UnscopedQueryError(this.model.modelName, (this as unknown as { op?: string }).op ?? "query");
  });

  schema.pre("aggregate", function () {
    const options = this.options as { authz?: AuthzToken };
    if (!options.authz) throw new UnscopedQueryError(this.model().modelName, "aggregate");
  });

  schema.pre("validate", function () {
    if (!this.$locals.authz) throw new UnscopedQueryError((this.constructor as unknown as { modelName: string }).modelName, "save");
  });

  schema.pre("insertMany", function () {
    // insertMany skips document middleware; only allow it for system jobs via createManyScoped().
    throw new UnscopedQueryError(this.modelName, "insertMany (use createManyScoped)");
  });
}

type CreatableModel = {
  new (doc: Record<string, unknown>): { $locals: Record<string, unknown>; save(): Promise<unknown> };
};

/** Create and save a document under an authorization token. */
export async function createScoped<M extends CreatableModel>(Model: M, authz: AuthzToken, data: Record<string, unknown>) {
  const doc = new Model(data);
  doc.$locals.authz = authz;
  await doc.save();
  return doc as InstanceType<M>;
}

/** Bulk create (seeding, imports) one document at a time so validation and hooks run. */
export async function createManyScoped<M extends CreatableModel>(Model: M, authz: AuthzToken, rows: Record<string, unknown>[]) {
  const docs = [];
  for (const row of rows) docs.push(await createScoped(Model, authz, row));
  return docs;
}

/** Mark a loaded document so it can be saved again (updates via doc.save()). */
export function authorizeDoc<D extends { $locals: Record<string, unknown> }>(doc: D, authz: AuthzToken): D {
  doc.$locals.authz = authz;
  return doc;
}

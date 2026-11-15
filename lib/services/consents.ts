import "server-only";

import { recordAudit } from "@/lib/audit";
import { authorizeAny, authzToken, type AuthContext } from "@/lib/authz";
import { createScoped } from "@/lib/db/phi-guard";
import { buildSignature, sha256 } from "@/lib/signatures";
import { ConsentTemplate, MANDATORY_CONSENTS, SignedConsent, type ConsentType } from "@/models";

/**
 * Client consent signing. A client signs the exact published version they
 * were shown (its content hash travels with the form). Expiring consents
 * (renewalDays) and newer published versions both ask the client to sign again.
 */

export class ConsentError extends Error {}

/** Consents clients sign from the portal (a release of information is arranged with staff). */
export const PORTAL_CONSENTS: readonly ConsentType[] = MANDATORY_CONSENTS;

export type ConsentState = "SIGNED" | "NEEDS_SIGNATURE" | "EXPIRED" | "UPDATED";

function requirePatient(ctx: AuthContext) {
  if (ctx.role !== "PATIENT" || !ctx.patientId) throw new ConsentError("Your account isn't linked to a client record yet.");
  return ctx.patientId;
}

export async function myConsents(ctx: AuthContext, now = new Date()) {
  const patientId = requirePatient(ctx);
  await authorizeAny(ctx, "signedConsent", "read");
  const [templates, signed] = await Promise.all([
    ConsentTemplate.find({ status: "PUBLISHED", type: { $in: PORTAL_CONSENTS }, language: "en" }, { type: 1, title: 1, version: 1, renewalDays: 1 }).lean(),
    SignedConsent.find({ patientId, consentType: { $in: PORTAL_CONSENTS }, revokedAt: null }, { consentType: 1, version: 1, expiresAt: 1, "signature.signedAt": 1 })
      .sort({ "signature.signedAt": -1 })
      .setOptions({ authz: authzToken(ctx) })
      .lean(),
  ]);
  await recordAudit(ctx, { action: "VIEW", resourceType: "PortalConsents", patientId });
  return PORTAL_CONSENTS.map((type) => {
    const template = templates.find((t) => t.type === type);
    const latest = signed.find((s) => s.consentType === type);
    let state: ConsentState = "NEEDS_SIGNATURE";
    if (latest) {
      if (latest.expiresAt && latest.expiresAt <= now) state = "EXPIRED";
      else if (template && latest.version !== template.version) state = "UPDATED";
      else state = "SIGNED";
    }
    return {
      type,
      title: template?.title ?? type,
      version: template?.version,
      available: Boolean(template),
      state,
      signedAt: latest?.signature?.signedAt ?? undefined,
      signedVersion: latest?.version,
      expiresAt: latest?.expiresAt ?? undefined,
    };
  });
}

export async function consentForSigning(ctx: AuthContext, type: string) {
  requirePatient(ctx);
  if (!(PORTAL_CONSENTS as readonly string[]).includes(type)) throw new ConsentError("That form isn't available here.");
  const template = await ConsentTemplate.findOne({ status: "PUBLISHED", type: type as ConsentType, language: "en" }).lean();
  if (!template) throw new ConsentError("That form isn't available yet.");
  return { type: template.type as ConsentType, title: template.title, version: template.version, body: template.bodyMarkdown, contentHash: template.contentHash, renewalDays: template.renewalDays ?? null, terms: template.terms ?? null };
}

export async function signConsent(
  ctx: AuthContext,
  input: { type: string; contentHash: string; signatureName: string; ipAddress: string; userAgent?: string },
  now = new Date(),
) {
  const patientId = requirePatient(ctx);
  await authorizeAny(ctx, "signedConsent", "sign");
  const template = await ConsentTemplate.findOne({ status: "PUBLISHED", type: input.type as ConsentType, language: "en" });
  if (!template || !(PORTAL_CONSENTS as readonly string[]).includes(template.type)) throw new ConsentError("That form isn't available.");
  // The client must be signing exactly what they were shown.
  if (input.contentHash !== template.contentHash || sha256(template.bodyMarkdown) !== template.contentHash) {
    throw new ConsentError("This form was updated while you were reading it. Please review the new version.");
  }
  const typed = input.signatureName.trim().replace(/\s+/g, " ");
  const expected = (ctx.displayName ?? "").trim().replace(/\s+/g, " ");
  if (typed.length < 3 || (expected && typed.toLowerCase() !== expected.toLowerCase())) throw new ConsentError(`Type your full name (${expected || "as it appears on your account"}) to sign.`);

  const signature = buildSignature({ content: template.bodyMarkdown, signerId: ctx.userId, signerName: typed, signerRole: "PATIENT", ipAddress: input.ipAddress, userAgent: input.userAgent, method: "TYPED", signedAt: now });
  const doc = await createScoped(SignedConsent, authzToken(ctx), {
    patientId,
    templateId: template._id,
    consentType: template.type,
    version: template.version,
    signature,
    signerRelationship: "SELF",
    expiresAt: template.renewalDays ? new Date(now.getTime() + template.renewalDays * 86_400_000) : undefined,
  });
  await recordAudit(ctx, { action: "SIGN", resourceType: "SignedConsent", resourceId: String(doc._id), patientId, metadata: { type: template.type, version: template.version, contentHash: signature.contentHash } });
  return String(doc._id);
}

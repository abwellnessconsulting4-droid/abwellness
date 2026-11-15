import { createHash } from "node:crypto";

/**
 * Electronic signature evidence for clinical notes, treatment plans, and consents.
 *
 *   contentHash   = sha256(exact content signed)
 *   signatureHash = sha256(contentHash | signerId | ipAddress | ISO timestamp)
 *
 * Re-hashing the stored content later and comparing proves the record wasn't
 * altered after signing (verifySignature).
 */

export const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export interface SignatureInput {
  content: string;
  signerId: string;
  signerName: string;
  signerRole: string;
  ipAddress: string;
  userAgent?: string;
  method: "DRAWN" | "TYPED" | "CLICK";
  signatureSvg?: string;
  signedAt?: Date;
}

export function signatureHashFor(contentHash: string, signerId: string, ipAddress: string, signedAt: Date) {
  return sha256(`${contentHash}|${signerId}|${ipAddress}|${signedAt.toISOString()}`);
}

/** Build the SignatureSchema record for a piece of content. */
export function buildSignature(input: SignatureInput) {
  const signedAt = input.signedAt ?? new Date();
  const contentHash = sha256(input.content);
  return {
    signerId: input.signerId,
    signerName: input.signerName,
    signerRole: input.signerRole,
    method: input.method,
    signatureSvg: input.signatureSvg,
    contentHash,
    signatureHash: signatureHashFor(contentHash, input.signerId, input.ipAddress, signedAt),
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    signedAt,
  };
}

/** True when the content and evidence still match the stored signature. */
export function verifySignature(
  content: string,
  signature: { signerId: unknown; ipAddress: string; signedAt: Date; contentHash: string; signatureHash: string },
) {
  const contentHash = sha256(content);
  return (
    contentHash === signature.contentHash &&
    signatureHashFor(contentHash, String(signature.signerId), signature.ipAddress, new Date(signature.signedAt)) === signature.signatureHash
  );
}

/** Canonical text of a SOAP note for hashing (decrypted sections, fixed order). */
export function noteSigningContent(note: {
  id: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  body?: string;
  diagnosisCodes?: string[];
  serviceLines?: { cptCode: string; modifiers?: string[]; units?: number }[];
}) {
  return JSON.stringify({
    id: note.id,
    subjective: note.subjective ?? "",
    objective: note.objective ?? "",
    assessment: note.assessment ?? "",
    plan: note.plan ?? "",
    body: note.body ?? "",
    diagnosisCodes: note.diagnosisCodes ?? [],
    serviceLines: (note.serviceLines ?? []).map((l) => ({ cptCode: l.cptCode, modifiers: l.modifiers ?? [], units: l.units ?? 1 })),
  });
}

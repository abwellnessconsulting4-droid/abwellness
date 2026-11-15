import "server-only";

import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { recordAudit } from "@/lib/audit";
import { authorize, authzToken, withScope, type AuthContext } from "@/lib/authz";
import { createScoped, systemToken } from "@/lib/db/phi-guard";
import { decrypt, decryptBytes, ENC, encrypt, encryptBytes } from "@/lib/crypto";
import { objectStorage, storageFor } from "@/lib/storage";
import { ClinicalDocument, Patient } from "@/models";

/**
 * Document uploads and downloads. Files are encrypted in the app (AES-256-GCM,
 * bound to the document id) before they reach storage; downloads are
 * authorized per category and audited.
 */

const LOOKUP = systemToken("documents");
export class DocumentError extends Error {}

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies

/** What clients may upload from the portal. */
export const PATIENT_UPLOAD_CATEGORIES = ["INSURANCE_CARD_FRONT", "INSURANCE_CARD_BACK", "GOVERNMENT_ID", "REFERRAL", "LAB_RESULT", "EXTERNAL_RECORD"] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  GOVERNMENT_ID: "Photo ID",
  INSURANCE_CARD_FRONT: "Insurance card (front)",
  INSURANCE_CARD_BACK: "Insurance card (back)",
  LAB_RESULT: "Lab result",
  REFERRAL: "Referral",
  EXTERNAL_RECORD: "Records from another provider",
  SIGNED_CONSENT: "Signed consent",
  CLINICAL_SUMMARY: "Visit summary",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
  OTHER: "Other",
};

const EXTENSION: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Identify the file from its first bytes (never trust the browser's type or the name). */
export function sniffType(bytes: Buffer): keyof typeof EXTENSION | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

async function patientTarget(patientId: string) {
  if (!Types.ObjectId.isValid(patientId)) throw new DocumentError("Client not found.");
  const patient = await Patient.findById(patientId, { assignedProviderId: 1 }).setOptions({ authz: LOOKUP }).lean();
  if (!patient) throw new DocumentError("Client not found.");
  return patient;
}

export async function uploadDocument(ctx: AuthContext, input: { patientId?: string; category: string; fileName: string; bytes: Buffer }) {
  const patientId = ctx.role === "PATIENT" ? ctx.patientId : input.patientId;
  if (!patientId) throw new DocumentError("Choose a client.");
  if (ctx.role === "PATIENT" && !(PATIENT_UPLOAD_CATEGORIES as readonly string[]).includes(input.category)) throw new DocumentError("Choose what kind of document this is.");
  if (!CATEGORY_LABELS[input.category]) throw new DocumentError("Choose what kind of document this is.");
  const patient = await patientTarget(patientId);
  await authorize(ctx, "document", "create", { patientId, assignedProviderId: patient.assignedProviderId ?? null, documentCategory: input.category });

  if (input.bytes.length === 0) throw new DocumentError("The file is empty.");
  if (input.bytes.length > MAX_UPLOAD_BYTES) throw new DocumentError("Files can be up to 4 MB. Try a smaller photo or a PDF scan.");
  const mimeType = sniffType(input.bytes);
  if (!mimeType) throw new DocumentError("Upload a PDF, JPEG, PNG, or WebP file.");

  const documentId = new Types.ObjectId();
  const key = `${patientId}/${documentId}`;
  const storage = objectStorage();
  await storage.put(key, encryptBytes(input.bytes, `document:${documentId}`));
  try {
    const name = input.fileName.replace(/[\\/]/g, "_").slice(0, 200) || `document.${EXTENSION[mimeType]}`;
    await createScoped(ClinicalDocument, authzToken(ctx), {
      _id: documentId,
      patientId,
      category: input.category,
      storage: { provider: storage.provider, key },
      fileNameEnc: encrypt(name, ENC.documentFileName),
      mimeType,
      byteSize: input.bytes.length,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      status: "AVAILABLE", // content type verified; malware scanning is a planned addition
      uploadedBy: ctx.userId,
      uploadedByRole: ctx.role,
    });
  } catch (error) {
    await storage.remove(key).catch(() => {});
    throw error;
  }
  await recordAudit(ctx, { action: "CREATE", resourceType: "ClinicalDocument", resourceId: String(documentId), patientId, metadata: { category: input.category, mimeType, byteSize: input.bytes.length } });
  return String(documentId);
}

/** A client's documents the viewer may see (category limits apply for billing and front desk). */
export async function listDocuments(ctx: AuthContext, patientId: string) {
  const docs = await ClinicalDocument.find(await withScope(ctx, "document", { patientId: new Types.ObjectId(patientId), status: "AVAILABLE" }), { category: 1, mimeType: 1, byteSize: 1, createdAt: 1, uploadedByRole: 1, fileNameEnc: 1 })
    .sort({ createdAt: -1 })
    .setOptions({ authz: authzToken(ctx) })
    .lean();
  return docs.map((d) => ({
    id: String(d._id),
    category: d.category,
    label: CATEGORY_LABELS[d.category] ?? d.category,
    fileName: d.fileNameEnc ? decrypt(d.fileNameEnc, ENC.documentFileName) : `document.${EXTENSION[d.mimeType] ?? "bin"}`,
    mimeType: d.mimeType,
    byteSize: d.byteSize ?? 0,
    uploadedAt: (d as { createdAt?: Date }).createdAt,
    uploadedByClient: d.uploadedByRole === "PATIENT",
  }));
}

/** Decrypted file for an authorized viewer; the download is audited. */
export async function downloadDocument(ctx: AuthContext, documentId: string) {
  if (!Types.ObjectId.isValid(documentId)) throw new DocumentError("Document not found.");
  const doc = await ClinicalDocument.findById(documentId).select("+fileNameEnc").setOptions({ authz: LOOKUP }).lean();
  if (!doc || doc.status !== "AVAILABLE") throw new DocumentError("Document not found.");
  const patient = await patientTarget(String(doc.patientId));
  await authorize(ctx, "document", "read", { resourceId: documentId, patientId: doc.patientId, assignedProviderId: patient.assignedProviderId ?? null, documentCategory: doc.category });

  const stored = doc.storage ? await storageFor(doc.storage.provider).get(doc.storage.key) : null;
  if (!stored) throw new DocumentError("This file isn't available. It may have been uploaded before storage was set up.");
  const bytes = decryptBytes(stored, `document:${documentId}`);
  await recordAudit(ctx, { action: "DOWNLOAD", resourceType: "ClinicalDocument", resourceId: documentId, patientId: String(doc.patientId), metadata: { category: doc.category } });
  const fileName = doc.fileNameEnc ? decrypt(doc.fileNameEnc, ENC.documentFileName) : `document.${EXTENSION[doc.mimeType] ?? "bin"}`;
  return { bytes, mimeType: doc.mimeType, fileName };
}

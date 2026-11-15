import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Application-level encryption for PHI fields (AES-256-GCM).
 *
 * Ciphertext format:  enc:v1:<keyId>:<iv b64url>:<tag b64url>:<ciphertext b64url>
 *
 * - Keys are versioned so they can be rotated: new writes use ENCRYPTION_KEY
 *   (id ENCRYPTION_KEY_ID), and retired keys stay readable via
 *   ENCRYPTION_PREVIOUS_KEYS ({"k0":"<base64>"}). Re-encrypt in the background.
 * - Every value is bound to a context (AAD) such as "Patient.ssn", so ciphertext
 *   copied into another field or collection fails authentication.
 * - blindIndex() gives a deterministic HMAC for exact-match lookups (e.g. SSN)
 *   without storing the value; it uses a separate key so rotating the
 *   encryption key doesn't invalidate lookups.
 *
 * Phase 1 reads keys from the environment. Moving the key material behind
 * AWS KMS (envelope encryption) only changes loadKeyring().
 */

const PREFIX = "enc";
const FORMAT_VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class EncryptionConfigError extends Error {}
export class DecryptionError extends Error {}

interface Keyring {
  currentId: string;
  keys: Map<string, Buffer>;
  blindIndexKey: Buffer;
}

let cachedKeyring: Keyring | null = null;

function decodeKey(value: string, name: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) {
    throw new EncryptionConfigError(`${name} must be ${KEY_BYTES} bytes, base64-encoded (got ${key.length}).`);
  }
  return key;
}

function loadKeyring(): Keyring {
  if (cachedKeyring) return cachedKeyring;

  const current = process.env.ENCRYPTION_KEY;
  if (!current) {
    throw new EncryptionConfigError("Missing ENCRYPTION_KEY. Generate one with: openssl rand -base64 32");
  }
  const currentId = process.env.ENCRYPTION_KEY_ID || "k1";
  if (!/^[a-z0-9]+$/i.test(currentId)) {
    throw new EncryptionConfigError("ENCRYPTION_KEY_ID must be alphanumeric.");
  }

  const keys = new Map<string, Buffer>([[currentId, decodeKey(current, "ENCRYPTION_KEY")]]);
  if (process.env.ENCRYPTION_PREVIOUS_KEYS) {
    const previous = JSON.parse(process.env.ENCRYPTION_PREVIOUS_KEYS) as Record<string, string>;
    for (const [id, value] of Object.entries(previous)) {
      if (!keys.has(id)) keys.set(id, decodeKey(value, `ENCRYPTION_PREVIOUS_KEYS.${id}`));
    }
  }

  const blindIndexKey = process.env.BLIND_INDEX_KEY
    ? decodeKey(process.env.BLIND_INDEX_KEY, "BLIND_INDEX_KEY")
    : Buffer.from(hkdfSync("sha256", keys.get(currentId)!, Buffer.alloc(0), "abw-blind-index", KEY_BYTES));

  cachedKeyring = { currentId, keys, blindIndexKey };
  return cachedKeyring;
}

/** For tests: forget cached keys after changing env vars. */
export function resetKeyringForTests() {
  cachedKeyring = null;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${PREFIX}:${FORMAT_VERSION}:`);
}

export function encrypt(plaintext: string, context: string): string {
  const { currentId, keys } = loadKeyring();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keys.get(currentId)!, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, FORMAT_VERSION, currentId, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decrypt(value: string, context: string): string {
  const parts = value.split(":");
  if (parts.length !== 6 || parts[0] !== PREFIX || parts[1] !== FORMAT_VERSION) {
    throw new DecryptionError("Value is not in the expected encrypted format.");
  }
  const [, , keyId, iv, tag, ciphertext] = parts;
  const key = loadKeyring().keys.get(keyId);
  if (!key) throw new DecryptionError(`Unknown encryption key id "${keyId}".`);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // Never echo the value or key material.
    throw new DecryptionError("Decryption failed: wrong key, wrong context, or tampered data.");
  }
}

const BYTES_MAGIC = Buffer.from("ABWB1", "ascii");

/**
 * Encrypt a file. Layout: "ABWB1" | keyId length (1 byte) | keyId | iv (12) |
 * tag (16) | ciphertext. `context` (e.g. the document id) is bound as AAD, so
 * a stored file can't be swapped onto another record.
 */
export function encryptBytes(plaintext: Buffer, context: string): Buffer {
  const { currentId, keys } = loadKeyring();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keys.get(currentId)!, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const id = Buffer.from(currentId, "utf8");
  return Buffer.concat([BYTES_MAGIC, Buffer.from([id.length]), id, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBytes(payload: Buffer, context: string): Buffer {
  if (payload.length < BYTES_MAGIC.length + 1 || !payload.subarray(0, BYTES_MAGIC.length).equals(BYTES_MAGIC)) {
    throw new DecryptionError("File is not in the expected encrypted format.");
  }
  let offset = BYTES_MAGIC.length;
  const idLength = payload[offset];
  offset += 1;
  const keyId = payload.subarray(offset, offset + idLength).toString("utf8");
  offset += idLength;
  const key = loadKeyring().keys.get(keyId);
  if (!key) throw new DecryptionError(`Unknown encryption key id "${keyId}".`);
  const iv = payload.subarray(offset, offset + IV_BYTES);
  offset += IV_BYTES;
  const tag = payload.subarray(offset, offset + 16);
  offset += 16;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload.subarray(offset)), decipher.final()]);
  } catch {
    throw new DecryptionError("Decryption failed: wrong key, wrong context, or tampered data.");
  }
}

/** Encrypt a JSON-serialisable value (e.g. assessment responses). */
export function encryptJson(value: unknown, context: string): string {
  return encrypt(JSON.stringify(value), context);
}

export function decryptJson<T>(value: string, context: string): T {
  return JSON.parse(decrypt(value, context)) as T;
}

/** True when the value was written with a retired key and should be re-encrypted. */
export function needsReencryption(value: string): boolean {
  return isEncrypted(value) && value.split(":")[2] !== loadKeyring().currentId;
}

/**
 * Deterministic keyed hash for exact-match search. Normalise first so
 * "123-45-6789" and "123456789" match.
 */
export function blindIndex(value: string, context: string): string {
  const normalized = value.normalize("NFKC").replace(/[\s-]/g, "").toLowerCase();
  return createHmac("sha256", loadKeyring().blindIndexKey).update(`${context}\u0000${normalized}`).digest("base64url");
}

export function last4(value: string): string {
  return value.replace(/\D/g, "").slice(-4) || value.slice(-4);
}

/** Field contexts used across models, so AAD strings stay consistent. */
export const ENC = {
  patientSsn: "Patient.ssn",
  insuranceMemberId: "InsurancePolicy.memberId",
  insuranceSubscriberDob: "InsurancePolicy.subscriberDob",
  noteSection: (section: "subjective" | "objective" | "assessment" | "plan" | "body") => `ClinicalNote.${section}`,
  noteAddendum: "ClinicalNote.addendum",
  diagnosisDetails: "Diagnosis.details",
  assessmentResponses: "HealthAssessment.responses",
  assessmentHistory: "HealthAssessment.history",
  documentFileName: "ClinicalDocument.fileName",
  messageBody: "SecureMessage.body",
  appointmentReason: "Appointment.reason",
} as const;

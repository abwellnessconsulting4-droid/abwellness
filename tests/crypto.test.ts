import { afterEach, describe, expect, it } from "vitest";
import {
  blindIndex,
  decrypt,
  DecryptionError,
  decryptJson,
  ENC,
  encrypt,
  encryptJson,
  isEncrypted,
  last4,
  needsReencryption,
  resetKeyringForTests,
} from "@/lib/crypto";

const ORIGINAL = { key: process.env.ENCRYPTION_KEY, id: process.env.ENCRYPTION_KEY_ID };

afterEach(() => {
  process.env.ENCRYPTION_KEY = ORIGINAL.key;
  process.env.ENCRYPTION_KEY_ID = ORIGINAL.id;
  delete process.env.ENCRYPTION_PREVIOUS_KEYS;
  resetKeyringForTests();
});

describe("field encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const ciphertext = encrypt("123-45-6789", ENC.patientSsn);
    expect(isEncrypted(ciphertext)).toBe(true);
    expect(ciphertext).not.toContain("6789");
    expect(decrypt(ciphertext, ENC.patientSsn)).toBe("123-45-6789");
  });

  it("uses a fresh IV every time", () => {
    expect(encrypt("same", ENC.patientSsn)).not.toBe(encrypt("same", ENC.patientSsn));
  });

  it("rejects ciphertext moved to another field (AAD binding)", () => {
    const ciphertext = encrypt("BCBS-993847102", ENC.insuranceMemberId);
    expect(() => decrypt(ciphertext, ENC.patientSsn)).toThrow(DecryptionError);
  });

  it("detects tampering", () => {
    const parts = encrypt("Patient reports improved sleep.", ENC.noteSection("subjective")).split(":");
    const body = Buffer.from(parts[5], "base64url");
    body[0] ^= 0xff;
    parts[5] = body.toString("base64url");
    expect(() => decrypt(parts.join(":"), ENC.noteSection("subjective"))).toThrow(DecryptionError);
  });

  it("round-trips JSON (assessment responses)", () => {
    const responses = { q1: 2, q2: 1, q9: 0 };
    expect(decryptJson(encryptJson(responses, ENC.assessmentResponses), ENC.assessmentResponses)).toEqual(responses);
  });

  it("reads values written with a retired key after rotation", () => {
    const old = encrypt("legacy value", ENC.messageBody);
    process.env.ENCRYPTION_PREVIOUS_KEYS = JSON.stringify({ test1: process.env.ENCRYPTION_KEY });
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    process.env.ENCRYPTION_KEY_ID = "test2";
    resetKeyringForTests();

    expect(decrypt(old, ENC.messageBody)).toBe("legacy value");
    expect(needsReencryption(old)).toBe(true);
    expect(needsReencryption(encrypt("new value", ENC.messageBody))).toBe(false);
  });

  it("refuses unknown keys without leaking details", () => {
    const value = encrypt("x", ENC.messageBody).replace(":test1:", ":nope:");
    expect(() => decrypt(value, ENC.messageBody)).toThrow(/Unknown encryption key/);
  });
});

describe("blind index", () => {
  it("is deterministic and ignores formatting", () => {
    expect(blindIndex("123-45-6789", ENC.patientSsn)).toBe(blindIndex("123 45 6789", ENC.patientSsn));
    expect(blindIndex("123456789", ENC.patientSsn)).not.toBe(blindIndex("123456780", ENC.patientSsn));
  });

  it("differs per context", () => {
    expect(blindIndex("993847102", ENC.patientSsn)).not.toBe(blindIndex("993847102", ENC.insuranceMemberId));
  });

  it("extracts last four digits", () => {
    expect(last4("123-45-6789")).toBe("6789");
    expect(last4("BCBS993847102")).toBe("7102");
  });
});

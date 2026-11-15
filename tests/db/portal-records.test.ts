import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuditedDenial } from "@/lib/audit";
import { isEncrypted } from "@/lib/crypto";
import { systemToken } from "@/lib/db/phi-guard";
import { openSafetyFlags, reviewSafetyFlag, scoreScreener, submitScreener } from "@/lib/services/assessments";
import { consentForSigning, myConsents, signConsent } from "@/lib/services/consents";
import { downloadDocument, listDocuments, uploadDocument } from "@/lib/services/documents";
import { bookingOptions } from "@/lib/services/portal-appointments";
import { IDS } from "@/scripts/seed/emr";
import { AuditLog, HealthAssessment } from "@/models";
import { EMAIL, setupSeededDatabase } from "./seeded";

const { as } = setupSeededDatabase("portal-records");
const SYS = { authz: systemToken("test") };
const ELENA = "elena.vance@example.com";
const SOFIA = "sofia.lin@example.com";
const DAVID = "david.morales@example.com";
const elena = String(IDS.patients.elena);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake image body for tests")]);
const pdf = Buffer.from("%PDF-1.7\nreferral letter body\n%%EOF");
let dir = "";

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "abw-uploads-"));
  process.env.LOCAL_STORAGE_DIR = dir;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.LOCAL_STORAGE_DIR;
});

const filesOnDisk = (root: string): string[] =>
  readdirSync(root).flatMap((name) => {
    const full = path.join(root, name);
    return statSync(full).isDirectory() ? filesOnDisk(full) : [full];
  });

describe("documents", () => {
  let cardId = "";
  let referralId = "";

  it("stores uploads encrypted and gives the client their file back", async () => {
    const ctx = await as(ELENA);
    cardId = await uploadDocument(ctx, { category: "INSURANCE_CARD_FRONT", fileName: "my card.png", bytes: png });
    referralId = await uploadDocument(ctx, { category: "REFERRAL", fileName: "referral from Dr. Kim.pdf", bytes: pdf });
    const stored = filesOnDisk(dir).map((f) => readFileSync(f));
    expect(stored).toHaveLength(2);
    expect(stored.every((b) => !b.includes(Buffer.from("fake image body")) && !b.includes(Buffer.from("%PDF")))).toBe(true);

    const download = await downloadDocument(ctx, cardId);
    expect(download).toMatchObject({ mimeType: "image/png", fileName: "my card.png" });
    expect(download.bytes.equals(png)).toBe(true);
    const mine = await listDocuments(ctx, elena);
    expect(mine.filter((d) => d.uploadedByClient).map((d) => d.label)).toEqual(expect.arrayContaining(["Insurance card (front)", "Referral"]));
    expect(await AuditLog.countDocuments({ action: "DOWNLOAD", resourceId: cardId }).setOptions(SYS)).toBe(1);
  });

  it("checks the real file type, the size, and what clients may upload", async () => {
    const ctx = await as(ELENA);
    await expect(uploadDocument(ctx, { category: "REFERRAL", fileName: "x.pdf", bytes: Buffer.from("MZ\x90\x00 not a pdf") })).rejects.toThrow(/PDF, JPEG/);
    await expect(uploadDocument(ctx, { category: "REFERRAL", fileName: "big.pdf", bytes: Buffer.concat([pdf, Buffer.alloc(4 * 1024 * 1024)]) })).rejects.toThrow(/4 MB/);
    await expect(uploadDocument(ctx, { category: "SIGNED_CONSENT", fileName: "x.pdf", bytes: pdf })).rejects.toThrow(/kind of document/);
  });

  it("enforces category limits for staff and blocks other clients", async () => {
    const billing = await as(EMAIL.billing);
    expect((await downloadDocument(billing, cardId)).bytes.equals(png)).toBe(true); // insurance card: allowed
    await expect(downloadDocument(billing, referralId)).rejects.toBeInstanceOf(AuditedDenial); // referral: clinical
    expect((await listDocuments(billing, elena)).some((d) => d.id === referralId)).toBe(false);
    await expect(downloadDocument(await as(DAVID), cardId)).rejects.toBeInstanceOf(AuditedDenial);
    expect((await downloadDocument(await as(EMAIL.thorne), referralId)).fileName).toBe("referral from Dr. Kim.pdf");
  });
});

describe("consents", () => {
  it("shows Sofia which agreements are missing and lets her sign the telehealth consent", async () => {
    const sofia = await as(SOFIA);
    const before = await myConsents(sofia);
    expect(Object.fromEntries(before.map((c) => [c.type, c.state]))).toMatchObject({ HIPAA_PRIVACY_NOTICE: "SIGNED", FINANCIAL_RESPONSIBILITY: "SIGNED", TELEHEALTH_CONSENT: "NEEDS_SIGNATURE", CONSENT_FOR_TREATMENT: "NEEDS_SIGNATURE" });

    const form = await consentForSigning(sofia, "TELEHEALTH_CONSENT");
    const evidence = { ipAddress: "203.0.113.9", userAgent: "vitest" };
    await expect(signConsent(sofia, { type: "TELEHEALTH_CONSENT", contentHash: "stale", signatureName: "Sofia Lin", ...evidence })).rejects.toThrow(/updated/);
    await expect(signConsent(sofia, { type: "TELEHEALTH_CONSENT", contentHash: form.contentHash, signatureName: "S L", ...evidence })).rejects.toThrow(/full name/);
    await signConsent(sofia, { type: "TELEHEALTH_CONSENT", contentHash: form.contentHash, signatureName: "Sofia Lin", ...evidence });

    const after = await myConsents(sofia);
    const telehealth = after.find((c) => c.type === "TELEHEALTH_CONSENT")!;
    expect(telehealth.state).toBe("SIGNED");
    expect(Math.round((telehealth.expiresAt!.getTime() - Date.now()) / 86_400_000)).toBe(365);
    expect((await bookingOptions(sofia)).telehealthConsent).toBe(true); // video booking unlocks
    expect((await myConsents(sofia, new Date(Date.now() + 366 * 86_400_000))).find((c) => c.type === "TELEHEALTH_CONSENT")!.state).toBe("EXPIRED");
  });
});

describe("screeners", () => {
  it("scores the PHQ-9 and GAD-7 per the published bands", () => {
    expect(scoreScreener("PHQ9", [1, 1, 1, 1, 1, 1, 1, 1, 1])).toMatchObject({ score: 9, label: "Mild", safetyFlag: true });
    expect(scoreScreener("PHQ9", [3, 3, 3, 3, 3, 0, 0, 0, 0])).toMatchObject({ score: 15, label: "Moderately severe", safetyFlag: false });
    expect(scoreScreener("GAD7", [3, 3, 3, 3, 3, 3, 3])).toMatchObject({ score: 21, label: "Severe" });
    expect(() => scoreScreener("GAD7", [1, 2])).toThrow(/every question/);
  });

  it("an item-9 answer flags the assigned provider, stores answers encrypted, and can be reviewed", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await submitScreener(await as(ELENA), "PHQ9", [1, 2, 1, 1, 0, 1, 1, 0, 1]);
    expect(result).toMatchObject({ score: 8, label: "Mild", safetyFlag: true });
    const stored = await HealthAssessment.findById(result.id).select("+responsesEnc").setOptions(SYS).lean();
    expect(isEncrypted(stored?.responsesEnc)).toBe(true);
    const alert = log.mock.calls.map((c) => String(c[0])).find((m) => m.includes("to=aris.thorne@example.com"));
    expect(alert).toBeDefined();
    expect(alert).not.toMatch(/Elena|Vance|PHQ|self-harm/i); // no health information in email
    log.mockRestore();

    const thorne = await as(EMAIL.thorne);
    expect((await openSafetyFlags(thorne)).map((f) => f.patient)).toContain("Elena Vance");
    expect(await openSafetyFlags(await as(EMAIL.ellis))).toEqual([]);
    await expect(reviewSafetyFlag(await as(EMAIL.ellis), result.id)).rejects.toBeInstanceOf(AuditedDenial);
    await reviewSafetyFlag(thorne, result.id);
    expect(await openSafetyFlags(thorne)).toEqual([]);
  });
});

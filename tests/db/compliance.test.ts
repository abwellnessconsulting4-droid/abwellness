import { describe, expect, it } from "vitest";
import { AuditedDenial } from "@/lib/audit";
import { systemToken } from "@/lib/db/phi-guard";
import { accessReviewCsv, ComplianceError, complianceOverview, logEntry, recordBackupDrill, signAccessReview, updateBaa } from "@/lib/services/compliance";
import { AuditLog } from "@/models";
import { EMAIL, setupSeededDatabase } from "./seeded";

const { as } = setupSeededDatabase("compliance");
const SYS = { authz: systemToken("test") };
const NOW = new Date("2026-11-15T17:00:00Z");

describe("compliance overview", () => {
  it("is for the super admin only", async () => {
    await expect(complianceOverview(await as(EMAIL.billing), NOW)).rejects.toBeInstanceOf(AuditedDenial);
    await expect(complianceOverview(await as(EMAIL.thorne), NOW)).rejects.toBeInstanceOf(AuditedDenial);
  });

  it("lists the BAA registry with gaps, drills, reviews, and automated checks", async () => {
    const o = await complianceOverview(await as(EMAIL.admin), NOW);
    expect(o.baas.map((b) => b.vendor)).toEqual(expect.arrayContaining(["Vercel", "Stripe", "Resend", "Daily.co"]));
    expect(o.baas.find((b) => b.vendor === "Stripe")).toMatchObject({ status: "NOT_APPLICABLE", attention: false });
    expect(o.summary.baaGaps).toBe(4); // MongoDB, Vercel, clearinghouse, Daily are pending
    expect(o.backupDue).toBe(false); // seeded drill on 11/10 passed
    expect(o.accessReviewDue).toBe(true);
    expect(o.checks.map((c) => c.id)).toEqual(["encryption", "storage", "cron", "payments", "video", "email", "mfa", "audit", "notes", "safety"]);
    expect(o.checks.find((c) => c.id === "audit")?.status).toBe("PASS");
    expect(o.staff.every((s) => s.role !== "PATIENT")).toBe(true);
  });
});

describe("recording evidence", () => {
  it("updates a BAA (signed date required when active) and flags renewals within 60 days", async () => {
    const admin = await as(EMAIL.admin);
    const vercel = (await complianceOverview(admin, NOW)).baas.find((b) => b.vendor === "Vercel")!;
    await expect(updateBaa(admin, { id: vercel.id, vendor: "Vercel", service: vercel.service, status: "ACTIVE" })).rejects.toThrow(/signed/);
    await expect(updateBaa(admin, { vendor: "Some vendor", service: "x", status: "NOT_APPLICABLE" })).rejects.toThrow(/Explain/);
    await updateBaa(admin, { id: vercel.id, vendor: "Vercel", service: vercel.service, status: "ACTIVE", signedDate: "2026-11-14", renewalDate: "2026-12-20" });
    const after = (await complianceOverview(admin, NOW)).baas.find((b) => b.vendor === "Vercel")!;
    expect(after).toMatchObject({ status: "ACTIVE", renewalSoon: true, attention: true });
  });

  it("records restore drills only against non-production targets", async () => {
    const admin = await as(EMAIL.admin);
    const base = { vendor: "MongoDB Atlas", snapshotAt: "2026-11-15T03:00:00Z", restoreTestedAt: "2026-11-15T14:00:00Z", result: "PASSED" };
    await expect(recordBackupDrill(admin, { ...base, restoredTo: "abwellness_production" })).rejects.toBeInstanceOf(ComplianceError);
    await recordBackupDrill(admin, { ...base, restoredTo: "abwellness_restore_test", durationMinutes: 22 });
    expect((await complianceOverview(admin, NOW)).backups[0]).toMatchObject({ restoredTo: "abwellness_restore_test", result: "PASSED", durationMinutes: 22 });
  });

  it("signs the access review, logs incidents, and exports the staff list (audited)", async () => {
    const admin = await as(EMAIL.admin);
    await expect(signAccessReview(admin, "ok")).rejects.toBeInstanceOf(ComplianceError);
    await signAccessReview(admin, "Reviewed all staff roles; no changes needed this quarter.");
    await logEntry(admin, "RISK_ASSESSMENT", "Annual risk assessment kickoff: inventory of systems holding PHI.");
    const o = await complianceOverview(admin, new Date());
    expect(o.accessReviewDue).toBe(false);
    expect(o.log[0]).toMatchObject({ kind: "RISK_ASSESSMENT" });

    const { csv, filename } = await accessReviewCsv(admin);
    expect(filename).toMatch(/^abwellness-access-review-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Name,Email,Role,Status,Two-step verification,Last sign-in,Account created");
    expect(lines.some((l) => l.includes("elena.vance@example.com"))).toBe(false); // clients excluded
    expect(lines.some((l) => l.includes("billing@example.com,BILLING_STAFF"))).toBe(true);
    expect(await AuditLog.countDocuments({ action: "EXPORT", resourceType: "AccessReview" }).setOptions(SYS)).toBe(1);
  });
});

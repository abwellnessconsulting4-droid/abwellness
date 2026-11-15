import "server-only";

import { Types } from "mongoose";
import { recordAudit, verifyAuditChain } from "@/lib/audit";
import { authorize, type AuthContext } from "@/lib/authz";
import { systemToken } from "@/lib/db/phi-guard";
import { listUsers } from "@/lib/admin/users";
import { isStaff, ROLES, type Role } from "@/lib/rbac";
import { ClinicalNote, ComplianceRecord, HealthAssessment } from "@/models";

/**
 * HIPAA administrative-safeguard tracking for the super admin: business
 * associate agreements, backup/restore drills, quarterly access reviews,
 * incidents and risk assessments, plus automated checks of the running
 * configuration. Records are append-only evidence (updates are audited).
 */

const SYS = { authz: systemToken("compliance") };
const DAY = 86_400_000;
export class ComplianceError extends Error {}

export const REVIEW_INTERVAL_DAYS = 90;
export const BAA_STATUSES = ["ACTIVE", "PENDING", "EXPIRED", "TERMINATED", "NOT_APPLICABLE"] as const;
export const LOG_KINDS = ["INCIDENT", "RISK_ASSESSMENT"] as const;

export type CheckStatus = "PASS" | "WARN" | "FAIL";
export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

async function requireCompliance(ctx: AuthContext, action: "read" | "create" | "update" | "export") {
  await authorize(ctx, "compliance", action);
}

/** Automated checks against the live configuration and data. */
async function configurationChecks(ctx: AuthContext, now: Date, staff: { role: string; status: string; twoFactorEnabled: boolean; name: string }[]): Promise<Check[]> {
  const env = process.env;
  const onVercel = Boolean(env.VERCEL);
  const checks: Check[] = [];
  checks.push({
    id: "encryption",
    label: "Field and file encryption keys",
    status: env.ENCRYPTION_KEY ? (env.BLIND_INDEX_KEY ? "PASS" : "WARN") : "FAIL",
    detail: env.ENCRYPTION_KEY ? (env.BLIND_INDEX_KEY ? "ENCRYPTION_KEY and a separate BLIND_INDEX_KEY are set." : "ENCRYPTION_KEY is set; BLIND_INDEX_KEY is derived from it. Set a separate key for defense in depth.") : "ENCRYPTION_KEY is missing.",
  });
  const blob = Boolean(env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID || env.STORAGE_PROVIDER === "vercel-blob");
  checks.push({
    id: "storage",
    label: "Document storage",
    status: blob ? "PASS" : onVercel ? "FAIL" : "WARN",
    detail: blob ? "Private Vercel Blob store connected (files are encrypted before upload)." : onVercel ? "No private Blob store connected: uploads will fail." : "Local development storage (.data/uploads).",
  });
  checks.push({ id: "cron", label: "Scheduled billing job (autopay, reminders)", status: env.CRON_SECRET ? "PASS" : "WARN", detail: env.CRON_SECRET ? "CRON_SECRET is set." : "CRON_SECRET isn't set; /api/cron/billing will refuse to run." });
  checks.push({ id: "payments", label: "Payment processor", status: env.PAYMENT_PROCESSOR && env.PAYMENT_PROCESSOR !== "simulated" ? "PASS" : "WARN", detail: env.PAYMENT_PROCESSOR && env.PAYMENT_PROCESSOR !== "simulated" ? `Using ${env.PAYMENT_PROCESSOR}.` : "Simulated test checkout: no real payments are collected." });
  checks.push({ id: "video", label: "Telehealth video", status: env.TELEHEALTH_PROVIDER === "daily" ? "PASS" : "WARN", detail: env.TELEHEALTH_PROVIDER === "daily" ? "Daily (BAA required)." : "Mock video tile: connect a BAA-covered video provider before live visits." });
  checks.push({ id: "email", label: "Email contents", status: "PASS", detail: "All notification emails are content-free (no PHI); Resend is used without a BAA by design." });

  const activeStaff = staff.filter((u) => isStaff(u.role as Role) && u.status === "ACTIVE");
  const noMfa = activeStaff.filter((u) => !u.twoFactorEnabled);
  checks.push({
    id: "mfa",
    label: "Two-step verification for staff",
    status: noMfa.length === 0 ? "PASS" : "WARN",
    detail: noMfa.length === 0 ? `All ${activeStaff.length} active staff have two-step verification.` : `${noMfa.length} active staff haven't finished setup (they're prompted at next sign-in): ${noMfa.map((u) => u.name).join(", ")}.`,
  });

  const chain = await verifyAuditChain();
  checks.push({ id: "audit", label: "Audit trail integrity", status: chain.ok ? "PASS" : "FAIL", detail: chain.ok ? `Hash chain verified (${chain.checked} entries).` : `Chain ${chain.problem?.replace("_", " ") ?? "problem"} at entry ${chain.brokenAtSeq ?? "?"}: investigate immediately.` });

  const overdueNotes = await ClinicalNote.countDocuments({ status: { $ne: "SIGNED_LOCKED" }, createdAt: { $lt: new Date(now.getTime() - 48 * 3_600_000) } }).setOptions(SYS);
  checks.push({ id: "notes", label: "Clinical documentation", status: overdueNotes === 0 ? "PASS" : "WARN", detail: overdueNotes === 0 ? "No notes unsigned for more than 48 hours." : `${overdueNotes} notes unsigned for more than 48 hours.` });

  const staleFlags = await HealthAssessment.countDocuments({ "safetyFlag.raised": true, "safetyFlag.reviewedAt": null, completedAt: { $lt: new Date(now.getTime() - DAY) } }).setOptions(SYS);
  checks.push({ id: "safety", label: "Safety responses reviewed", status: staleFlags === 0 ? "PASS" : "FAIL", detail: staleFlags === 0 ? "No PHQ-9 safety flags waiting more than 24 hours." : `${staleFlags} PHQ-9 safety flags unreviewed for more than 24 hours.` });
  return checks;
}

export async function complianceOverview(ctx: AuthContext, now = new Date()) {
  await requireCompliance(ctx, "read");
  const [records, users] = await Promise.all([ComplianceRecord.find({}).sort({ createdAt: -1 }).lean(), listUsers(ctx)]);
  const staff = users.filter((u) => (ROLES as readonly string[]).includes(u.role) && u.role !== "PATIENT");
  const baas = records
    .filter((r) => r.kind === "BAA")
    .map((r) => {
      const renewalSoon = Boolean(r.renewalDate && r.renewalDate.getTime() - now.getTime() < 60 * DAY);
      return {
        id: String(r._id),
        vendor: r.vendor ?? "",
        service: r.service ?? "",
        status: r.baaStatus ?? "PENDING",
        signedDate: r.signedDate ?? undefined,
        renewalDate: r.renewalDate ?? undefined,
        notes: r.notApplicableReason ?? r.notes ?? undefined,
        attention: r.baaStatus === "PENDING" || r.baaStatus === "EXPIRED" || (r.baaStatus === "ACTIVE" && renewalSoon),
        renewalSoon,
      };
    })
    .sort((a, b) => a.vendor.localeCompare(b.vendor));
  const backups = records.filter((r) => r.kind === "BACKUP_VERIFICATION").map((r) => ({ id: String(r._id), vendor: r.vendor ?? "", ...r.backup, notes: r.notes ?? undefined }));
  const lastPassingDrill = backups.find((b) => b.result === "PASSED")?.restoreTestedAt;
  const reviews = records.filter((r) => r.kind === "ACCESS_REVIEW").map((r) => ({ id: String(r._id), at: (r as { createdAt?: Date }).createdAt!, notes: r.notes ?? "" }));
  const log = records.filter((r) => (LOG_KINDS as readonly string[]).includes(r.kind)).map((r) => ({ id: String(r._id), kind: r.kind, at: (r as { createdAt?: Date }).createdAt!, notes: r.notes ?? "" }));
  const checks = await configurationChecks(ctx, now, staff);
  const due = (d: Date | undefined | null) => !d || now.getTime() - new Date(d).getTime() > REVIEW_INTERVAL_DAYS * DAY;

  await recordAudit(ctx, { action: "VIEW", resourceType: "ComplianceOverview" });
  return {
    baas,
    backups,
    backupDue: due(lastPassingDrill),
    lastPassingDrill,
    reviews,
    accessReviewDue: due(reviews[0]?.at),
    log,
    checks,
    staff: staff.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, twoFactorEnabled: u.twoFactorEnabled, lastLoginAt: u.lastLoginAt })),
    summary: {
      baaGaps: baas.filter((b) => b.attention).length,
      failing: checks.filter((c) => c.status === "FAIL").length,
      warnings: checks.filter((c) => c.status === "WARN").length,
    },
  };
}

/** The database this app is running against (from MONGODB_URI). */
function liveDatabaseName() {
  try {
    return new URL(process.env.MONGODB_URI ?? "").pathname.replace(/^\//, "") || null;
  } catch {
    return null;
  }
}

function date(value: string | undefined, label: string) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ComplianceError(`${label} isn't a valid date.`);
  return d;
}

export async function updateBaa(ctx: AuthContext, input: { id?: string; vendor: string; service: string; status: string; signedDate?: string; renewalDate?: string; notes?: string }) {
  await requireCompliance(ctx, input.id ? "update" : "create");
  if (!(BAA_STATUSES as readonly string[]).includes(input.status)) throw new ComplianceError("Choose a status.");
  const vendor = input.vendor.trim();
  if (vendor.length < 2) throw new ComplianceError("Enter the vendor.");
  if (input.status === "NOT_APPLICABLE" && !input.notes?.trim()) throw new ComplianceError("Explain why a BAA isn't needed (for example the payment-processing exemption).");
  if (input.status === "ACTIVE" && !input.signedDate) throw new ComplianceError("Enter the date the BAA was signed.");
  const fields = {
    kind: "BAA" as const,
    vendor,
    service: input.service.trim(),
    baaStatus: input.status as (typeof BAA_STATUSES)[number],
    signedDate: date(input.signedDate, "Signed date"),
    renewalDate: date(input.renewalDate, "Renewal date"),
    notes: input.status === "NOT_APPLICABLE" ? undefined : input.notes?.trim() || undefined,
    notApplicableReason: input.status === "NOT_APPLICABLE" ? input.notes?.trim() : undefined,
    recordedBy: new Types.ObjectId(ctx.userId),
  };
  let id = input.id;
  if (id) {
    if (!Types.ObjectId.isValid(id)) throw new ComplianceError("Record not found.");
    const res = await ComplianceRecord.updateOne({ _id: id, kind: "BAA" }, { $set: fields });
    if (res.matchedCount === 0) throw new ComplianceError("Record not found.");
  } else {
    id = String((await ComplianceRecord.create(fields))._id);
  }
  await recordAudit(ctx, { action: input.id ? "UPDATE" : "CREATE", resourceType: "ComplianceRecord", resourceId: id, metadata: { kind: "BAA", vendor, status: input.status } });
  return id;
}

export async function recordBackupDrill(ctx: AuthContext, input: { vendor: string; snapshotAt: string; restoreTestedAt: string; restoredTo: string; result: string; durationMinutes?: number; notes?: string }) {
  await requireCompliance(ctx, "create");
  if (!["PASSED", "FAILED"].includes(input.result)) throw new ComplianceError("Choose passed or failed.");
  const target = input.restoredTo.trim();
  if (!target || target === liveDatabaseName() || (/prod/i.test(target) && !/non-?prod/i.test(target))) {
    throw new ComplianceError("Restore drills must target a non-production database (for example abwellness_restore_test), never the live one.");
  }
  const doc = await ComplianceRecord.create({
    kind: "BACKUP_VERIFICATION",
    vendor: input.vendor.trim() || "MongoDB Atlas",
    backup: {
      snapshotAt: date(input.snapshotAt, "Snapshot time"),
      restoreTestedAt: date(input.restoreTestedAt, "Restore time"),
      restoredTo: target,
      result: input.result as "PASSED" | "FAILED",
      durationMinutes: input.durationMinutes && input.durationMinutes > 0 ? Math.round(input.durationMinutes) : undefined,
    },
    notes: input.notes?.trim() || undefined,
    recordedBy: ctx.userId,
  });
  await recordAudit(ctx, { action: "CREATE", resourceType: "ComplianceRecord", resourceId: String(doc._id), metadata: { kind: "BACKUP_VERIFICATION", result: input.result } });
}

/** Sign off the quarterly access review (after reviewing the staff × role list). */
export async function signAccessReview(ctx: AuthContext, notes: string) {
  await requireCompliance(ctx, "create");
  const text = notes.trim();
  if (text.length < 10) throw new ComplianceError("Summarize what you reviewed and any changes made (at least a sentence).");
  const users = await listUsers(ctx);
  const snapshot = users.filter((u) => u.role !== "PATIENT").map((u) => `${u.email}:${u.role}:${u.status}:${u.twoFactorEnabled ? "mfa" : "no-mfa"}`);
  const doc = await ComplianceRecord.create({ kind: "ACCESS_REVIEW", notes: `${text}\n\nReviewed ${snapshot.length} staff accounts.`, recordedBy: ctx.userId });
  await recordAudit(ctx, { action: "SIGN", resourceType: "ComplianceRecord", resourceId: String(doc._id), metadata: { kind: "ACCESS_REVIEW", accounts: snapshot.length } });
}

export async function logEntry(ctx: AuthContext, kind: string, notes: string) {
  await requireCompliance(ctx, "create");
  if (!(LOG_KINDS as readonly string[]).includes(kind)) throw new ComplianceError("Choose incident or risk assessment.");
  const text = notes.trim();
  if (text.length < 10) throw new ComplianceError("Describe it in at least a sentence. Don't include client names; refer to MRNs if needed.");
  const doc = await ComplianceRecord.create({ kind: kind as (typeof LOG_KINDS)[number], notes: text.slice(0, 5000), recordedBy: ctx.userId });
  await recordAudit(ctx, { action: "CREATE", resourceType: "ComplianceRecord", resourceId: String(doc._id), metadata: { kind } });
}

/** CSV of staff accounts, roles, MFA, and last sign-in for access-review evidence. */
export async function accessReviewCsv(ctx: AuthContext, now = new Date()) {
  await requireCompliance(ctx, "export");
  const users = (await listUsers(ctx)).filter((u) => u.role !== "PATIENT");
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : /^[=+\-@]/.test(v) ? `'${v}` : v);
  const rows = [
    ["Name", "Email", "Role", "Status", "Two-step verification", "Last sign-in", "Account created"],
    ...users.map((u) => [u.name, u.email, u.role, u.status, u.twoFactorEnabled ? "Yes" : "No", u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : "Never", u.createdAt ? new Date(u.createdAt).toISOString() : ""]),
  ];
  await recordAudit(ctx, { action: "EXPORT", resourceType: "AccessReview", metadata: { accounts: users.length } });
  return { csv: `﻿${rows.map((r) => r.map((v) => cell(String(v))).join(",")).join("\r\n")}`, filename: `abwellness-access-review-${now.toISOString().slice(0, 10)}.csv` };
}

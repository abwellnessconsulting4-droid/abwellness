import "server-only";

import { Types } from "mongoose";
import { recordAudit } from "@/lib/audit";
import { authorizeAny, type AuthContext } from "@/lib/authz";
import { systemToken } from "@/lib/db/phi-guard";
import { DEFAULT_TZ } from "@/lib/services/scheduling";
import { zonedTime } from "@/lib/tz";
import {
  Appointment,
  AuditLog,
  Claim,
  ClinicalNote,
  InsurancePolicy,
  Invoice,
  Patient,
  PaymentTransaction,
  ProviderSchedule,
  StaffProfile,
  VisitSurvey,
  REFERRAL_SOURCES,
} from "@/models";

/**
 * Executive analytics. Aggregates only: no names or clinical detail leave
 * this module except provider names (staff, not PHI) and counts. Providers
 * see their own caseload and claims; billing and admins see the practice.
 *
 * Definitions (shown in the UI next to each metric):
 *  - Active clients: status ACTIVE. Inactive: INACTIVE or DISCHARGED.
 *  - No-show rate (90 days): no-shows ÷ (completed + no-shows).
 *  - Late-cancellation rate (90 days): late cancels ÷ all visits that were due.
 *  - Retention: clients with a completed visit in days 91–180 ago who also
 *    completed one in the last 90 days.
 *  - Portal engagement: clients with a portal account who used the portal in
 *    the last 30 days (any audited action), ÷ clients with a portal account.
 *  - First-pass denial rate: submitted claims that were ever denied ÷ submitted.
 *  - Revenue: cash received: insurance payments (by adjudication date) plus
 *    client payments (by payment date), minus refunds. Not a P&L: expenses
 *    aren't tracked in this system.
 *  - Utilization (30 days): booked visit hours ÷ scheduled availability hours.
 *  - Documentation completion: completed visits with a note signed within
 *    48 hours of the visit's end.
 */

const SYS = { authz: systemToken("analytics") };
const DAY = 86_400_000;

export interface MonthPoint {
  key: string; // YYYY-MM
  label: string; // "Nov"
}

/** The last `count` calendar months (practice time zone), oldest first. */
export function lastMonths(now: Date, count = 12): (MonthPoint & { start: Date; end: Date })[] {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, year: "numeric", month: "2-digit" }).formatToParts(now);
  let year = Number(parts.find((p) => p.type === "year")!.value);
  let month = Number(parts.find((p) => p.type === "month")!.value);
  const out: (MonthPoint & { start: Date; end: Date })[] = [];
  for (let i = 0; i < count; i += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const start = zonedTime(`${key}-01`, "00:00", DEFAULT_TZ);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const end = zonedTime(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`, "00:00", DEFAULT_TZ);
    out.unshift({ key, label: new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TZ, month: "short", year: i === 0 || month === 1 ? "2-digit" : undefined }).format(new Date(start.getTime() + 15 * DAY)), start, end });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

function bucket<T>(rows: T[], months: ReturnType<typeof lastMonths>, at: (row: T) => Date | null | undefined, value: (row: T) => number = () => 1) {
  return months.map((m) => ({ key: m.key, label: m.label, value: rows.reduce((n, r) => {
    const d = at(r);
    return d && d >= m.start && d < m.end ? n + value(r) : n;
  }, 0) }));
}

const ratio = (num: number, den: number) => (den > 0 ? num / den : null);

/** Who the viewer may see: providers their own caseload, everyone else the practice. */
async function scope(ctx: AuthContext) {
  await authorizeAny(ctx, "analytics", "read");
  if (ctx.role !== "PROVIDER") return { providerId: null as Types.ObjectId | null, patientIds: null as Types.ObjectId[] | null, label: "Whole practice" };
  const providerId = new Types.ObjectId(ctx.staffProfileId);
  const patients = await Patient.find({ assignedProviderId: providerId }, { _id: 1 }).setOptions(SYS).lean();
  return { providerId, patientIds: patients.map((p) => p._id as Types.ObjectId), label: "Your caseload" };
}

function ageOn(dob: Date, now: Date) {
  const a = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  return beforeBirthday ? a - 1 : a;
}

const AGE_BANDS = [
  { label: "Under 18", max: 17 },
  { label: "18–29", max: 29 },
  { label: "30–44", max: 44 },
  { label: "45–64", max: 64 },
  { label: "65+", max: Infinity },
];

const REFERRAL_LABELS: Record<string, string> = {
  SELF: "Self",
  PROVIDER_REFERRAL: "Provider referral",
  INSURANCE: "Insurance directory",
  WEBSITE: "Website",
  COMMUNITY_PARTNER: "Community partner",
  EMPLOYER: "Employer",
  OTHER: "Other",
  UNKNOWN: "Not recorded",
};

// ── Patients ────────────────────────────────────────────────────────────────

export async function patientAnalytics(ctx: AuthContext, now = new Date()) {
  const s = await scope(ctx);
  const months = lastMonths(now);
  const patientFilter = s.patientIds ? { _id: { $in: s.patientIds } } : {};
  const apptFilter = s.providerId ? { providerId: s.providerId } : {};
  const [patients, appointments, policies] = await Promise.all([
    Patient.find(patientFilter, { dob: 1, gender: 1, status: 1, registeredAt: 1, userId: 1, referralSource: 1 }).setOptions(SYS).lean(),
    Appointment.find({ ...apptFilter, scheduledStart: { $gte: new Date(now.getTime() - 400 * DAY) } }, { patientId: 1, status: 1, scheduledStart: 1, scheduledEnd: 1 }).setOptions(SYS).lean(),
    InsurancePolicy.find({ ...(s.patientIds ? { patientId: { $in: s.patientIds } } : {}), active: true, priority: "PRIMARY" }, { patientId: 1, payerName: 1 }).setOptions(SYS).lean(),
  ]);
  const living = patients.filter((p) => p.status !== "DECEASED");
  const active = living.filter((p) => p.status === "ACTIVE").length;
  const registrations = bucket(living, months, (p) => p.registeredAt);
  const thisMonth = registrations.at(-1)!.value;
  const lastMonth = registrations.at(-2)!.value;

  const tally = (labels: string[]) => {
    const counts = new Map<string, number>();
    for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const ages = AGE_BANDS.map((b, i) => ({
    label: b.label,
    value: living.filter((p) => {
      const age = ageOn(new Date(p.dob), now);
      return age <= b.max && age > (i === 0 ? -1 : AGE_BANDS[i - 1].max);
    }).length,
  }));
  const payerOf = new Map(policies.map((p) => [String(p.patientId), p.payerName]));
  const due = (a: { scheduledStart: Date }) => a.scheduledStart <= now;
  const last90 = appointments.filter((a) => due(a) && a.scheduledStart >= new Date(now.getTime() - 90 * DAY));
  const completed90 = last90.filter((a) => a.status === "COMPLETED").length;
  const noShow90 = last90.filter((a) => a.status === "NO_SHOW").length;
  const late90 = last90.filter((a) => a.status === "LATE_CANCELLED").length;
  const seen = (from: number, to: number) => new Set(appointments.filter((a) => a.status === "COMPLETED" && a.scheduledStart >= new Date(now.getTime() - to * DAY) && a.scheduledStart < new Date(now.getTime() - from * DAY)).map((a) => String(a.patientId)));
  const earlier = seen(90, 180);
  const recent = seen(0, 90);
  const retained = [...earlier].filter((id) => recent.has(id)).length;

  const withPortal = living.filter((p) => p.userId);
  const portalUsers = await AuditLog.distinct("actorId", { actorRole: "PATIENT", action: { $nin: ["LOGIN_FAILED", "UNAUTHORIZED_ACCESS_ATTEMPT"] }, createdAt: { $gte: new Date(now.getTime() - 30 * DAY) } }).setOptions(SYS);
  const engaged = withPortal.filter((p) => portalUsers.map(String).includes(String(p.userId))).length;

  await recordAudit(ctx, { action: "VIEW", resourceType: "Analytics", metadata: { tab: "patients", scope: s.label } });
  return {
    scope: s.label,
    totals: {
      registered: living.length,
      active,
      inactive: living.filter((p) => p.status === "INACTIVE" || p.status === "DISCHARGED").length,
      newThisMonth: thisMonth,
      newLastMonth: lastMonth,
      momChange: lastMonth > 0 ? (thisMonth - lastMonth) / lastMonth : null,
    },
    registrations,
    visits: bucket(appointments.filter((a) => !["CANCELLED", "LATE_CANCELLED"].includes(a.status)), months, (a) => a.scheduledStart),
    demographics: {
      age: ages,
      gender: tally(living.map((p) => p.gender?.trim() || "Not recorded")),
      payer: tally(living.map((p) => payerOf.get(String(p._id)) ?? "Self-pay")),
    },
    rates: {
      noShow: ratio(noShow90, completed90 + noShow90),
      noShowCounts: { noShow: noShow90, completed: completed90 },
      lateCancel: ratio(late90, last90.length),
      retention: ratio(retained, earlier.size),
      retentionCounts: { retained, cohort: earlier.size },
      portalEngagement: ratio(engaged, withPortal.length),
      portalCounts: { engaged, withAccount: withPortal.length },
    },
  };
}

// ── Billing & revenue ───────────────────────────────────────────────────────

export async function billingAnalytics(ctx: AuthContext, now = new Date()) {
  const s = await scope(ctx);
  const months = lastMonths(now);
  const claimFilter = s.providerId ? { providerId: s.providerId } : {};
  const patientFilter = s.patientIds ? { patientId: { $in: s.patientIds } } : {};
  const [claims, payments, invoices, staff] = await Promise.all([
    Claim.find(claimFilter, { status: 1, statusHistory: 1, totalBilledCents: 1, insurancePaidCents: 1, contractualAdjustmentCents: 1, patientResponsibilityCents: 1, adjudicatedAt: 1, providerId: 1, lines: 1, createdAt: 1 }).setOptions(SYS).lean(),
    PaymentTransaction.find({ ...patientFilter, status: "SUCCEEDED" }, { kind: 1, amountCents: 1, createdAt: 1 }).setOptions(SYS).lean(),
    Invoice.find({ ...patientFilter, status: { $in: ["UNPAID", "PARTIAL", "IN_PAYMENT_PLAN"] } }, { amountDueCents: 1, amountPaidCents: 1, issuedAt: 1 }).setOptions(SYS).lean(),
    StaffProfile.find({}, { displayName: 1 }).lean(),
  ]);
  const submitted = claims.filter((c) => !["DRAFT", "READY_TO_SUBMIT", "VOID"].includes(c.status));
  const everDenied = submitted.filter((c) => c.statusHistory?.some((h) => h.status === "DENIED" || h.status === "REJECTED"));
  const paid = claims.filter((c) => c.status === "PAID" || c.status === "PARTIAL");
  const pending = claims.filter((c) => c.status === "SUBMITTED" || c.status === "ACCEPTED");
  const denied = claims.filter((c) => c.status === "DENIED" || c.status === "REJECTED");
  const sum = <T>(rows: T[], f: (r: T) => number | null | undefined) => rows.reduce((n, r) => n + (f(r) ?? 0), 0);

  const insuranceByMonth = bucket(paid, months, (c) => c.adjudicatedAt, (c) => c.insurancePaidCents ?? 0);
  const clientByMonth = bucket(payments, months, (p) => (p as { createdAt?: Date }).createdAt, (p) => (p.kind === "REFUND" ? -p.amountCents : p.amountCents));
  const revenueByMonth = months.map((m, i) => ({ key: m.key, label: m.label, insurance: insuranceByMonth[i].value, client: clientByMonth[i].value }));

  const name = new Map(staff.map((x) => [String(x._id), x.displayName]));
  const byProvider = new Map<string, { billed: number; paid: number; claims: number }>();
  for (const c of paid) {
    const k = name.get(String(c.providerId)) ?? "Unknown";
    const row = byProvider.get(k) ?? { billed: 0, paid: 0, claims: 0 };
    row.billed += c.totalBilledCents ?? 0;
    row.paid += c.insurancePaidCents ?? 0;
    row.claims += 1;
    byProvider.set(k, row);
  }
  const byCpt = new Map<string, { billed: number; paid: number; units: number }>();
  for (const c of paid) {
    for (const l of c.lines) {
      const row = byCpt.get(l.cptCode) ?? { billed: 0, paid: 0, units: 0 };
      row.billed += l.chargeCents * (l.units ?? 1);
      row.paid += l.paidCents ?? 0;
      row.units += l.units ?? 1;
      byCpt.set(l.cptCode, row);
    }
  }
  const year = Number(months.at(-1)!.key.slice(0, 4));
  const inYear = (d: Date | null | undefined, y: number) => Boolean(d) && new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, year: "numeric" }).format(d!) === String(y);
  const annual = [year, year - 1].map((y) => ({
    year: y,
    billedCents: sum(claims.filter((c) => inYear((c as { createdAt?: Date }).createdAt, y) && c.status !== "VOID"), (c) => c.totalBilledCents),
    insuranceCents: sum(paid.filter((c) => inYear(c.adjudicatedAt, y)), (c) => c.insurancePaidCents),
    contractualCents: sum(paid.filter((c) => inYear(c.adjudicatedAt, y)), (c) => c.contractualAdjustmentCents),
    clientCents: sum(payments.filter((p) => inYear((p as { createdAt?: Date }).createdAt, y)), (p) => (p.kind === "REFUND" ? -p.amountCents : p.amountCents)),
  }));

  const patientAR = sum(invoices, (i) => (i.amountDueCents ?? 0) - (i.amountPaidCents ?? 0));
  const insuranceAR = sum(pending, (c) => c.totalBilledCents);
  await recordAudit(ctx, { action: "VIEW", resourceType: "Analytics", metadata: { tab: "billing", scope: s.label } });
  return {
    scope: s.label,
    claims: {
      total: claims.length,
      submitted: submitted.length,
      paid: paid.length,
      pending: pending.length,
      denied: denied.length,
      draft: claims.filter((c) => c.status === "DRAFT" || c.status === "READY_TO_SUBMIT").length,
      paidRate: ratio(paid.length, submitted.length),
      firstPassDenialRate: ratio(everDenied.length, submitted.length),
      statusBreakdown: [
        { label: "Draft / ready", value: claims.filter((c) => c.status === "DRAFT" || c.status === "READY_TO_SUBMIT").length },
        { label: "Awaiting payer", value: pending.length },
        { label: "Denied / rejected", value: denied.length },
        { label: "Paid", value: paid.length },
      ],
    },
    ar: { insuranceCents: insuranceAR, patientCents: patientAR, totalCents: insuranceAR + patientAR },
    reimbursement: {
      billedCents: sum(paid, (c) => c.totalBilledCents),
      allowedCents: sum(paid, (c) => (c.totalBilledCents ?? 0) - (c.contractualAdjustmentCents ?? 0)),
      insurancePaidCents: sum(paid, (c) => c.insurancePaidCents),
      patientResponsibilityCents: sum(paid, (c) => c.patientResponsibilityCents),
      rate: ratio(sum(paid, (c) => c.insurancePaidCents), sum(paid, (c) => c.totalBilledCents)),
    },
    revenueByMonth,
    byProvider: [...byProvider.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.paid - a.paid),
    byCpt: [...byCpt.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.paid - a.paid),
    annual,
  };
}

// ── Operations ──────────────────────────────────────────────────────────────

function availableHours(schedule: { weeklyAvailability: { dayOfWeek: number; startTime: string; endTime: string }[] }, from: Date, to: Date) {
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let total = 0;
  for (let t = from.getTime(); t < to.getTime(); t += DAY) {
    const weekday = new Date(t).getUTCDay();
    for (const b of schedule.weeklyAvailability) if (b.dayOfWeek === weekday) total += (minutes(b.endTime) - minutes(b.startTime)) / 60;
  }
  return total;
}

export async function operationalAnalytics(ctx: AuthContext, now = new Date(), days = 30) {
  const s = await scope(ctx);
  const from = new Date(now.getTime() - days * DAY);
  const providerFilter = s.providerId ? { providerId: s.providerId } : {};
  const [schedules, staff, appointments, notes, surveys, referred] = await Promise.all([
    ProviderSchedule.find(s.providerId ? { providerId: s.providerId } : {}, { providerId: 1, weeklyAvailability: 1 }).lean(),
    StaffProfile.find({}, { displayName: 1 }).lean(),
    Appointment.find({ ...providerFilter, scheduledStart: { $gte: from, $lte: now } }, { providerId: 1, patientId: 1, status: 1, scheduledStart: 1, scheduledEnd: 1 }).setOptions(SYS).lean(),
    ClinicalNote.find({ ...providerFilter, noteType: { $ne: "PSYCHOTHERAPY" } }, { providerId: 1, appointmentId: 1, status: 1, createdAt: 1, "signature.signedAt": 1 }).setOptions(SYS).lean(),
    VisitSurvey.find({ ...providerFilter, submittedAt: { $gte: new Date(now.getTime() - 365 * DAY) } }, { providerId: 1, rating: 1, appointmentId: 1 }).setOptions(SYS).lean(),
    Patient.find({ ...(s.patientIds ? { _id: { $in: s.patientIds } } : {}), registeredAt: { $gte: new Date(now.getTime() - 365 * DAY) } }, { referralSource: 1 }).setOptions(SYS).lean(),
  ]);
  const name = new Map(staff.map((x) => [String(x._id), x.displayName]));
  const hours = (a: { scheduledStart: Date; scheduledEnd: Date }) => (a.scheduledEnd.getTime() - a.scheduledStart.getTime()) / 3_600_000;

  const providers = schedules.map((sch) => {
    const mine = appointments.filter((a) => String(a.providerId) === String(sch.providerId));
    const booked = mine.filter((a) => !["CANCELLED", "LATE_CANCELLED"].includes(a.status));
    const completed = mine.filter((a) => a.status === "COMPLETED");
    const available = availableHours(sch, from, now);
    return {
      label: name.get(String(sch.providerId)) ?? "Provider",
      availableHours: Math.round(available * 10) / 10,
      bookedHours: Math.round(booked.reduce((n, a) => n + hours(a), 0) * 10) / 10,
      billableHours: Math.round(completed.reduce((n, a) => n + hours(a), 0) * 10) / 10,
      encounters: completed.length,
      utilization: ratio(booked.reduce((n, a) => n + hours(a), 0), available),
    };
  });

  const completedAppts = appointments.filter((a) => a.status === "COMPLETED");
  const noteFor = new Map(notes.filter((n) => n.appointmentId).map((n) => [String(n.appointmentId), n]));
  const onTime = completedAppts.filter((a) => {
    const n = noteFor.get(String(a._id));
    return n?.signature?.signedAt && new Date(n.signature.signedAt).getTime() - a.scheduledEnd.getTime() <= 48 * 3_600_000;
  }).length;
  const overdue = notes.filter((n) => n.status !== "SIGNED_LOCKED" && (n as { createdAt?: Date }).createdAt && (n as { createdAt?: Date }).createdAt! < new Date(now.getTime() - 48 * 3_600_000));
  const overdueByProvider = new Map<string, number>();
  for (const n of overdue) overdueByProvider.set(name.get(String(n.providerId)) ?? "Provider", (overdueByProvider.get(name.get(String(n.providerId)) ?? "Provider") ?? 0) + 1);

  // Referral conversion: clients registered in the last year (by source) who completed a first visit.
  const completedEver = new Set(
    (await Appointment.find({ ...providerFilter, status: "COMPLETED", patientId: { $in: referred.map((p) => p._id) } }, { patientId: 1 }).setOptions(SYS).lean()).map((a) => String(a.patientId)),
  );
  const sources = [...REFERRAL_SOURCES, "UNKNOWN"].map((src) => {
    const group = referred.filter((p) => (p.referralSource ?? "UNKNOWN") === src);
    const converted = group.filter((p) => completedEver.has(String(p._id))).length;
    return { label: REFERRAL_LABELS[src], referred: group.length, converted, rate: ratio(converted, group.length) };
  }).filter((r) => r.referred > 0);

  const ratingByProvider = new Map<string, number[]>();
  for (const sv of surveys) {
    const k = name.get(String(sv.providerId)) ?? "Provider";
    ratingByProvider.set(k, [...(ratingByProvider.get(k) ?? []), sv.rating]);
  }
  const allCompleted365 = await Appointment.countDocuments({ ...providerFilter, status: "COMPLETED", scheduledStart: { $gte: new Date(now.getTime() - 365 * DAY), $lte: now } }).setOptions(SYS);

  await recordAudit(ctx, { action: "VIEW", resourceType: "Analytics", metadata: { tab: "operations", scope: s.label } });
  return {
    scope: s.label,
    days,
    providers,
    documentation: {
      completedVisits: completedAppts.length,
      signedWithin48h: onTime,
      rate: ratio(onTime, completedAppts.length),
      overdueCount: overdue.length,
      overdueByProvider: [...overdueByProvider.entries()].map(([label, value]) => ({ label, value })),
    },
    referrals: {
      total: referred.length,
      converted: sources.reduce((n, r) => n + r.converted, 0),
      rate: ratio(sources.reduce((n, r) => n + r.converted, 0), referred.length),
      bySource: sources,
    },
    satisfaction: {
      responses: surveys.length,
      average: surveys.length ? surveys.reduce((n, sv) => n + sv.rating, 0) / surveys.length : null,
      responseRate: ratio(surveys.length, allCompleted365),
      byProvider: [...ratingByProvider.entries()].map(([label, r]) => ({ label, average: r.reduce((a, b) => a + b, 0) / r.length, responses: r.length })),
      distribution: [5, 4, 3, 2, 1].map((star) => ({ label: `${star} star${star === 1 ? "" : "s"}`, value: surveys.filter((sv) => sv.rating === star).length })),
    },
  };
}

export type PatientAnalytics = Awaited<ReturnType<typeof patientAnalytics>>;
export type BillingAnalytics = Awaited<ReturnType<typeof billingAnalytics>>;
export type OperationalAnalytics = Awaited<ReturnType<typeof operationalAnalytics>>;

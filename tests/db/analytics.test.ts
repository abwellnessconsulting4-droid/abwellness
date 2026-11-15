import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuditedDenial } from "@/lib/audit";
import { billingAnalytics, lastMonths, operationalAnalytics, patientAnalytics } from "@/lib/services/analytics";
import { submitSurvey, SurveyError, visitsToRate } from "@/lib/services/surveys";
import { IDS } from "@/scripts/seed/emr";
import { EMAIL, setupSeededDatabase } from "./seeded";

const { as } = setupSeededDatabase("analytics");
const NOW = new Date("2026-11-15T17:00:00Z");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());

describe("months", () => {
  it("builds 12 calendar months ending with the current one", () => {
    const m = lastMonths(NOW);
    expect(m).toHaveLength(12);
    expect(m.at(-1)!.key).toBe("2026-11");
    expect(m[0].key).toBe("2025-12");
  });
});

describe("access", () => {
  it("is limited to admins, billing, and providers (their own caseload)", async () => {
    await expect(patientAnalytics(await as(EMAIL.frontDesk), NOW)).rejects.toBeInstanceOf(AuditedDenial);
    await expect(billingAnalytics(await as("elena.vance@example.com"), NOW)).rejects.toBeInstanceOf(AuditedDenial);
    expect((await patientAnalytics(await as(EMAIL.admin), NOW)).totals.registered).toBe(3);
    expect((await patientAnalytics(await as(EMAIL.thorne), NOW)).totals.registered).toBe(2);
    expect((await patientAnalytics(await as(EMAIL.ellis), NOW)).totals.registered).toBe(1);
  });
});

describe("patient analytics", () => {
  it("counts registrations month over month, demographics, and payers", async () => {
    const p = await patientAnalytics(await as(EMAIL.admin), NOW);
    expect(p.totals).toMatchObject({ registered: 3, active: 3, inactive: 0, newThisMonth: 2, newLastMonth: 1, momChange: 1 });
    expect(p.registrations.at(-1)).toMatchObject({ key: "2026-11", value: 2 });
    expect(p.demographics.payer).toEqual(expect.arrayContaining([{ label: "BlueCross BlueShield of NY", value: 1 }, { label: "Aetna Health", value: 1 }, { label: "Self-pay", value: 1 }]));
    expect(p.demographics.age.reduce((n, a) => n + a.value, 0)).toBe(3);
    expect(p.rates.noShow).toBe(0);
    expect(p.rates.portalCounts.withAccount).toBe(3);
  });
});

describe("billing analytics", () => {
  it("reports claim rates, A/R, reimbursement, and revenue from the seeded claims", async () => {
    const b = await billingAnalytics(await as(EMAIL.billing), NOW);
    expect(b.claims).toMatchObject({ submitted: 2, paid: 1, denied: 1, pending: 0, paidRate: 0.5, firstPassDenialRate: 1 }); // Elena's was denied (CO-4) before it paid
    expect(b.ar).toMatchObject({ insuranceCents: 0, patientCents: 36500, totalCents: 36500 });
    expect(b.reimbursement).toMatchObject({ billedCents: 21000, allowedCents: 17500, insurancePaidCents: 12500, patientResponsibilityCents: 5000 });
    expect(b.revenueByMonth.at(-1)).toMatchObject({ key: "2026-11", insurance: 12500, client: 0 });
    expect(b.byCpt).toEqual([{ label: "90791", billed: 21000, paid: 12500, units: 1 }]);
    expect(b.annual[0]).toMatchObject({ year: 2026, insuranceCents: 12500, contractualCents: 3500 });
  });
});

describe("operational analytics", () => {
  it("measures utilization, documentation, referral conversion, and satisfaction", async () => {
    const o = await operationalAnalytics(await as(EMAIL.admin), NOW);
    const thorne = o.providers.find((p) => p.label.startsWith("Dr. Aris Thorne"))!;
    expect(thorne.encounters).toBe(2);
    expect(thorne.availableHours).toBeGreaterThan(0);
    expect(thorne.utilization).toBeGreaterThan(0);
    expect(o.documentation.completedVisits).toBe(2);
    expect(o.referrals).toMatchObject({ total: 3, converted: 2 });
    expect(o.referrals.bySource.map((s) => s.label).sort()).toEqual(["Community partner", "Insurance directory", "Provider referral"]);
    expect(o.satisfaction).toMatchObject({ responses: 1, average: 5 });
  });
});

describe("post-visit surveys", () => {
  it("lets a client rate their own completed visit once, within 30 days", async () => {
    const david = await as("david.morales@example.com");
    expect(await visitsToRate(david, NOW)).toEqual([String(IDS.appointments.davidEarlier)]);
    await expect(submitSurvey(david, { appointmentId: String(IDS.appointments.davidEarlier), rating: 6 }, NOW)).rejects.toBeInstanceOf(SurveyError);
    await submitSurvey(david, { appointmentId: String(IDS.appointments.davidEarlier), rating: 4, comment: "Helpful session." }, NOW);
    await expect(submitSurvey(david, { appointmentId: String(IDS.appointments.davidEarlier), rating: 5 }, NOW)).rejects.toThrow(/already rated/);
    await expect(submitSurvey(await as("elena.vance@example.com"), { appointmentId: String(IDS.appointments.davidEarlier), rating: 1 }, NOW)).rejects.toThrow(/not found/);
    expect(await visitsToRate(david, NOW)).toEqual([]);
    const o = await operationalAnalytics(await as(EMAIL.thorne), NOW);
    expect(o.satisfaction).toMatchObject({ responses: 2, average: 4.5 });
  });
});

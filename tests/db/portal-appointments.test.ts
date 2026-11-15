import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { systemToken } from "@/lib/db/phi-guard";
import { bookingOptions, bookMine, cancellationPreview, cancelMine, joinVideo, myAppointments, myVisit, weekSlots } from "@/lib/services/portal-appointments";
import { SchedulingError } from "@/lib/services/scheduling";
import { formatTime } from "@/lib/tz";
import { IDS } from "@/scripts/seed/emr";
import { Appointment, Invoice, TelehealthSession } from "@/models";
import { setupSeededDatabase } from "./seeded";

const { as } = setupSeededDatabase("portal-appointments");
const SYS = { authz: systemToken("test") };
const ELENA = "elena.vance@example.com";
const SOFIA = "sofia.lin@example.com";
const DAVID = "david.morales@example.com";
const thorne = String(IDS.staff.thorne);
const ellis = String(IDS.staff.ellis);
const at = (iso: string) => vi.setSystemTime(new Date(iso));
let booked = "";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-11-16T15:00:00Z"); // Monday 10:00 ET
});
afterAll(() => vi.useRealTimers());

describe("my appointments", () => {
  it("splits Elena's visits into upcoming and past", async () => {
    const { upcoming, past } = await myAppointments(await as(ELENA));
    expect(upcoming.map((a) => [a.visit, a.mode, a.join])).toEqual([["Session (45 min)", "VIRTUAL", "not-yet"]]);
    expect(past.some((a) => a.visit === "Initial evaluation" && a.status === "COMPLETED")).toBe(true);
    expect(upcoming[0].provider).toBe("Dr. Aris Thorne, PsyD");
  });
});

describe("self-booking", () => {
  it("offers only the client's own provider and patient-bookable visit types", async () => {
    const elena = await bookingOptions(await as(ELENA));
    expect(elena.providers.map((p) => p.id)).toEqual([thorne]);
    expect(elena.providers[0].visitTypes.map((v) => v.key)).toEqual(["therapy-45", "therapy-60"]);
    expect(elena.telehealthConsent).toBe(true);
    const sofia = await bookingOptions(await as(SOFIA));
    expect(sofia.providers.map((p) => p.id)).toEqual([ellis]);
    expect(sofia.telehealthConsent).toBe(false);
  });

  it("lists a week of open times and refuses other providers", async () => {
    const elena = await as(ELENA);
    const week = await weekSlots(elena, { providerId: thorne, visitType: "therapy-45", mode: "VIRTUAL", from: "2026-11-18" });
    const wednesday = week.days.find((d) => d.date === "2026-11-18")!;
    expect(formatTime(wednesday.slots[0])).toBe("10:00 AM");
    expect(week.days.find((d) => d.date === "2026-11-20")!.slots).toEqual([]); // Fridays are in-person only
    await expect(weekSlots(elena, { providerId: ellis, visitType: "housing-consult", mode: "VIRTUAL" })).rejects.toBeInstanceOf(SchedulingError);
  });

  it("books a video session, but not office-only visits or video without telehealth consent", async () => {
    const elena = await as(ELENA);
    booked = await bookMine(elena, { providerId: thorne, visitType: "therapy-45", mode: "VIRTUAL", start: "2026-11-18T16:00:00.000Z" });
    expect(await TelehealthSession.exists({ appointmentId: booked }).setOptions(SYS)).toBeTruthy();
    await expect(bookMine(elena, { providerId: thorne, visitType: "initial-evaluation", mode: "VIRTUAL", start: "2026-11-18T18:00:00.000Z" })).rejects.toBeInstanceOf(SchedulingError);

    const sofia = await as(SOFIA);
    await expect(bookMine(sofia, { providerId: ellis, visitType: "housing-consult", mode: "VIRTUAL", start: "2026-11-17T14:00:00.000Z" })).rejects.toThrow(/telehealth consent/);
    expect(await bookMine(sofia, { providerId: ellis, visitType: "housing-consult", mode: "IN_PERSON", start: "2026-11-17T14:00:00.000Z" })).toBeTruthy();
  });
});

describe("cancelling under the signed policy", () => {
  it("shows no fee with plenty of notice, and the $75 fee inside 24 hours", async () => {
    const elena = await as(ELENA);
    expect(await cancellationPreview(elena, booked)).toMatchObject({ late: false, feeCents: 0, cancellable: true, policyHours: 24 });
    at("2026-11-18T10:00:00Z"); // 6 hours before
    expect(await cancellationPreview(elena, booked)).toMatchObject({ late: true, feeCents: 7500, hoursNotice: 6 });
    await expect(cancellationPreview(await as(DAVID), booked)).rejects.toBeInstanceOf(SchedulingError);

    const result = await cancelMine(elena, booked, "Work conflict");
    expect(result.status).toBe("LATE_CANCELLED");
    expect(result.matches).toEqual([]); // waitlist details are staff-only
    expect((await Invoice.findById(result.feeInvoiceId).setOptions(SYS).lean())?.amountDueCents).toBe(7500);
    await expect(cancelMine(elena, booked, "again")).rejects.toBeInstanceOf(SchedulingError);
  });
});

describe("joining a video visit", () => {
  const followUp = String(IDS.appointments.elenaFollowUp); // Wed 11/25, 10:00 ET

  it("opens the waiting room 15 minutes early and checks the client in", async () => {
    const elena = await as(ELENA);
    at("2026-11-25T14:30:00Z");
    await expect(joinVideo(elena, followUp)).rejects.toThrow(/opens 15 minutes/);
    at("2026-11-25T14:50:00Z");
    await joinVideo(elena, followUp);
    await joinVideo(elena, followUp); // re-entering is fine
    expect((await Appointment.findById(followUp).setOptions(SYS).lean())?.status).toBe("CHECKED_IN");
    expect(await myVisit(elena, followUp)).toMatchObject({ status: "IN_WAITING_ROOM", join: "open", provider: "Dr. Aris Thorne, PsyD" });
    await expect(joinVideo(await as(DAVID), followUp)).rejects.toBeInstanceOf(SchedulingError);
  });
});

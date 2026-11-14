import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuditedDenial } from "@/lib/audit";
import { systemToken } from "@/lib/db/phi-guard";
import { availableSlots, bookAppointment, bookFromWaitlist, cancelAppointment, checkIn, markNoShow, SchedulingError } from "@/lib/services/scheduling";
import { formatTime } from "@/lib/tz";
import { IDS } from "@/scripts/seed/emr";
import { Appointment, AppointmentSlot, Invoice, TelehealthSession, WaitlistEntry } from "@/models";
import { EMAIL, setupSeededDatabase } from "./seeded";

const { as } = setupSeededDatabase("scheduling");
const SYS = { authz: systemToken("test") };
const thorne = String(IDS.staff.thorne);
const david = String(IDS.patients.david);
const sofia = String(IDS.patients.sofia);
const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-11-14T15:00:00Z");
});
afterAll(() => vi.useRealTimers());

describe("availability", () => {
  it("skips Elena's 10:00 video visit and the 10-minute buffer after it", async () => {
    const slots = await availableSlots({ providerId: thorne, date: "2026-11-25", visitType: "therapy-45", mode: "VIRTUAL" });
    const times = slots.map((s) => formatTime(s));
    expect(times[0]).toBe("11:00 AM");
    expect(times).not.toContain("10:00 AM");
    expect(times).not.toContain("10:45 AM");
    expect(times.at(-1)).toBe("5:15 PM"); // last 45-minute start before 6 PM
  });

  it("respects the day's format (Wednesdays are video-only, Fridays in-person)", async () => {
    expect(await availableSlots({ providerId: thorne, date: "2026-11-25", visitType: "therapy-45", mode: "IN_PERSON" })).toEqual([]);
    const friday = await availableSlots({ providerId: thorne, date: "2026-11-20", visitType: "therapy-45", mode: "IN_PERSON" });
    expect(formatTime(friday[0])).toBe("9:00 AM");
  });
});

describe("booking", () => {
  const slot = { providerId: thorne, visitType: "therapy-45", mode: "IN_PERSON" as const, start: "2026-11-20T14:00:00.000Z" }; // Fri 9:00 ET

  it("lets two people race for the same slot and only one wins", async () => {
    const fd = await as(EMAIL.frontDesk);
    const results = await Promise.allSettled([bookAppointment(fd, { ...slot, patientId: david }), bookAppointment(fd, { ...slot, patientId: david })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(SchedulingError);
    const booked = await Appointment.findOne({ patientId: david, scheduledStart: new Date(slot.start) }).setOptions(SYS).lean();
    expect(booked?.status).toBe("SCHEDULED");
    expect(await AppointmentSlot.countDocuments({ appointmentId: booked!._id })).toBe(3);
  });

  it("won't let a client book for someone else", async () => {
    const elena = await as(EMAIL.elena);
    await expect(bookAppointment(elena, { ...slot, start: "2026-11-20T16:00:00.000Z", patientId: david })).rejects.toBeInstanceOf(AuditedDenial);
  });
});

describe("Use Case 5: late cancellation and the waitlist", () => {
  it("charges the signed $75 fee for 6 hours' notice and offers the slot to Sofia", async () => {
    const appt = await Appointment.findOne({ patientId: david, scheduledStart: new Date("2026-11-20T14:00:00Z") }).setOptions(SYS).lean();
    at("2026-11-20T08:00:00Z"); // 6 hours before
    const result = await cancelAppointment(await as(EMAIL.frontDesk), String(appt!._id), { reason: "Work conflict" });
    expect(result).toMatchObject({ status: "LATE_CANCELLED", hoursNotice: 6 });
    const fee = await Invoice.findById(result.feeInvoiceId).setOptions(SYS).lean();
    expect(fee).toMatchObject({ kind: "LATE_CANCELLATION", amountDueCents: 7500, status: "UNPAID", publishedToPortal: true });
    expect(await AppointmentSlot.countDocuments({ appointmentId: appt!._id })).toBe(0);
    expect(result.matches.map((m) => m.patientName)).toEqual(["Sofia Lin"]);

    const booked = await bookFromWaitlist(await as(EMAIL.frontDesk), result.matches[0].id, result.freedSlot as never);
    const sofiaAppt = await Appointment.findById(booked).setOptions(SYS).lean();
    expect(sofiaAppt).toMatchObject({ status: "SCHEDULED", mode: "IN_PERSON" });
    expect(String(sofiaAppt?.patientId)).toBe(sofia);
    expect((await WaitlistEntry.findOne({ patientId: sofia }).setOptions(SYS).lean())?.status).toBe("BOOKED");
  });

  it("is free with more than 24 hours' notice", async () => {
    at("2026-11-16T15:00:00Z");
    const fd = await as(EMAIL.frontDesk);
    const id = await bookAppointment(fd, { patientId: david, providerId: thorne, visitType: "therapy-45", mode: "IN_PERSON", start: "2026-11-20T17:00:00.000Z" });
    const result = await cancelAppointment(fd, id, { reason: "Rescheduling" });
    expect(result.status).toBe("CANCELLED");
    expect(result.feeInvoiceId).toBeUndefined();
  });

  it("lets staff (not clients) waive a late fee with a reason", async () => {
    at("2026-11-16T15:00:00Z");
    const fd = await as(EMAIL.frontDesk);
    const id = await bookAppointment(fd, { patientId: david, providerId: thorne, visitType: "therapy-45", mode: "IN_PERSON", start: "2026-11-20T18:00:00.000Z" });
    at("2026-11-20T15:00:00Z");
    await expect(cancelAppointment(await as(EMAIL.elena), id, { reason: "x", waiveFee: true })).rejects.toBeInstanceOf(AuditedDenial);
    const result = await cancelAppointment(fd, id, { reason: "Family emergency", waiveFee: true });
    expect(result.status).toBe("LATE_CANCELLED");
    expect(result.feeInvoiceId).toBeUndefined();
    expect((await Appointment.findById(id).setOptions(SYS).lean())?.cancellation?.feeWaived).toBe(true);
  });
});

describe("check-in and no-shows", () => {
  it("checking in a video visit puts the client in the waiting room", async () => {
    at("2026-11-25T14:50:00Z");
    await checkIn(await as(EMAIL.frontDesk), String(IDS.appointments.elenaFollowUp));
    const session = await TelehealthSession.findOne({ appointmentId: IDS.appointments.elenaFollowUp }).setOptions(SYS).lean();
    expect(session?.status).toBe("IN_WAITING_ROOM");
  });

  it("a no-show is charged per the signed policy, but only after the start time", async () => {
    at("2026-11-16T15:00:00Z");
    const fd = await as(EMAIL.frontDesk);
    const id = await bookAppointment(fd, { patientId: david, providerId: thorne, visitType: "therapy-45", mode: "IN_PERSON", start: "2026-11-27T15:00:00.000Z" });
    await expect(markNoShow(fd, id)).rejects.toBeInstanceOf(SchedulingError);
    at("2026-11-27T15:30:00Z");
    const { feeInvoiceId } = await markNoShow(fd, id);
    expect((await Invoice.findById(feeInvoiceId).setOptions(SYS).lean())?.amountDueCents).toBe(7500);
  });
});

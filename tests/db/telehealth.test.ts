import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuditedDenial } from "@/lib/audit";
import { systemToken } from "@/lib/db/phi-guard";
import { updateDraft } from "@/lib/services/notes";
import { checkIn } from "@/lib/services/scheduling";
import { admit, endVisit, getVisit, startVisitNote, TelehealthError, waitingRoom } from "@/lib/services/telehealth";
import { timeBasedCodeWarning } from "@/lib/telehealth";
import { IDS } from "@/scripts/seed/emr";
import { Appointment, AuditLog, ClinicalNote, TelehealthSession } from "@/models";
import { EMAIL, setupSeededDatabase } from "./seeded";

const { as } = setupSeededDatabase("telehealth");
const SYS = { authz: systemToken("test") };
const visitDay = "2026-11-25"; // Elena's 10:00 ET video follow-up with Dr. Thorne
const at = (iso: string) => vi.setSystemTime(new Date(iso));
let sessionId = "";

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-11-25T14:50:00Z");
  await checkIn(await as(EMAIL.frontDesk), String(IDS.appointments.elenaFollowUp));
  const session = await TelehealthSession.findOne({ appointmentId: IDS.appointments.elenaFollowUp }).setOptions(SYS).lean();
  sessionId = String(session!._id);
});
afterAll(() => vi.useRealTimers());

describe("waiting room", () => {
  it("shows Dr. Thorne his checked-in client, and front desk sees every provider's visits", async () => {
    const mine = await waitingRoom(await as(EMAIL.thorne), visitDay);
    expect(mine.map((v) => [v.patient, v.status])).toEqual([["Elena Vance", "IN_WAITING_ROOM"]]);
    expect((await waitingRoom(await as(EMAIL.frontDesk), visitDay)).map((v) => v.sessionId)).toContain(sessionId);
  });

  it("hides other providers' visits and refuses roles without telehealth access", async () => {
    expect(await waitingRoom(await as(EMAIL.ellis), visitDay)).toEqual([]);
    await expect(waitingRoom(await as(EMAIL.billing), visitDay)).rejects.toBeInstanceOf(AuditedDenial);
    await expect(getVisit(await as(EMAIL.ellis), sessionId)).rejects.toBeInstanceOf(AuditedDenial);
  });
});

describe("a video visit from admission to a timed note", () => {
  it("only the visit's provider can admit", async () => {
    await expect(admit(await as(EMAIL.frontDesk), sessionId)).rejects.toBeInstanceOf(TelehealthError);
    await expect(endVisit(await as(EMAIL.thorne), sessionId)).rejects.toBeInstanceOf(TelehealthError); // not started yet
  });

  it("records start, end, and duration, completes the appointment, and times the note", async () => {
    const thorne = await as(EMAIL.thorne);
    const noteId = await startVisitNote(thorne, sessionId);
    expect(await startVisitNote(thorne, sessionId)).toBe(noteId); // idempotent
    await updateDraft(thorne, noteId, { sections: { subjective: "Reports better sleep." }, diagnosisCodes: [], serviceLines: [{ cptCode: "90837", modifiers: [], units: 1 }] });

    at("2026-11-25T15:01:00Z");
    await admit(thorne, sessionId);
    expect((await Appointment.findById(IDS.appointments.elenaFollowUp).setOptions(SYS).lean())?.status).toBe("IN_SESSION");

    at("2026-11-25T15:46:30Z");
    expect(await endVisit(thorne, sessionId)).toEqual({ minutes: 46 });

    const session = await TelehealthSession.findById(sessionId).setOptions(SYS).lean();
    expect(session).toMatchObject({ status: "COMPLETED", durationSeconds: 45 * 60 + 30 });
    expect(session?.events.map((e) => e.type)).toEqual(expect.arrayContaining(["ADMITTED", "ENDED"]));
    expect((await Appointment.findById(IDS.appointments.elenaFollowUp).setOptions(SYS).lean())?.status).toBe("COMPLETED");
    const note = await ClinicalNote.findById(noteId).setOptions(SYS).lean();
    expect(note?.sessionMinutes).toBe(46);
    expect(note?.serviceLines[0].minutes).toBe(46);

    // 90837 needs 53+ minutes: the visit screen flags it before signing.
    const visit = await getVisit(thorne, sessionId);
    expect(visit.minutes).toBe(46);
    expect(visit.codeWarnings).toHaveLength(1);
    expect(visit.codeWarnings[0]).toContain("90834 fits");

    await expect(endVisit(thorne, sessionId)).rejects.toBeInstanceOf(TelehealthError);
    expect(await AuditLog.countDocuments({ resourceType: "TelehealthSession", resourceId: sessionId, action: "UPDATE" }).setOptions(SYS)).toBe(2);
  });
});

describe("time-based psychotherapy codes", () => {
  it("accepts lengths in range and suggests the right code otherwise", () => {
    expect(timeBasedCodeWarning("90834", 45)).toBeNull();
    expect(timeBasedCodeWarning("90837", 60)).toBeNull();
    expect(timeBasedCodeWarning("90834", 30)).toContain("90832 fits");
    expect(timeBasedCodeWarning("90832", 10)).toContain("under 16 minutes");
    expect(timeBasedCodeWarning("99213", 5)).toBeNull(); // not time-based here
  });
});

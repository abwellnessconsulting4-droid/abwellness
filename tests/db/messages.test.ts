import { describe, expect, it, vi } from "vitest";
import { AuditedDenial } from "@/lib/audit";
import { isEncrypted } from "@/lib/crypto";
import { systemToken } from "@/lib/db/phi-guard";
import { closeThread, getThread, listThreads, MessageError, reply, startThread, unreadCount } from "@/lib/services/messages";
import { SecureMessage } from "@/models";
import { EMAIL, setupSeededDatabase } from "./seeded";

const { as } = setupSeededDatabase("messages");
const SYS = { authz: systemToken("test") };
const ELENA = "elena.vance@example.com";
const DAVID = "david.morales@example.com";

function captureEmails() {
  const spy = vi.spyOn(console, "info").mockImplementation(() => {});
  return {
    to: () => spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("email]")).map((m) => m.match(/to=(\S+)/)?.[1]),
    bodies: () => spy.mock.calls.map((c) => String(c[0])).join("\n"),
    restore: () => spy.mockRestore(),
  };
}

describe("who sees what", () => {
  it("shows Elena her seeded threads, and routes them by topic for staff", async () => {
    const mine = await listThreads(await as(ELENA));
    expect(mine.map((t) => t.category).sort()).toEqual(["BILLING", "CLINICAL"]);
    expect(mine.find((t) => t.category === "CLINICAL")?.unread).toBe(false); // she read Dr. Thorne's reply

    const categories = async (email: string) => (await listThreads(await as(email))).map((t) => t.category).sort();
    expect(await categories(EMAIL.thorne)).toEqual(["BILLING", "CLINICAL"]); // her provider sees all her threads
    expect(await categories(EMAIL.frontDesk)).toEqual(["BILLING"]); // never clinical
    expect(await categories(EMAIL.billing)).toEqual(["BILLING"]);
    expect(await categories(EMAIL.ellis)).toEqual([]); // not her provider
    expect(await listThreads(await as(DAVID))).toEqual([]);
  });

  it("blocks opening a thread outside your role, and admins can read but not reply", async () => {
    const clinical = (await listThreads(await as(ELENA))).find((t) => t.category === "CLINICAL")!;
    await expect(getThread(await as(EMAIL.frontDesk), clinical.id)).rejects.toBeInstanceOf(AuditedDenial);
    await expect(getThread(await as(EMAIL.billing), clinical.id)).rejects.toBeInstanceOf(AuditedDenial);
    await expect(getThread(await as(DAVID), clinical.id)).rejects.toBeInstanceOf(AuditedDenial);
    const admin = await as(EMAIL.admin);
    const thread = await getThread(admin, clinical.id);
    expect(thread.messages.map((m) => m.sender)).toEqual(["Elena Vance", "Dr. Aris Thorne, PsyD"]);
    expect(thread.canReply).toBe(false);
    await expect(reply(admin, clinical.id, "hello")).rejects.toBeInstanceOf(MessageError);
  });
});

describe("conversations", () => {
  it("a clinical question notifies the provider (no contents), and his reply notifies Elena", async () => {
    const emails = captureEmails();
    const elena = await as(ELENA);
    const id = await startThread(elena, { topic: "CLINICAL", subject: "Sleep this week", body: "I slept 7 hours most nights after the evening exercises." });
    const thorne = await as(EMAIL.thorne);
    expect((await listThreads(thorne, { unreadOnly: true })).map((t) => t.id)).toContain(id);
    expect(await unreadCount(thorne)).toBeGreaterThanOrEqual(1);

    await reply(thorne, id, "That's great progress. Let's keep the same routine.");
    expect(emails.to()).toEqual(["aris.thorne@example.com", "elena.vance@example.com"]);
    expect(emails.bodies()).not.toMatch(/Sleep this week|7 hours|great progress/);
    emails.restore();

    expect((await listThreads(elena)).find((t) => t.id === id)?.unread).toBe(true);
    const thread = await getThread(elena, id);
    expect(thread.messages.map((m) => [m.fromClient, m.mine])).toEqual([[true, true], [false, false]]);
    expect((await listThreads(elena)).find((t) => t.id === id)?.unread).toBe(false); // opening marks it read
    expect((await listThreads(thorne, { unreadOnly: true })).some((t) => t.id === id)).toBe(false);

    const stored = await SecureMessage.find({ threadId: id }).select("+bodyEnc").setOptions(SYS).lean();
    expect(stored.every((m) => isEncrypted(m.bodyEnc))).toBe(true);
  });

  it("front desk handles scheduling and can close a resolved conversation", async () => {
    const elena = await as(ELENA);
    const id = await startThread(elena, { topic: "SCHEDULING", subject: "Moving my visit", body: "Can I move next Wednesday's session to the afternoon?" });
    const frontDesk = await as(EMAIL.frontDesk);
    expect((await listThreads(frontDesk, { unreadOnly: true })).map((t) => t.id)).toContain(id);
    const emails = captureEmails();
    await reply(frontDesk, id, "Yes: 2:00 PM is open. I've moved it for you.");
    emails.restore();
    await closeThread(frontDesk, id);
    await expect(reply(elena, id, "Thanks!")).rejects.toThrow(/closed/);
    await expect(closeThread(elena, id)).rejects.toBeInstanceOf(MessageError);
  });

  it("billing staff answer billing questions; staff can start a thread with a client", async () => {
    const marcus = await as(EMAIL.billing);
    const billing = (await listThreads(marcus)).find((t) => t.category === "BILLING")!;
    const emails = captureEmails();
    await reply(marcus, billing.id, "Your $50 balance is the copay and deductible from your 11/11 visit.");
    const id = await startThread(await as(EMAIL.thorne), { patientId: billing.patientId, topic: "CLINICAL", subject: "Before our next session", body: "Please complete the GAD-7 in the portal before Wednesday." });
    emails.restore();
    expect((await listThreads(await as(ELENA), { unreadOnly: true })).map((t) => t.id)).toEqual(expect.arrayContaining([billing.id, id]));
    await expect(startThread(marcus, { patientId: billing.patientId, topic: "CLINICAL", subject: "x y z", body: "Not allowed" })).rejects.toBeInstanceOf(AuditedDenial);
  });

  it("validates subjects and bodies", async () => {
    const elena = await as(ELENA);
    await expect(startThread(elena, { topic: "GENERAL", subject: "", body: "Hello there" })).rejects.toThrow(/subject/);
    await expect(startThread(elena, { topic: "GENERAL", subject: "Hello", body: " " })).rejects.toThrow(/Write a message/);
    await expect(startThread(elena, { topic: "NOPE", subject: "Hello", body: "Hi" })).rejects.toThrow(/topic/);
  });
});

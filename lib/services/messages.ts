import "server-only";

import { Types } from "mongoose";
import { recordAudit } from "@/lib/audit";
import { authorize, authorizeAny, authzToken, withScope, type AuthContext } from "@/lib/authz";
import { authorizeDoc, createScoped, systemToken } from "@/lib/db/phi-guard";
import { decrypt, ENC, encrypt } from "@/lib/crypto";
import { sendNewMessageNotice } from "@/lib/email/messages";
import { isStaff } from "@/lib/rbac";
import { MessageThread, Patient, SecureMessage, StaffProfile } from "@/models";

/**
 * Secure messaging between clients and their care team. Bodies are encrypted
 * (ENC.messageBody); subjects must stay free of clinical detail. Who can see a
 * thread comes from RBAC (lib/authz.ts), not the participant list:
 *   CLINICAL: the client's assigned provider (and admins, read-only)
 *   SCHEDULING / GENERAL: front desk and the provider
 *   BILLING: billing staff and front desk
 * Email notices say only "you have a new message".
 */

const LOOKUP = systemToken("messages");
export class MessageError extends Error {}

export const TOPICS = {
  CLINICAL: { label: "A question for my provider", staffLabel: "Clinical" },
  SCHEDULING: { label: "Scheduling", staffLabel: "Scheduling" },
  BILLING: { label: "Billing or insurance", staffLabel: "Billing" },
  GENERAL: { label: "Something else", staffLabel: "General" },
} as const;
export type Topic = keyof typeof TOPICS;
const MAX_BODY = 5000;

function cleanBody(body: string) {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (text.length < 2) throw new MessageError("Write a message first.");
  if (text.length > MAX_BODY) throw new MessageError(`Messages can be up to ${MAX_BODY} characters.`);
  return text;
}

async function patientInfo(patientId: string | Types.ObjectId) {
  const patient = await Patient.findById(patientId, { firstName: 1, lastName: 1, preferredName: 1, assignedProviderId: 1, email: 1, userId: 1 }).setOptions({ authz: LOOKUP }).lean();
  if (!patient) throw new MessageError("Client not found.");
  return patient;
}

async function loadThread(ctx: AuthContext, threadId: string, action: "read" | "create") {
  if (!Types.ObjectId.isValid(threadId)) throw new MessageError("Conversation not found.");
  const thread = await MessageThread.findById(threadId).setOptions({ authz: LOOKUP });
  if (!thread) throw new MessageError("Conversation not found.");
  const patient = await patientInfo(thread.patientId);
  await authorize(ctx, "message", action, { resourceId: threadId, patientId: thread.patientId, assignedProviderId: patient.assignedProviderId ?? null, messageCategory: thread.category });
  return { thread, patient };
}

function unreadFor(thread: { participants?: { userId?: unknown; lastReadAt?: Date | null }[]; lastMessageAt?: Date | null; lastSenderRole?: string }, ctx: AuthContext) {
  if (!thread.lastMessageAt) return false;
  const me = thread.participants?.find((p) => String(p.userId) === ctx.userId);
  return !me?.lastReadAt || me.lastReadAt < thread.lastMessageAt;
}

/** Inbox: the client's own threads, or every thread staff may see. */
export async function listThreads(ctx: AuthContext, filter: { patientId?: string; unreadOnly?: boolean } = {}) {
  await authorizeAny(ctx, "message", "read");
  const query: Record<string, unknown> = {};
  if (filter.patientId && Types.ObjectId.isValid(filter.patientId)) query.patientId = new Types.ObjectId(filter.patientId);
  const threads = await MessageThread.find(await withScope(ctx, "message", query))
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .limit(200)
    .setOptions({ authz: authzToken(ctx) })
    .lean();
  // Who sent the latest message (for "awaiting reply").
  const latest = await SecureMessage.aggregate<{ _id: Types.ObjectId; senderRole: string }>([
    { $match: { threadId: { $in: threads.map((t) => t._id) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$threadId", senderRole: { $first: "$senderRole" } } },
  ]).option({ authz: LOOKUP });
  const lastRole = new Map(latest.map((l) => [String(l._id), l.senderRole]));
  const patients = await Patient.find({ _id: { $in: threads.map((t) => t.patientId) } }, { firstName: 1, lastName: 1 }).setOptions({ authz: LOOKUP }).lean();
  const name = new Map(patients.map((p) => [String(p._id), `${p.firstName} ${p.lastName}`]));
  await recordAudit(ctx, { action: "VIEW", resourceType: "MessageInbox", patientId: ctx.role === "PATIENT" ? ctx.patientId : filter.patientId, metadata: { results: threads.length } });
  const rows = threads.map((t) => {
    const lastSenderRole = lastRole.get(String(t._id));
    return {
      id: String(t._id),
      subject: t.subject,
      category: t.category as Topic,
      patient: name.get(String(t.patientId)) ?? "Client",
      patientId: String(t.patientId),
      lastMessageAt: t.lastMessageAt ?? undefined,
      unread: unreadFor(t, ctx) && (ctx.role === "PATIENT" ? lastSenderRole !== "PATIENT" : lastSenderRole === "PATIENT"),
      awaitingReply: lastSenderRole === "PATIENT",
      closed: Boolean(t.closedAt),
    };
  });
  return filter.unreadOnly ? rows.filter((r) => r.unread) : rows;
}

export async function unreadCount(ctx: AuthContext) {
  return (await listThreads(ctx)).filter((t) => t.unread).length;
}

/** One conversation; viewing marks it read for the viewer. */
export async function getThread(ctx: AuthContext, threadId: string) {
  const { thread, patient } = await loadThread(ctx, threadId, "read");
  const messages = await SecureMessage.find({ threadId: thread._id }).select("+bodyEnc").sort({ createdAt: 1 }).setOptions({ authz: LOOKUP }).lean();
  const senderIds = [...new Set(messages.map((m) => String(m.senderId)))];
  const staff = await StaffProfile.find({ userId: { $in: senderIds } }, { userId: 1, displayName: 1 }).lean();
  const staffName = new Map(staff.map((s) => [String(s.userId), s.displayName]));

  const now = new Date();
  const me = thread.participants.find((p) => String(p.userId) === ctx.userId);
  if (me) me.lastReadAt = now;
  else thread.participants.push({ userId: new Types.ObjectId(ctx.userId), role: ctx.role, lastReadAt: now });
  await authorizeDoc(thread, LOOKUP).save();
  await recordAudit(ctx, { action: "VIEW", resourceType: "MessageThread", resourceId: threadId, patientId: String(thread.patientId) });

  const clientName = `${patient.preferredName ?? patient.firstName} ${patient.lastName}`;
  return {
    id: threadId,
    subject: thread.subject,
    category: thread.category as Topic,
    patientId: String(thread.patientId),
    patient: clientName,
    closed: Boolean(thread.closedAt),
    canReply: !thread.closedAt && ctx.role !== "SUPER_ADMIN", // admins review, they don't reply
    messages: messages.map((m) => ({
      id: String(m._id),
      mine: String(m.senderId) === ctx.userId,
      fromClient: m.senderRole === "PATIENT",
      sender: m.senderRole === "PATIENT" ? clientName : (staffName.get(String(m.senderId)) ?? "Care team"),
      body: m.redactedAt ? "[This message was removed by an administrator]" : decrypt(m.bodyEnc, ENC.messageBody),
      at: (m as { createdAt?: Date }).createdAt ?? now,
    })),
  };
}

async function notify(thread: { category: string; patientId: Types.ObjectId }, senderRole: string) {
  const patient = await patientInfo(thread.patientId);
  try {
    if (senderRole !== "PATIENT") {
      if (patient.email) await sendNewMessageNotice(patient.email, "/portal/messages");
    } else if (thread.category === "CLINICAL" && patient.assignedProviderId) {
      const provider = await StaffProfile.findById(patient.assignedProviderId, { userId: 1 }).lean();
      const { getAuth } = await import("@/lib/auth");
      const user = provider?.userId ? await (await getAuth().$context).internalAdapter.findUserById(String(provider.userId)) : null;
      if (user?.email) await sendNewMessageNotice(user.email, "/dashboard/messages");
    }
  } catch (error) {
    console.error("Message notice failed", error); // the message itself is saved either way
  }
}

/** Start a conversation. Clients write to their care team; staff write to a client. */
export async function startThread(ctx: AuthContext, input: { patientId?: string; topic: string; subject: string; body: string }) {
  const patientId = ctx.role === "PATIENT" ? ctx.patientId : input.patientId;
  if (!patientId) throw new MessageError("Choose a client.");
  if (!(input.topic in TOPICS)) throw new MessageError("Choose a topic.");
  const topic = input.topic as Topic;
  const subject = input.subject.trim().replace(/\s+/g, " ");
  if (subject.length < 3) throw new MessageError("Add a short subject.");
  if (subject.length > 140) throw new MessageError("Keep the subject under 140 characters.");
  const body = cleanBody(input.body);
  const patient = await patientInfo(patientId);
  await authorize(ctx, "message", "create", { patientId, assignedProviderId: patient.assignedProviderId ?? null, messageCategory: topic });

  const now = new Date();
  const participants: { userId: Types.ObjectId; role: string; lastReadAt?: Date }[] = [{ userId: new Types.ObjectId(ctx.userId), role: ctx.role, lastReadAt: now }];
  if (ctx.role !== "PATIENT" && patient.userId) participants.push({ userId: patient.userId as Types.ObjectId, role: "PATIENT" });
  const thread = await createScoped(MessageThread, authzToken(ctx), { patientId, category: topic, subject, participants, lastMessageAt: now, createdBy: ctx.userId });
  await createScoped(SecureMessage, authzToken(ctx), { threadId: thread._id, patientId, senderId: ctx.userId, senderRole: ctx.role, bodyEnc: encrypt(body, ENC.messageBody) });
  await recordAudit(ctx, { action: "CREATE", resourceType: "MessageThread", resourceId: String(thread._id), patientId, metadata: { category: topic } });
  await notify(thread, ctx.role);
  return String(thread._id);
}

export async function reply(ctx: AuthContext, threadId: string, body: string) {
  if (ctx.role === "SUPER_ADMIN") throw new MessageError("Administrators can read conversations but not reply.");
  const { thread } = await loadThread(ctx, threadId, "create");
  if (thread.closedAt) throw new MessageError("This conversation is closed. Start a new one.");
  const text = cleanBody(body);
  const now = new Date();
  const message = await createScoped(SecureMessage, authzToken(ctx), { threadId: thread._id, patientId: thread.patientId, senderId: ctx.userId, senderRole: ctx.role, bodyEnc: encrypt(text, ENC.messageBody) });
  const me = thread.participants.find((p) => String(p.userId) === ctx.userId);
  if (me) me.lastReadAt = now;
  else thread.participants.push({ userId: new Types.ObjectId(ctx.userId), role: ctx.role, lastReadAt: now });
  thread.lastMessageAt = now;
  await authorizeDoc(thread, LOOKUP).save();
  await recordAudit(ctx, { action: "CREATE", resourceType: "SecureMessage", resourceId: String(message._id), patientId: String(thread.patientId), metadata: { threadId } });
  await notify(thread, ctx.role);
  return String(message._id);
}

/** Staff close a resolved conversation (the client can start a new one). */
export async function closeThread(ctx: AuthContext, threadId: string) {
  if (!isStaff(ctx.role) || ctx.role === "SUPER_ADMIN") throw new MessageError("Only the care team can close a conversation.");
  const { thread } = await loadThread(ctx, threadId, "create");
  if (thread.closedAt) return;
  thread.closedAt = new Date();
  await authorizeDoc(thread, LOOKUP).save();
  await recordAudit(ctx, { action: "UPDATE", resourceType: "MessageThread", resourceId: threadId, patientId: String(thread.patientId), changedFields: ["closedAt"] });
}

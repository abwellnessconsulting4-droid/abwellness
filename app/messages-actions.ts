"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditedDenial } from "@/lib/audit";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { closeThread, MessageError, reply, startThread } from "@/lib/services/messages";

export interface MessageState {
  error?: string;
}

async function session() {
  const ctx = await requireSession();
  await connectToDatabase();
  return { ctx, base: ctx.role === "PATIENT" ? "/portal/messages" : "/dashboard/messages" };
}

function friendly(error: unknown): MessageState {
  if (error instanceof MessageError) return { error: error.message };
  if (error instanceof AuditedDenial) return { error: "You don't have permission to send that message. The attempt was recorded." };
  throw error;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function startThreadAction(_prev: MessageState, form: FormData): Promise<MessageState> {
  const { ctx, base } = await session();
  let id: string;
  try {
    id = await startThread(ctx, { patientId: text(form, "patientId") || undefined, topic: text(form, "topic"), subject: text(form, "subject"), body: text(form, "body") });
  } catch (error) {
    return friendly(error);
  }
  revalidatePath(base);
  redirect(`${base}/${id}?sent=1`);
}

export async function replyAction(threadId: string, _prev: MessageState, form: FormData): Promise<MessageState> {
  const { ctx, base } = await session();
  try {
    await reply(ctx, threadId, text(form, "body"));
  } catch (error) {
    return friendly(error);
  }
  revalidatePath(base, "layout");
  redirect(`${base}/${threadId}?sent=1`);
}

export async function closeThreadAction(threadId: string) {
  const { ctx, base } = await session();
  await closeThread(ctx, threadId);
  revalidatePath(base, "layout");
}

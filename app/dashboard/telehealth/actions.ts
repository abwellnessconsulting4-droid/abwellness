"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditedDenial } from "@/lib/audit";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { admit, endVisit, startVisitNote, TelehealthError } from "@/lib/services/telehealth";
import { NoteError } from "@/lib/services/notes";

export interface VisitState {
  error?: string;
  success?: string;
}

async function staff() {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  return ctx;
}

function friendly(error: unknown): VisitState {
  if (error instanceof TelehealthError || error instanceof NoteError) return { error: error.message };
  if (error instanceof AuditedDenial) return { error: "You don't have permission to do that. The attempt was recorded." };
  throw error;
}

export async function visitAction(sessionId: string, _prev: VisitState, form: FormData): Promise<VisitState> {
  const ctx = await staff();
  let result: VisitState;
  try {
    if (form.get("intent") === "admit") {
      await admit(ctx, sessionId);
      result = { success: "Client admitted. The visit timer has started." };
    } else if (form.get("intent") === "end") {
      const { minutes } = await endVisit(ctx, sessionId);
      result = { success: `Visit ended after ${minutes} ${minutes === 1 ? "minute" : "minutes"}. The length was added to the visit note.` };
    } else {
      return { error: "Unknown action." };
    }
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/dashboard/telehealth", "layout");
  revalidatePath("/dashboard/schedule");
  return result;
}

export async function startNoteAction(sessionId: string, _prev: VisitState): Promise<VisitState> {
  const ctx = await staff();
  try {
    await startVisitNote(ctx, sessionId);
  } catch (error) {
    return friendly(error);
  }
  revalidatePath(`/dashboard/telehealth/${sessionId}`);
  redirect(`/dashboard/telehealth/${sessionId}`);
}

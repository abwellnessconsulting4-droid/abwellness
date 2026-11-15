"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditedDenial } from "@/lib/audit";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { bookMine, cancelMine, joinVideo } from "@/lib/services/portal-appointments";
import { SchedulingError } from "@/lib/services/scheduling";

export interface PortalApptState {
  error?: string;
}

async function patient() {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  return ctx;
}

function friendly(error: unknown): PortalApptState {
  if (error instanceof SchedulingError) return { error: error.message };
  if (error instanceof AuditedDenial) return { error: "You don't have permission to do that." };
  throw error;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function bookMineAction(_prev: PortalApptState, form: FormData): Promise<PortalApptState> {
  const ctx = await patient();
  try {
    await bookMine(ctx, { providerId: text(form, "providerId"), visitType: text(form, "visitType"), mode: text(form, "mode") as "IN_PERSON" | "VIRTUAL", start: text(form, "start") });
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/portal", "layout");
  redirect("/portal/appointments?booked=1");
}

export async function cancelMineAction(appointmentId: string, _prev: PortalApptState, form: FormData): Promise<PortalApptState> {
  const ctx = await patient();
  let fee = false;
  try {
    fee = Boolean((await cancelMine(ctx, appointmentId, text(form, "reason"))).feeInvoiceId);
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/portal", "layout");
  redirect(`/portal/appointments?cancelled=${fee ? "fee" : "1"}`);
}

export async function joinVideoAction(appointmentId: string, _prev: PortalApptState): Promise<PortalApptState> {
  const ctx = await patient();
  try {
    await joinVideo(ctx, appointmentId);
  } catch (error) {
    return friendly(error);
  }
  redirect(`/portal/appointments/${appointmentId}/visit`);
}

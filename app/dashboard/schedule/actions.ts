"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditedDenial } from "@/lib/audit";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { bookAppointment, bookFromWaitlist, cancelAppointment, checkIn, markNoShow, SchedulingError, type CancelResult } from "@/lib/services/scheduling";
import { DEFAULT_TZ } from "@/lib/services/scheduling";
import { dateKey } from "@/lib/tz";

export interface ScheduleState {
  error?: string;
  success?: string;
  cancel?: CancelResult;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

async function staff() {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  return ctx;
}

function friendly(error: unknown): ScheduleState {
  if (error instanceof SchedulingError) return { error: error.message };
  if (error instanceof AuditedDenial) return { error: "You don't have permission to do that. The attempt was recorded." };
  throw error;
}

export async function bookAction(_prev: ScheduleState, form: FormData): Promise<ScheduleState> {
  const ctx = await staff();
  const start = text(form, "start");
  try {
    await bookAppointment(ctx, {
      patientId: text(form, "patientId"),
      providerId: text(form, "providerId"),
      visitType: text(form, "visitType"),
      mode: text(form, "mode") as "IN_PERSON" | "VIRTUAL",
      start,
    });
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/dashboard/schedule");
  redirect(`/dashboard/schedule?date=${dateKey(new Date(start), DEFAULT_TZ)}&booked=1`);
}

export async function appointmentAction(_prev: ScheduleState, form: FormData): Promise<ScheduleState> {
  const ctx = await staff();
  const id = text(form, "appointmentId");
  try {
    switch (text(form, "intent")) {
      case "check-in":
        await checkIn(ctx, id);
        revalidatePath("/dashboard/schedule");
        return { success: "Checked in." };
      case "no-show": {
        const { feeInvoiceId } = await markNoShow(ctx, id, { waiveFee: form.get("waiveFee") === "on" });
        revalidatePath("/dashboard/schedule");
        return { success: feeInvoiceId ? "Marked as a no-show. The missed-appointment fee was invoiced." : "Marked as a no-show." };
      }
      case "cancel": {
        const result = await cancelAppointment(ctx, id, { reason: text(form, "reason"), waiveFee: form.get("waiveFee") === "on" });
        revalidatePath("/dashboard/schedule");
        return { cancel: result, success: result.feeInvoiceId ? `Late cancellation (${result.hoursNotice} h notice): fee invoiced per the signed policy.` : result.status === "LATE_CANCELLED" ? "Late cancellation recorded; fee waived." : "Cancelled. No fee." };
      }
      default:
        return { error: "Unknown action." };
    }
  } catch (error) {
    return friendly(error);
  }
}

export async function bookFromWaitlistAction(_prev: ScheduleState, form: FormData): Promise<ScheduleState> {
  const ctx = await staff();
  try {
    await bookFromWaitlist(ctx, text(form, "entryId"), {
      providerId: text(form, "providerId"),
      visitType: text(form, "visitType"),
      mode: text(form, "mode") as "IN_PERSON" | "VIRTUAL",
      start: text(form, "start"),
    });
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/dashboard/schedule");
  return { success: "Booked from the waitlist." };
}

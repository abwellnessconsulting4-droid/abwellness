"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditedDenial } from "@/lib/audit";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { cancelCheckout, completePayment, enrollPlan, PaymentError, startPayment } from "@/lib/services/payments";

export interface PayState {
  error?: string;
}

async function patient() {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  return ctx;
}

function friendly(error: unknown): PayState {
  if (error instanceof PaymentError) return { error: error.message };
  if (error instanceof AuditedDenial) return { error: "You don't have permission to do that." };
  throw error;
}

export async function payAction(_prev: PayState, form: FormData): Promise<PayState> {
  const ctx = await patient();
  let url: string;
  try {
    ({ url } = await startPayment(ctx, form.getAll("invoiceId").map(String)));
  } catch (error) {
    return friendly(error);
  }
  redirect(url);
}

/** Simulated checkout page: confirm or cancel. */
export async function checkoutAction(reference: string, _prev: PayState, form: FormData): Promise<PayState> {
  const ctx = await patient();
  let receiptNumber: string | undefined;
  try {
    if (form.get("intent") === "cancel") {
      await cancelCheckout(ctx, reference);
    } else {
      ({ receiptNumber } = await completePayment(ctx, reference, { succeeded: true, cardBrand: "Test card", cardLast4: "4242" }));
    }
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/portal", "layout");
  redirect(receiptNumber ? `/portal/billing?paid=${encodeURIComponent(receiptNumber)}` : "/portal/billing?cancelled=1");
}

export async function enrollPlanAction(invoiceId: string, installmentCount: number, _prev: PayState, form: FormData): Promise<PayState> {
  const ctx = await patient();
  if (form.get("agree") !== "on") return { error: "Check the box to agree to the plan terms." };
  const h = await headers();
  try {
    await enrollPlan(ctx, {
      invoiceId,
      installmentCount,
      signatureName: String(form.get("signatureName") ?? ""),
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      userAgent: h.get("user-agent") ?? undefined,
    });
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/portal", "layout");
  redirect("/portal/billing?plan=1");
}

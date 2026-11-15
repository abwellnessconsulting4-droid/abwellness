import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { chargeDueInstallments, sendPaymentReminders } from "@/lib/services/payments";

/**
 * Daily billing job (Vercel Cron): autopay installments, then payment
 * reminders. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  await connectToDatabase();
  const autopay = await chargeDueInstallments();
  const reminders = await sendPaymentReminders();
  return NextResponse.json({ autopay, reminders });
}

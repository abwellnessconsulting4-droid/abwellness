import { NextResponse, type NextRequest } from "next/server";
import { AuditedDenial } from "@/lib/audit";
import { getAuthContext, SessionError } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { renderReceiptPdf } from "@/lib/receipt-pdf";
import { getReceipt, PaymentError } from "@/lib/services/payments";

/** Itemized PDF receipt (the download is audited). */
export async function GET(request: NextRequest, { params }: RouteContext<"/portal/billing/receipts/[id]">) {
  let ctx;
  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof SessionError) return NextResponse.redirect(new URL("/login", request.url));
    throw error;
  }
  await connectToDatabase();
  const { id } = await params;
  try {
    const receipt = await getReceipt(ctx, id);
    const pdf = await renderReceiptPdf(receipt);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receipt.receiptNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof PaymentError) return new NextResponse("Receipt not found.", { status: 404 });
    if (error instanceof AuditedDenial) return new NextResponse("Forbidden", { status: 403 });
    throw error;
  }
}

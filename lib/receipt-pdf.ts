import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { SITE_NAME } from "@/lib/constants";
import type { Receipt } from "@/lib/services/payments";

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const when = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "long", timeStyle: "short" }).format(d);

/** Itemized payment receipt as a one-page PDF (Letter). */
export async function renderReceiptPdf(r: Receipt): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Receipt ${r.receiptNumber}`);
  pdf.setAuthor(SITE_NAME);
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.42, 0.45, 0.5);
  const left = 56;
  const right = 556;
  let y = 736;

  const text = (value: string, x: number, size = 10, font = regular, color = ink) => page.drawText(value, { x, y, size, font, color });
  const textRight = (value: string, x: number, size = 10, font = regular) => page.drawText(value, { x: x - font.widthOfTextAtSize(value, size), y, size, font, color: ink });
  const rule = () => page.drawLine({ start: { x: left, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 0.5, color: muted });

  text(SITE_NAME, left, 18, bold);
  textRight("PAYMENT RECEIPT", right, 12, bold);
  y -= 44;

  const facts: [string, string][] = [
    ["Receipt number", r.receiptNumber],
    ["Date paid", when(r.paidAt)],
    ["Paid by", r.method],
    ...(r.billedTo ? ([["Billed to", r.billedTo.name], ["Account", r.billedTo.accountNumber]] as [string, string][]) : []),
  ];
  for (const [label, value] of facts) {
    text(label, left, 10, regular, muted);
    text(value, left + 120, 10);
    y -= 16;
  }

  y -= 18;
  text("Description", left, 10, bold);
  textRight("Amount", right, 10, bold);
  y -= 14;
  rule();
  y -= 10;
  for (const a of r.allocations) {
    text(`Invoice ${a.invoiceNumber}`, left, 10, bold);
    y -= 15;
    for (const item of a.lineItems) {
      text(item.description.slice(0, 80), left + 12, 10);
      textRight(money(item.amountCents), right);
      y -= 15;
    }
    text("Applied from this payment", left + 12, 10, regular, muted);
    textRight(money(a.appliedCents), right);
    y -= 15;
    text("Remaining balance on this invoice", left + 12, 10, regular, muted);
    textRight(money(a.remainingCents), right);
    y -= 22;
  }
  rule();
  y -= 10;
  text("Total paid", left, 12, bold);
  textRight(money(r.amountCents), right, 12, bold);
  y -= 40;

  if (r.installment) {
    text("This payment is an installment of your payment plan.", left, 9, regular, muted);
    y -= 14;
  }
  if (r.testMode) {
    text("TEST MODE: no card was charged. This receipt is for testing only.", left, 9, bold, rgb(0.7, 0.2, 0.1));
    y -= 14;
  }
  text("Keep this receipt for your records. Questions about your bill? Message us from the client portal.", left, 9, regular, muted);
  return pdf.save();
}

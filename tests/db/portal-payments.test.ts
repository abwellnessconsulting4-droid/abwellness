import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { systemToken } from "@/lib/db/phi-guard";
import { listInvoices } from "@/lib/services/rcm";
import { cancelCheckout, chargeDueInstallments, completePayment, enrollPlan, getCheckout, getReceipt, PaymentError, portalBilling, previewPlan, sendPaymentReminders, startPayment } from "@/lib/services/payments";
import { AuditLog, Invoice, PaymentPlan, PaymentTransaction } from "@/models";
import { EMAIL, setupSeededDatabase } from "./seeded";

const { as } = setupSeededDatabase("portal-payments");
const SYS = { authz: systemToken("test") };
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const card = { succeeded: true, cardBrand: "Test card", cardLast4: "4242" };
const invoice = (n: string) => Invoice.findOne({ invoiceNumber: n }).setOptions(SYS).lean();

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-11-15T15:00:00Z");
});
afterAll(() => vi.useRealTimers());

describe("Use Case 4: Elena pays her $50 invoice", () => {
  it("shows her open balances on the portal", async () => {
    const billing = await portalBilling(await as(EMAIL.elena));
    expect(billing.open.map((i) => [i.invoiceNumber, i.balanceCents, i.planEligible])).toEqual(
      expect.arrayContaining([
        ["INV-2026-5001", 5000, false],
        ["INV-2026-5003", 24000, true],
      ]),
    );
    expect(billing.open.some((i) => i.invoiceNumber === "INV-2026-5002")).toBe(false); // David's
  });

  it("can't pay someone else's invoice", async () => {
    const davids = await invoice("INV-2026-5002");
    await expect(startPayment(await as(EMAIL.elena), [String(davids!._id)])).rejects.toBeInstanceOf(PaymentError);
    await expect(startPayment(await as(EMAIL.billing), [String(davids!._id)])).rejects.toBeInstanceOf(PaymentError); // portal-only flow
  });

  it("a cancelled checkout changes nothing", async () => {
    const elena = await as(EMAIL.elena);
    const inv = await invoice("INV-2026-5001");
    const { reference } = await startPayment(elena, [String(inv!._id)]);
    await cancelCheckout(elena, reference);
    expect((await getCheckout(elena, reference)).status).toBe("CANCELED");
    await expect(completePayment(elena, reference, card)).rejects.toBeInstanceOf(PaymentError);
    expect((await invoice("INV-2026-5001"))?.status).toBe("UNPAID");
  });

  it("paying marks the invoice PAID, logs the transaction, and issues a receipt", async () => {
    const elena = await as(EMAIL.elena);
    const inv = await invoice("INV-2026-5001");
    const { reference, url } = await startPayment(elena, [String(inv!._id)]);
    expect(url).toBe(`/portal/billing/checkout/${reference}`);
    expect(await getCheckout(elena, reference)).toMatchObject({ status: "PENDING", amountCents: 5000, invoices: ["INV-2026-5001"] });

    await expect(completePayment(await as(EMAIL.thorne), reference, card)).rejects.toBeInstanceOf(PaymentError);
    const done = await completePayment(elena, reference, card);
    expect(done.receiptNumber).toMatch(/^RCT-2026-\d{5}$/);
    expect(await completePayment(elena, reference, card)).toMatchObject({ alreadyDone: true }); // idempotent (webhook + page)

    expect(await invoice("INV-2026-5001")).toMatchObject({ status: "PAID", amountPaidCents: 5000 });
    const tx = await PaymentTransaction.findById(done.transactionId).setOptions(SYS).lean();
    expect(tx).toMatchObject({ status: "SUCCEEDED", amountCents: 5000, processor: "SIMULATED", cardLast4: "4242" });

    const receipt = await getReceipt(elena, done.transactionId);
    expect(receipt).toMatchObject({ amountCents: 5000, testMode: true, billedTo: { name: "Elena Vance" } });
    expect(receipt.allocations[0].lineItems.map((l) => l.description)).toEqual(["Copay: 11/11/2026 visit", "Deductible: 11/11/2026 visit"]);
    await expect(getReceipt(await as(EMAIL.thorne), done.transactionId)).rejects.toThrow();
    expect(await AuditLog.countDocuments({ resourceType: "Receipt", action: "EXPORT" }).setOptions(SYS)).toBe(1);
  });
});

describe("Use Case 4: a 3-month autopay plan for the $240 package", () => {
  it("previews $80 × 3 and requires her typed full name", async () => {
    const elena = await as(EMAIL.elena);
    const inv = await invoice("INV-2026-5003");
    const preview = await previewPlan(elena, String(inv!._id), 3);
    expect(preview.installments).toEqual([8000, 8000, 8000]);
    expect(preview.text).toContain("$240.00 in 3 monthly payments");
    await expect(previewPlan(elena, String(inv!._id), 5)).rejects.toBeInstanceOf(PaymentError);
    await expect(enrollPlan(elena, { invoiceId: String(inv!._id), installmentCount: 3, signatureName: "E V", ipAddress: "198.51.100.7" })).rejects.toThrow(/full name/);
  });

  it("enrolling signs the terms, charges the first $80, and autopay finishes the plan", async () => {
    const elena = await as(EMAIL.elena);
    const inv = await invoice("INV-2026-5003");
    const { planId, firstCharge } = await enrollPlan(elena, { invoiceId: String(inv!._id), installmentCount: 3, signatureName: "elena vance", ipAddress: "198.51.100.7", userAgent: "vitest" });
    expect(firstCharge).toBe(true);

    let plan = await PaymentPlan.findById(planId).setOptions(SYS).lean();
    expect(plan?.agreement).toMatchObject({ method: "TYPED", signerName: "elena vance", ipAddress: "198.51.100.7" });
    expect(plan?.schedule.map((s) => s.status)).toEqual(["PAID", "SCHEDULED", "SCHEDULED"]);
    expect(await invoice("INV-2026-5003")).toMatchObject({ status: "IN_PAYMENT_PLAN", amountPaidCents: 8000 });
    await expect(startPayment(elena, [String(inv!._id)])).rejects.toBeInstanceOf(PaymentError); // already on a plan

    expect(await chargeDueInstallments(new Date("2026-12-01T12:00:00Z"))).toEqual({ charged: 0, failed: 0 }); // not due yet
    expect((await chargeDueInstallments(new Date("2026-12-15T16:00:00Z"))).charged).toBe(1);
    expect((await chargeDueInstallments(new Date("2027-01-15T16:00:00Z"))).charged).toBe(1);

    plan = await PaymentPlan.findById(planId).setOptions(SYS).lean();
    expect(plan?.status).toBe("COMPLETED");
    expect(await invoice("INV-2026-5003")).toMatchObject({ status: "PAID", amountPaidCents: 24000 });
    expect(await PaymentTransaction.countDocuments({ paymentPlanId: plan!._id, status: "SUCCEEDED" }).setOptions(SYS)).toBe(3);

    const billing = await portalBilling(elena);
    expect(billing.payments.filter((p) => p.plan)).toHaveLength(3);
  });
});

describe("A/R and reminders", () => {
  it("staff A/R drops as soon as Elena pays", async () => {
    const { invoices } = await listInvoices(await as(EMAIL.billing));
    expect(invoices.some((i) => i.invoiceNumber === "INV-2026-5001" || i.invoiceNumber === "INV-2026-5003")).toBe(false);
  });

  it("emails clients with balances due soon, once a week, with no amounts", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const first = await sendPaymentReminders(new Date("2026-11-25T12:00:00Z")); // David's fee is due 11/28
    expect(first.sent).toBe(1);
    const message = String(log.mock.calls.find((c) => String(c[0]).includes("david.morales"))?.[0] ?? log.mock.calls.at(-1)?.[0]);
    expect(message).toContain("balance due");
    expect(message).not.toMatch(/\$\d/);
    expect((await sendPaymentReminders(new Date("2026-11-26T12:00:00Z"))).sent).toBe(0); // already reminded this week
    log.mockRestore();
  });
});

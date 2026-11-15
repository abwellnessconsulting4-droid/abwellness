import "server-only";

import mongoose, { Types } from "mongoose";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { authorize, authorizeAny, authzToken, withScope, type AuthContext } from "@/lib/authz";
import { authorizeDoc, createScoped, systemToken } from "@/lib/db/phi-guard";
import { sendPaymentReminder } from "@/lib/email/billing";
import { paymentProcessor, type ChargeResult } from "@/lib/payments";
import { DEFAULT_TZ } from "@/lib/services/scheduling";
import { buildSignature } from "@/lib/signatures";
import { Invoice, Patient, PaymentPlan, PaymentTransaction, nextReceiptNumber, splitInstallments } from "@/models";

/**
 * Client payments (Use Case 4): paying invoices, receipts, payment plans with
 * autopay, and payment reminders. Card details stay with the processor.
 */

const SYSTEM = systemToken("payments");
const SYSTEM_ACTOR: AuditActor = { actorRole: "SYSTEM" };
export class PaymentError extends Error {}

const OPEN: ("UNPAID" | "PARTIAL")[] = ["UNPAID", "PARTIAL"];
const isOpen = (status: string) => (OPEN as string[]).includes(status);
const balance = (i: { amountDueCents?: number | null; amountPaidCents?: number | null }) => (i.amountDueCents ?? 0) - (i.amountPaidCents ?? 0);
const dollars = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TZ, month: "long", day: "numeric", year: "numeric" }).format(d);

export const PLAN_MIN_CENTS = 10_000; // plans are offered on balances of $100 or more
export const PLAN_INSTALLMENTS = [2, 3, 4, 6] as const;

function requirePatient(ctx: AuthContext) {
  if (ctx.role !== "PATIENT" || !ctx.patientId) throw new PaymentError("Only clients can do this from the portal.");
  return ctx.patientId;
}

// ── Overview ────────────────────────────────────────────────────────────────

export async function portalBilling(ctx: AuthContext) {
  await authorizeAny(ctx, "invoice", "read");
  const authz = { authz: authzToken(ctx) };
  const [invoices, payments, plans] = await Promise.all([
    Invoice.find(await withScope(ctx, "invoice", { publishedToPortal: true, status: { $ne: "DRAFT" } })).sort({ issuedAt: -1 }).setOptions(authz).lean(),
    PaymentTransaction.find(await withScope(ctx, "payment", { status: "SUCCEEDED", kind: "PAYMENT" })).sort({ createdAt: -1 }).limit(50).setOptions(authz).lean(),
    PaymentPlan.find(await withScope(ctx, "paymentPlan", { status: { $in: ["ACTIVE", "COMPLETED"] } })).sort({ createdAt: -1 }).setOptions(authz).lean(),
  ]);
  await recordAudit(ctx, { action: "VIEW", resourceType: "PortalBilling", patientId: ctx.patientId });
  const number = new Map(invoices.map((i) => [String(i._id), i.invoiceNumber]));
  return {
    open: invoices
      .filter((i) => isOpen(i.status) || i.status === "IN_PAYMENT_PLAN")
      .map((i) => ({
        id: String(i._id),
        invoiceNumber: i.invoiceNumber,
        kind: i.kind,
        status: i.status,
        lineItems: i.lineItems,
        amountDueCents: i.amountDueCents ?? 0,
        balanceCents: balance(i),
        issuedAt: i.issuedAt ?? undefined,
        dueDate: i.dueDate ?? undefined,
        notes: i.notes ?? undefined,
        planEligible: isOpen(i.status) && balance(i) >= PLAN_MIN_CENTS,
      })),
    paid: invoices.filter((i) => i.status === "PAID").map((i) => ({ id: String(i._id), invoiceNumber: i.invoiceNumber, amountDueCents: i.amountDueCents ?? 0, paidAt: i.paidAt ?? undefined })),
    payments: payments.map((p) => ({
      id: String(p._id),
      receiptNumber: p.receiptNumber ?? undefined,
      amountCents: p.amountCents,
      createdAt: (p as { createdAt?: Date }).createdAt,
      card: p.cardBrand ? `${p.cardBrand} ••••${p.cardLast4 ?? ""}` : p.method,
      invoices: p.allocations.map((a) => number.get(String(a.invoiceId)) ?? "invoice"),
      plan: Boolean(p.paymentPlanId),
    })),
    plans: plans.map((p) => ({
      id: String(p._id),
      status: p.status,
      totalCents: p.totalCents,
      autopay: p.autopay,
      invoices: p.invoiceIds.map((id) => number.get(String(id)) ?? "invoice"),
      schedule: p.schedule.map((s) => ({ dueDate: s.dueDate, amountCents: s.amountCents, status: s.status })),
    })),
  };
}

// ── One-off payments ───────────────────────────────────────────────────────

/** Start paying one or more open invoices; returns the processor's checkout URL. */
export async function startPayment(ctx: AuthContext, invoiceIds: string[]) {
  const patientId = requirePatient(ctx);
  await authorizeAny(ctx, "payment", "create");
  const ids = [...new Set(invoiceIds)].filter((id) => Types.ObjectId.isValid(id));
  if (ids.length === 0) throw new PaymentError("Choose an invoice to pay.");
  const invoices = await Invoice.find(await withScope(ctx, "invoice", { _id: { $in: ids }, publishedToPortal: true })).setOptions({ authz: authzToken(ctx) }).lean();
  if (invoices.length !== ids.length) throw new PaymentError("That invoice isn't available.");
  if (invoices.some((i) => !isOpen(i.status))) throw new PaymentError("One of those invoices is already paid or on a payment plan.");
  const allocations = invoices.map((i) => ({ invoiceId: i._id, amountCents: balance(i) })).filter((a) => a.amountCents > 0);
  const amountCents = allocations.reduce((n, a) => n + a.amountCents, 0);
  if (amountCents <= 0) throw new PaymentError("Nothing is owed on that invoice.");

  const checkout = await paymentProcessor().createCheckout({
    amountCents,
    description: `AB Wellness ${invoices.map((i) => i.invoiceNumber).join(", ")}`,
    returnPath: "/portal/billing",
  });
  const tx = await createScoped(PaymentTransaction, authzToken(ctx), {
    patientId,
    kind: "PAYMENT",
    allocations,
    amountCents,
    method: "CARD",
    processor: paymentProcessor().id,
    processorReference: checkout.reference,
    status: "PENDING",
    collectedBy: ctx.userId,
  });
  await recordAudit(ctx, { action: "CREATE", resourceType: "PaymentTransaction", resourceId: String(tx._id), patientId, metadata: { status: "PENDING", amountCents, invoices: invoices.map((i) => i.invoiceNumber) } });
  return { url: checkout.url, reference: checkout.reference };
}

/** The pending checkout behind a reference (simulated checkout page). */
export async function getCheckout(ctx: AuthContext, reference: string) {
  const patientId = requirePatient(ctx);
  const tx = await PaymentTransaction.findOne({ processorReference: reference, patientId }).setOptions({ authz: authzToken(ctx) }).lean();
  if (!tx) throw new PaymentError("That checkout wasn't found.");
  const invoices = await Invoice.find({ _id: { $in: tx.allocations.map((a) => a.invoiceId) } }, { invoiceNumber: 1 }).setOptions({ authz: SYSTEM }).lean();
  return { reference, status: tx.status, amountCents: tx.amountCents, invoices: invoices.map((i) => i.invoiceNumber), processor: tx.processor };
}

/** Apply a payment's allocations to its invoices (and plan installments). */
async function applyAllocations(tx: InstanceType<typeof PaymentTransaction>, session: mongoose.ClientSession, installment?: { planId: Types.ObjectId; index: number }) {
  for (const a of tx.allocations) {
    const invoice = await Invoice.findById(a.invoiceId).session(session).setOptions({ authz: SYSTEM });
    if (!invoice) continue;
    invoice.amountPaidCents = Math.min(invoice.amountDueCents ?? 0, (invoice.amountPaidCents ?? 0) + a.amountCents);
    if (invoice.status === "IN_PAYMENT_PLAN" && (invoice.amountPaidCents ?? 0) >= (invoice.amountDueCents ?? 0)) invoice.status = "PAID";
    await authorizeDoc(invoice, SYSTEM).save({ session });
  }
  if (installment) {
    const plan = await PaymentPlan.findById(installment.planId).session(session).setOptions({ authz: SYSTEM });
    if (plan) {
      const item = plan.schedule[installment.index];
      item.status = "PAID";
      item.transactionId = tx._id;
      if (plan.schedule.every((s) => s.status === "PAID")) plan.status = "COMPLETED";
      await authorizeDoc(plan, SYSTEM).save({ session });
    }
  }
}

/**
 * Confirm a checkout. Idempotent: the simulated page and (later) the Stripe
 * webhook may both call it. `actor` is the client for the simulated page and
 * the system for webhooks.
 */
export async function completePayment(actor: AuthContext | "system", reference: string, charge: Omit<ChargeResult, "reference">) {
  const tx = await PaymentTransaction.findOne({ processorReference: reference }).setOptions({ authz: SYSTEM });
  if (!tx) throw new PaymentError("That checkout wasn't found.");
  if (actor !== "system" && (actor.role !== "PATIENT" || actor.patientId !== String(tx.patientId))) throw new PaymentError("That checkout wasn't found.");
  if (tx.status === "SUCCEEDED") return { transactionId: String(tx._id), receiptNumber: tx.receiptNumber ?? undefined, alreadyDone: true };
  if (tx.status !== "PENDING") throw new PaymentError("This checkout is no longer active.");
  const audit = actor === "system" ? SYSTEM_ACTOR : actor;

  if (!charge.succeeded) {
    tx.status = "FAILED";
    tx.failureReason = charge.failureReason ?? "Declined";
    await authorizeDoc(tx, SYSTEM).save();
    await recordAudit(audit, { action: "UPDATE", resourceType: "PaymentTransaction", resourceId: String(tx._id), patientId: String(tx.patientId), changedFields: ["status"], metadata: { to: "FAILED" } });
    return { transactionId: String(tx._id), failed: true };
  }

  const receiptNumber = await nextReceiptNumber();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      tx.status = "SUCCEEDED";
      tx.receiptNumber = receiptNumber;
      tx.cardBrand = charge.cardBrand;
      tx.cardLast4 = charge.cardLast4;
      await authorizeDoc(tx, SYSTEM).save({ session });
      await applyAllocations(tx, session);
    });
  } finally {
    await session.endSession();
  }
  await recordAudit(audit, { action: "UPDATE", resourceType: "PaymentTransaction", resourceId: String(tx._id), patientId: String(tx.patientId), changedFields: ["status", "receiptNumber"], metadata: { to: "SUCCEEDED", amountCents: tx.amountCents, receiptNumber } });
  return { transactionId: String(tx._id), receiptNumber };
}

export async function cancelCheckout(ctx: AuthContext, reference: string) {
  const patientId = requirePatient(ctx);
  const tx = await PaymentTransaction.findOne({ processorReference: reference, patientId, status: "PENDING" }).setOptions({ authz: authzToken(ctx) });
  if (!tx) return;
  tx.status = "CANCELED";
  await authorizeDoc(tx, authzToken(ctx)).save();
  await recordAudit(ctx, { action: "UPDATE", resourceType: "PaymentTransaction", resourceId: String(tx._id), patientId, changedFields: ["status"], metadata: { to: "CANCELED" } });
}

// ── Receipts ────────────────────────────────────────────────────────────────

export async function getReceipt(ctx: AuthContext, transactionId: string) {
  if (!Types.ObjectId.isValid(transactionId)) throw new PaymentError("Receipt not found.");
  const tx = await PaymentTransaction.findById(transactionId).setOptions({ authz: SYSTEM }).lean();
  if (!tx || tx.status !== "SUCCEEDED") throw new PaymentError("Receipt not found.");
  await authorize(ctx, "payment", "read", { resourceId: transactionId, patientId: tx.patientId });
  const [patient, invoices] = await Promise.all([
    Patient.findById(tx.patientId, { firstName: 1, lastName: 1, mrn: 1, address: 1 }).setOptions({ authz: SYSTEM }).lean(),
    Invoice.find({ _id: { $in: tx.allocations.map((a) => a.invoiceId) } }, { invoiceNumber: 1, lineItems: 1, amountDueCents: 1, amountPaidCents: 1 }).setOptions({ authz: SYSTEM }).lean(),
  ]);
  await recordAudit(ctx, { action: "EXPORT", resourceType: "Receipt", resourceId: transactionId, patientId: String(tx.patientId), metadata: { receiptNumber: tx.receiptNumber } });
  const byId = new Map(invoices.map((i) => [String(i._id), i]));
  return {
    receiptNumber: tx.receiptNumber ?? "",
    paidAt: (tx as { updatedAt?: Date }).updatedAt ?? new Date(),
    amountCents: tx.amountCents,
    method: tx.cardBrand ? `${tx.cardBrand} ending ${tx.cardLast4 ?? ""}` : tx.method,
    testMode: tx.processor === "SIMULATED",
    billedTo: patient ? { name: `${patient.firstName} ${patient.lastName}`, accountNumber: patient.mrn } : null,
    allocations: tx.allocations.map((a) => {
      const inv = byId.get(String(a.invoiceId));
      return { invoiceNumber: inv?.invoiceNumber ?? "", lineItems: inv?.lineItems ?? [], appliedCents: a.amountCents, remainingCents: inv ? balance(inv) : 0 };
    }),
    installment: Boolean(tx.paymentPlanId),
  };
}
export type Receipt = Awaited<ReturnType<typeof getReceipt>>;

// ── Payment plans ───────────────────────────────────────────────────────────

export function planTerms(input: { invoiceNumber: string; totalCents: number; installments: number[]; firstDue: Date; cardLabel: string }) {
  const dates = input.installments.map((_, i) => {
    const d = new Date(input.firstDue);
    d.setUTCMonth(d.getUTCMonth() + i);
    return d;
  });
  const lines = input.installments.map((amount, i) => `  ${i + 1}. ${dollars(amount)} on ${day(dates[i])}`);
  const text = [
    `Payment plan for invoice ${input.invoiceNumber}: ${dollars(input.totalCents)} in ${input.installments.length} monthly payments.`,
    ...lines,
    `Each payment will be charged automatically to ${input.cardLabel}. The first payment is charged today.`,
    "There is no interest or fee for this plan. You can pay the remaining balance early at any time.",
    "If a payment fails, we'll email you and try again after 3 days. Two failed payments in a row end the plan and the remaining balance becomes due.",
  ].join("\n");
  return { text, dates };
}

/** Preview the terms before the client agrees. */
export async function previewPlan(ctx: AuthContext, invoiceId: string, installmentCount: number, now = new Date()) {
  requirePatient(ctx);
  if (!PLAN_INSTALLMENTS.includes(installmentCount as (typeof PLAN_INSTALLMENTS)[number])) throw new PaymentError("Choose 2, 3, 4, or 6 payments.");
  if (!Types.ObjectId.isValid(invoiceId)) throw new PaymentError("That invoice isn't available.");
  const invoice = await Invoice.findOne(await withScope(ctx, "invoice", { _id: invoiceId, publishedToPortal: true })).setOptions({ authz: authzToken(ctx) }).lean();
  if (!invoice) throw new PaymentError("That invoice isn't available.");
  if (!isOpen(invoice.status)) throw new PaymentError("That invoice is already paid or on a plan.");
  const total = balance(invoice);
  if (total < PLAN_MIN_CENTS) throw new PaymentError(`Payment plans are available for balances of ${dollars(PLAN_MIN_CENTS)} or more.`);
  const installments = splitInstallments(total, installmentCount);
  return { invoice: { id: String(invoice._id), invoiceNumber: invoice.invoiceNumber, lineItems: invoice.lineItems }, totalCents: total, installments, ...planTerms({ invoiceNumber: invoice.invoiceNumber, totalCents: total, installments, firstDue: now, cardLabel: "the card you save at enrollment" }) };
}

/**
 * Enroll in an autopay plan: save a card with the processor, record the typed
 * signature over the exact terms, move the invoice to IN_PAYMENT_PLAN, and
 * charge the first installment.
 */
export async function enrollPlan(ctx: AuthContext, input: { invoiceId: string; installmentCount: number; signatureName: string; ipAddress: string; userAgent?: string }, now = new Date()) {
  const patientId = requirePatient(ctx);
  await authorizeAny(ctx, "paymentPlan", "create");
  const preview = await previewPlan(ctx, input.invoiceId, input.installmentCount, now);
  const typed = input.signatureName.trim().replace(/\s+/g, " ");
  const expected = (ctx.displayName ?? "").trim().replace(/\s+/g, " ");
  if (typed.length < 3 || (expected && typed.toLowerCase() !== expected.toLowerCase())) throw new PaymentError(`Type your full name (${expected || "as it appears on your account"}) to sign.`);

  const method = await paymentProcessor().saveMethod();
  const { text, dates } = planTerms({ invoiceNumber: preview.invoice.invoiceNumber, totalCents: preview.totalCents, installments: preview.installments, firstDue: now, cardLabel: `${method.cardBrand} ending ${method.cardLast4}` });
  const signature = buildSignature({ content: text, signerId: ctx.userId, signerName: typed, signerRole: "PATIENT", ipAddress: input.ipAddress, userAgent: input.userAgent, method: "TYPED", signedAt: now });

  let planId = "";
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const plan = await createScoped(
        PaymentPlan,
        authzToken(ctx),
        {
          patientId,
          invoiceIds: [preview.invoice.id],
          totalCents: preview.totalCents,
          installmentCount: preview.installments.length,
          frequency: "MONTHLY",
          schedule: preview.installments.map((amountCents, i) => ({ dueDate: dates[i], amountCents, status: "SCHEDULED" })),
          autopay: true,
          stripePaymentMethodId: method.paymentMethodId,
          status: "ACTIVE",
          terms: text,
          agreement: signature,
        },
        { session },
      );
      planId = String(plan._id);
      const invoice = await Invoice.findById(preview.invoice.id).session(session).setOptions({ authz: SYSTEM });
      invoice!.status = "IN_PAYMENT_PLAN";
      invoice!.paymentPlanId = plan._id;
      await authorizeDoc(invoice!, SYSTEM).save({ session });
    });
  } finally {
    await session.endSession();
  }
  await recordAudit(ctx, { action: "SIGN", resourceType: "PaymentPlan", resourceId: planId, patientId, metadata: { invoice: preview.invoice.invoiceNumber, totalCents: preview.totalCents, installments: preview.installments.length, contentHash: signature.contentHash } });
  const first = await chargeDueInstallments(now, planId);
  return { planId, firstCharge: first.charged > 0 };
}

/**
 * Autopay: charge every due, unpaid installment (or just one plan's). Runs
 * from the billing cron and right after enrollment.
 */
export async function chargeDueInstallments(now = new Date(), onlyPlanId?: string) {
  const plans = await PaymentPlan.find({ status: "ACTIVE", autopay: true, ...(onlyPlanId ? { _id: onlyPlanId } : {}), schedule: { $elemMatch: { status: { $in: ["SCHEDULED", "FAILED"] }, dueDate: { $lte: now } } } })
    .setOptions({ authz: SYSTEM })
    .lean();
  let charged = 0;
  let failed = 0;
  for (const plan of plans) {
    for (const [index, item] of plan.schedule.entries()) {
      if (item.status === "PAID" || item.status === "SKIPPED" || item.dueDate > now) continue;
      const result = await paymentProcessor().chargeSavedMethod(plan.stripePaymentMethodId ?? "", item.amountCents, "AB Wellness payment plan installment");
      const tx = await createScoped(PaymentTransaction, SYSTEM, {
        patientId: plan.patientId,
        kind: "PAYMENT",
        allocations: [{ invoiceId: plan.invoiceIds[0], amountCents: item.amountCents }],
        amountCents: item.amountCents,
        method: "CARD",
        processor: paymentProcessor().id,
        processorReference: result.reference,
        status: "PENDING",
        paymentPlanId: plan._id,
        cardBrand: result.cardBrand,
        cardLast4: result.cardLast4,
      });
      if (!result.succeeded) {
        tx.status = "FAILED";
        tx.failureReason = result.failureReason;
        await authorizeDoc(tx, SYSTEM).save();
        await PaymentPlan.updateOne({ _id: plan._id }, { $set: { [`schedule.${index}.status`]: "FAILED" } }).setOptions({ authz: SYSTEM });
        failed += 1;
        continue;
      }
      const receiptNumber = await nextReceiptNumber();
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          tx.status = "SUCCEEDED";
          tx.receiptNumber = receiptNumber;
          await authorizeDoc(tx, SYSTEM).save({ session });
          await applyAllocations(tx, session, { planId: plan._id as Types.ObjectId, index });
        });
      } finally {
        await session.endSession();
      }
      await recordAudit(SYSTEM_ACTOR, { action: "CREATE", resourceType: "PaymentTransaction", resourceId: String(tx._id), patientId: String(plan.patientId), metadata: { autopay: true, installment: index + 1, amountCents: item.amountCents, receiptNumber } });
      charged += 1;
    }
  }
  return { charged, failed };
}

// ── Reminders ───────────────────────────────────────────────────────────────

/**
 * Email clients with an open balance that's due within 7 days or overdue, at
 * most once a week per invoice. The email has no amounts or health details.
 */
export async function sendPaymentReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const due = await Invoice.find({
    status: { $in: OPEN },
    publishedToPortal: true,
    dueDate: { $lte: soon },
    $or: [{ lastReminderAt: null }, { lastReminderAt: { $lte: weekAgo } }],
  })
    .setOptions({ authz: SYSTEM })
    .lean();
  const byPatient = new Map<string, typeof due>();
  for (const inv of due) byPatient.set(String(inv.patientId), [...(byPatient.get(String(inv.patientId)) ?? []), inv]);
  let sent = 0;
  for (const [patientId, invoices] of byPatient) {
    const patient = await Patient.findById(patientId, { email: 1, firstName: 1, preferredName: 1 }).setOptions({ authz: SYSTEM }).lean();
    if (!patient?.email) continue;
    await sendPaymentReminder(patient.email, patient.preferredName ?? patient.firstName);
    await Invoice.updateMany({ _id: { $in: invoices.map((i) => i._id) } }, { $set: { lastReminderAt: now } }).setOptions({ authz: SYSTEM });
    await recordAudit(SYSTEM_ACTOR, { action: "CREATE", resourceType: "PaymentReminder", patientId, metadata: { invoices: invoices.map((i) => i.invoiceNumber) } });
    sent += 1;
  }
  return { sent };
}

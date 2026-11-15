# EMR Phase 4: Patient Portal

Phase 4 builds the client-facing side of the platform at `/portal`. It's delivered in slices:

1. Billing and payments (Use Case 4), done
2. Appointments: booking, cancelling, and joining video visits, done
3. Consents, intake forms, and documents
4. Secure messages

## Slice 1: Billing and payments (Use Case 4)

The service code is in `lib/services/payments.ts`. The processor abstraction is in `lib/payments.ts`, the PDF receipt in `lib/receipt-pdf.ts`, and the pages under `app/portal/billing/*`.

### Paying invoices

- `/portal/billing` lists the client's open invoices (itemized), payment plans, and payment history with receipt downloads. Only invoices with `publishedToPortal` are shown.
- `startPayment` creates a PENDING `PaymentTransaction` with allocations to each invoice, then sends the client to the processor's checkout.
- `completePayment(actor, reference, charge)` confirms the payment. It's idempotent, because both the checkout return and a processor webhook may call it. In one transaction it:
  - marks the transaction SUCCEEDED,
  - assigns a receipt number (`RCT-YYYY-NNNNN`), and
  - applies the allocations to the invoices; the invoice model recalculates status, for example PAID.
- Staff A/R (`/dashboard/billing`, `/dashboard/billing/invoices`) reads invoices directly, so it reflects a payment as soon as it's made.

### Processor

- `PAYMENT_PROCESSOR` is unset by default, which uses `SIMULATED`. It sends the client to `/portal/billing/checkout/[ref]`, a clearly labeled test page that collects no card details. Receipts are stamped "TEST MODE".
- **Stripe isn't implemented yet.** The plan:
  - Stripe Checkout in payment mode for one-off payments, and setup mode to save a card for autopay.
  - The `checkout.session.completed` webhook calls `completePayment("system", …)`.
  - Required env vars: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
  - Keep health details out of Stripe descriptions and metadata. Use invoice numbers only.
- Card data never reaches our servers. We store only the processor reference, card brand, and last four digits.

### Receipts

`GET /portal/billing/receipts/[id]` returns an itemized one-page PDF. Access is checked through the `payment` resource (the client's own payments, or billing and admin staff). Each download is audited as an EXPORT of a `Receipt`.

### Payment plans

- Offered on open invoices of $100 or more, in 2, 3, 4, or 6 monthly payments. Installments are equal, with any remainder cents on the first.
- `/portal/billing/plan/[invoiceId]?n=3` shows the exact terms.
- To enroll, the client checks the agreement box and types their full name, which must match the account name. The typed signature (content hash, IP, user agent, time) is stored with the terms on the `PaymentPlan`.
- Enrolling saves a card with the processor, moves the invoice to IN_PAYMENT_PLAN, and immediately charges the first installment.
- `chargeDueInstallments(now)` charges each due installment and writes a transaction and receipt for it. When every installment is paid, the plan is COMPLETED and the invoice is PAID. A failed charge marks the installment FAILED and is retried on the next run.

### Reminders and cron

- `sendPaymentReminders(now)` emails clients whose invoices are due within 7 days or overdue, at most once a week per invoice (`Invoice.lastReminderAt`). The email has no amounts, services, or provider names, because Resend has no BAA. It only asks the client to sign in.
- `GET /api/cron/billing` runs autopay and then reminders. It's scheduled daily at 14:00 UTC in `vercel.json` and requires `Authorization: Bearer $CRON_SECRET`. **`CRON_SECRET` must be set in Vercel**, or the job returns 401.

### Tests

`tests/db/portal-payments.test.ts` covers:

- paying the $50 invoice, idempotency, cancelled checkouts, and access to other clients' invoices and receipts;
- the 3 × $80 plan from enrollment through completion;
- A/R updating after payment;
- reminder throttling, and that reminders contain no dollar amounts.

## Slice 2: Appointments

The service code is in `lib/services/portal-appointments.ts`, which wraps `scheduling.ts` with the client-side rules. The pages are under `app/portal/appointments/*`.

- **List** (`/portal/appointments`): upcoming visits with Join and Cancel, plus past and cancelled visits. Times are Eastern.
- **Booking** (`/portal/appointments/book`):
  - Clients book with their assigned provider only, and only `patientBookable` visit types. Office-only visits such as the initial evaluation aren't offered.
  - A week of openings is shown at half-hour starts; staff can still book any 15-minute slot.
  - Video visits require a current, signed `TELEHEALTH_CONSENT`. Without one, the page explains why and offers in-person visits.
  - Booking goes through `bookAppointment`, so the double-booking guard and the telehealth session are the same as for staff.
- **Cancelling** (`/portal/appointments/[id]/cancel`):
  - Before confirming, `cancellationPreview` shows the hours of notice and any fee under the client's signed financial agreement, for example the $75 fee inside 24 hours.
  - Clients can't waive fees. Waitlist matches are returned to staff only.
- **Video** (`/portal/appointments/[id]/visit`):
  - Join opens 15 minutes before the start and stays open until the scheduled end. It also requires the telehealth consent.
  - Joining checks the client in. The appointment becomes CHECKED_IN, the session becomes IN_WAITING_ROOM, and the client appears in the provider's waiting room.
  - The page refreshes every 10 seconds until the provider admits the client, then shows the in-session view. Video is the same mock tile as on the staff side.
- **Tests:** `tests/db/portal-appointments.test.ts` covers the visit list, booking rules (own provider, visit types, consent), fee and no-fee cancellations, and the join window.

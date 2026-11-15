import { randomBytes } from "node:crypto";

/**
 * Payment processor abstraction. Card data never touches our servers: the
 * client pays on the processor's hosted page, and we only keep a reference,
 * the card brand, and the last four digits.
 *
 * SIMULATED (default) sends the client to /portal/billing/checkout/[ref], a
 * clearly labeled test page that collects no card details, so the payment,
 * receipt, and payment-plan flows work end to end.
 *
 * STRIPE (PAYMENT_PROCESSOR=stripe) is planned: Stripe Checkout in payment
 * mode for one-off payments and setup mode to save a card for autopay, with the
 * checkout.session.completed webhook calling completePayment(). It needs
 * STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and a BAA-compatible setup (keep
 * health details out of Stripe metadata and descriptions).
 */

export interface CheckoutRequest {
  amountCents: number;
  /** Shown on the hosted page; never include clinical details. */
  description: string;
  returnPath: string;
}

export interface CheckoutSession {
  reference: string;
  url: string;
}

export interface ChargeResult {
  succeeded: boolean;
  reference: string;
  cardBrand?: string;
  cardLast4?: string;
  failureReason?: string;
}

export interface PaymentProcessor {
  readonly id: "SIMULATED" | "STRIPE";
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Save a payment method for autopay; returns a token (never card data). */
  saveMethod(): Promise<{ paymentMethodId: string; cardBrand: string; cardLast4: string }>;
  chargeSavedMethod(paymentMethodId: string, amountCents: number, description: string): Promise<ChargeResult>;
}

const token = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;

const simulated: PaymentProcessor = {
  id: "SIMULATED",
  async createCheckout() {
    const reference = token("sim_cs");
    return { reference, url: `/portal/billing/checkout/${reference}` };
  },
  async saveMethod() {
    return { paymentMethodId: token("sim_pm"), cardBrand: "Test card", cardLast4: "4242" };
  },
  async chargeSavedMethod() {
    return { succeeded: true, reference: token("sim_ch"), cardBrand: "Test card", cardLast4: "4242" };
  },
};

export function paymentProcessor(): PaymentProcessor {
  const configured = process.env.PAYMENT_PROCESSOR?.toLowerCase();
  if (configured && configured !== "simulated") {
    throw new Error(`Payment processor "${configured}" isn't implemented yet. See lib/payments.ts.`);
  }
  return simulated;
}

export const isTestMode = () => paymentProcessor().id === "SIMULATED";

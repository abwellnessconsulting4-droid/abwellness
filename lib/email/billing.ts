import "server-only";

import { SITE_NAME } from "@/lib/constants";
import { sendPlainEmail } from "@/lib/email/security";

/**
 * Billing notices. Resend has no BAA, so these never include amounts,
 * services, dates of service, or provider names: a nudge to sign in only.
 */
export function sendPaymentReminder(to: string, firstName: string) {
  const portal = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/portal/billing`;
  return sendPlainEmail(
    to,
    `A message about your ${SITE_NAME} account`,
    `Hi ${firstName},\n\nYou have a balance due on your ${SITE_NAME} account. Sign in to view it and pay securely, or set up a payment plan:\n${portal}\n\nIf you've already paid, thank you, and please ignore this message.`,
  );
}

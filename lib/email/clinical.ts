import "server-only";

import { SITE_NAME } from "@/lib/constants";
import { sendPlainEmail } from "@/lib/email/security";

/** Clinical notices to staff. No client names or health details (Resend has no BAA). */
export function sendSafetyAlert(to: string) {
  const dashboard = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard`;
  return sendPlainEmail(
    to,
    `Action needed: a client response needs your review (${SITE_NAME})`,
    `A client's questionnaire response needs your prompt review. Sign in to see the details:\n${dashboard}\n\nThis message intentionally contains no client information.`,
  );
}

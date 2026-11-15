import "server-only";

import { SITE_NAME } from "@/lib/constants";
import { sendPlainEmail } from "@/lib/email/security";

/** "You have a new message" only: never the subject, sender, or body (Resend has no BAA). */
export function sendNewMessageNotice(to: string, path: string) {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}${path}`;
  return sendPlainEmail(to, `You have a new secure message (${SITE_NAME})`, `You have a new secure message. Sign in to read it:\n${url}\n\nFor your privacy, we never include message contents in email.`);
}

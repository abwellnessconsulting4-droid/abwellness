import { Resend } from "resend";
import { SITE_NAME } from "@/lib/constants";

/**
 * Account-security emails (sign-in codes, password resets). Resend has no BAA,
 * so these messages must never contain health information: codes and links only.
 */

async function send(to: string, subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  // Seeded development accounts use example.com: print instead of emailing.
  const devRecipient = process.env.NODE_ENV !== "production" && /@example\.(com|org|net)$/i.test(to);
  // Explicit console transport for local production builds and end-to-end tests; never on Vercel production.
  const consoleTransport = process.env.EMAIL_TRANSPORT === "console" && process.env.VERCEL_ENV !== "production";
  if (consoleTransport) {
    console.info(`[console email] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  if (!apiKey || devRecipient) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is required to send security emails.");
    console.info(`[dev email] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  const from = process.env.RESEND_FROM_EMAIL ?? `${SITE_NAME} <onboarding@resend.dev>`;
  const { error } = await new Resend(apiKey).emails.send({ from, to, subject, text });
  if (error) throw new Error(`Security email failed: ${error.message}`);
}

export function sendSignInCode(to: string, code: string) {
  return send(
    to,
    `Your ${SITE_NAME} sign-in code`,
    `Your sign-in code is ${code}. It expires in 5 minutes.\n\nIf you didn't try to sign in, you can ignore this email and consider changing your password.`,
  );
}

export function sendPasswordReset(to: string, url: string) {
  return send(
    to,
    `Reset your ${SITE_NAME} password`,
    `Use this link to reset your password (valid for 1 hour):\n${url}\n\nIf you didn't request this, you can ignore this email.`,
  );
}

export function sendInvitation(to: string, name: string, url: string) {
  return send(
    to,
    `You're invited to ${SITE_NAME}`,
    `Hi ${name},\n\nAn administrator created a staff account for you. Use this link to set your password (valid for 24 hours):\n${url}\n\nAfter that you'll set up two-step verification. If you weren't expecting this, you can ignore this email.`,
  );
}

export function sendEmailVerification(to: string, url: string) {
  return send(to, `Confirm your email for ${SITE_NAME}`, `Confirm your email address to finish setting up your account:\n${url}`);
}

/** Shared plain-text sender for other non-PHI notices (e.g. billing reminders). */
export { send as sendPlainEmail };

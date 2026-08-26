import { Resend } from "resend";
import { WaitlistConfirmationEmail } from "@/components/email/waitlist-confirmation";
import { WaitlistNotificationEmail } from "@/components/email/waitlist-notification";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/constants";

function getFromAddress() {
  return (
    process.env.RESEND_FROM_EMAIL ??
    `${SITE_NAME} <onboarding@resend.dev>`
  );
}

function getNotifyAddress() {
  return process.env.WAITLIST_NOTIFY_EMAIL ?? CONTACT_EMAIL;
}

export async function sendWaitlistEmails(subscriberEmail: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.warn("RESEND_API_KEY is not set. Skipping waitlist emails.");
    return;
  }

  const resend = new Resend(apiKey);
  const from = getFromAddress();
  const notify = getNotifyAddress();

  const confirmation = await resend.emails.send(
    {
      from,
      to: [subscriberEmail],
      replyTo: CONTACT_EMAIL,
      subject: `You're on the ${SITE_NAME} waitlist`,
      react: WaitlistConfirmationEmail(),
      text: `Thank you for joining the ${SITE_NAME} waitlist. We'll write when consultations and programs open. ${SITE_NAME} — Solutions for growth. Support for life.`,
      tags: [{ name: "type", value: "waitlist-confirmation" }],
    },
    { idempotencyKey: `waitlist-confirmation-${subscriberEmail}` },
  );

  if (confirmation.error) {
    console.error("Failed to send waitlist confirmation", confirmation.error);
  }

  if (notify && notify !== subscriberEmail) {
    const notification = await resend.emails.send(
      {
        from,
        to: [notify],
        replyTo: subscriberEmail,
        subject: `New waitlist signup: ${subscriberEmail}`,
        react: WaitlistNotificationEmail({ email: subscriberEmail }),
        text: `A new subscriber joined the waitlist: ${subscriberEmail}`,
        tags: [{ name: "type", value: "waitlist-notification" }],
      },
      { idempotencyKey: `waitlist-notification-${subscriberEmail}` },
    );

    if (notification.error) {
      console.error("Failed to send waitlist notification", notification.error);
    }
  }
}

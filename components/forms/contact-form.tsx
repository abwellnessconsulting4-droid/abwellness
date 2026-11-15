"use client";

import { Input, Row, Textarea } from "@once-ui-system/core";
import { PreviewForm } from "@/components/forms/preview-form";

export function ContactForm() {
  return (
    <PreviewForm submitLabel="Send message" successTitle="Thanks for reaching out">
      <Row gap="16" fillWidth s={{ direction: "column" }}>
        <Input id="contact-name" name="name" label="Full name" autoComplete="name" required />
        <Input id="contact-email" name="email" type="email" label="Email" autoComplete="email" required />
      </Row>
      <Input id="contact-phone" name="phone" type="tel" label="Phone (optional)" autoComplete="tel" />
      <Input id="contact-subject" name="subject" label="Subject" required />
      <Textarea
        id="contact-message"
        name="message"
        label="Message"
        lines={5}
        required
        description="Please don't include medical or other sensitive details here. We'll collect what we need securely."
      />
    </PreviewForm>
  );
}

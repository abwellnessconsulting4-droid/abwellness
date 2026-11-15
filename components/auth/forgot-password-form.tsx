"use client";

import { useState, type FormEvent } from "react";
import { Button, Column, Feedback, Input } from "@once-ui-system/core";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    // Same response whether or not the account exists (no account enumeration).
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <Feedback
        variant="success"
        title="Check your email"
        description="If an account uses that address, we've sent a link to reset your password. It expires in 24 hours."
      />
    );
  }
  return (
    <form onSubmit={handleSubmit} className="fill-width">
      <Column fillWidth gap="16">
        <Input id="forgot-email" name="email" type="email" label="Email" autoComplete="username" required autoFocus />
        <Button type="submit" variant="primary" size="l" fillWidth label="Send reset link" loading={pending} disabled={pending} />
      </Column>
    </form>
  );
}

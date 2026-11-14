"use client";

import { useState, type FormEvent } from "react";
import { Button, Column, Feedback, Input, PasswordInput } from "@once-ui-system/core";
import { authClient } from "@/lib/auth-client";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match. Check them and try again.",
  EMAIL_NOT_VERIFIED: "Please confirm your email address first. Check your inbox for the link we sent.",
  TOO_MANY_REQUESTS: "Too many attempts. Wait a minute, then try again.",
};

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { data, error: signInError } = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });

    if (signInError) {
      const code = signInError.code ?? (signInError.status === 429 ? "TOO_MANY_REQUESTS" : "");
      setError(MESSAGES[code] ?? "We couldn't sign you in. Please try again.");
      setPending(false);
      return;
    }
    // Accounts with two-step login continue on the verify page (twoFactorClient redirects there).
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return;
    window.location.assign(next); // full load so the server reads the fresh session
  }

  return (
    <form onSubmit={handleSubmit} className="fill-width" noValidate={false}>
      <Column fillWidth gap="16">
        <Input id="login-email" name="email" type="email" label="Email" autoComplete="username" required autoFocus />
        <PasswordInput id="login-password" name="password" label="Password" autoComplete="current-password" required />
        <div aria-live="polite">{error && <Feedback variant="danger" description={error} />}</div>
        <Button type="submit" variant="primary" size="l" fillWidth loading={pending} disabled={pending} label="Sign in" />
      </Column>
    </form>
  );
}

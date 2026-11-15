"use client";

import { useState, type FormEvent } from "react";
import { Button, Column, Feedback, PasswordInput, Text } from "@once-ui-system/core";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token, invite }: { token: string; invite: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== String(form.get("confirm") ?? "")) return setError("The two passwords don't match.");

    setPending(true);
    setError(null);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
    if (resetError) {
      setPending(false);
      setError(
        resetError.code === "INVALID_TOKEN"
          ? "This link has expired or was already used. Ask for a new one."
          : resetError.code === "PASSWORD_TOO_SHORT"
            ? "Use at least 12 characters."
            : "We couldn't set your password. Please try again.",
      );
      return;
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load into a clean sign-in
    window.location.href = `/login?reason=${invite ? "account_ready" : "password_reset"}`;
  }

  return (
    <form onSubmit={handleSubmit} className="fill-width">
      <Column fillWidth gap="16">
        <PasswordInput id="new-password" name="password" label="New password" autoComplete="new-password" required minLength={12} />
        <PasswordInput id="confirm-password" name="confirm" label="Confirm new password" autoComplete="new-password" required minLength={12} />
        <Text variant="body-default-xs" onBackground="neutral-weak">
          At least 12 characters. A short phrase of unrelated words is strong and easy to remember.
        </Text>
        <div aria-live="polite">{error && <Feedback variant="danger" description={error} />}</div>
        <Button type="submit" variant="primary" size="l" fillWidth label={invite ? "Create my password" : "Set new password"} loading={pending} disabled={pending} />
      </Column>
    </form>
  );
}

"use client";

import { useState, useSyncExternalStore } from "react";
import { Button, Column, Feedback, Input, OTPInput, Row, SegmentedControl, Text } from "@once-ui-system/core";
import { authClient } from "@/lib/auth-client";

type Method = "totp" | "email" | "backup";
const METHOD_KEY = "abw:2fa-method";

const ERRORS: Record<string, string> = {
  INVALID_CODE: "That code isn't right. Try again.",
  INVALID_TWO_FACTOR_COOKIE: "This sign-in attempt expired. Please sign in again.",
  OTP_HAS_EXPIRED: "That code expired. Request a new one.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Too many attempts. Request a new code.",
  INVALID_BACKUP_CODE: "That backup code isn't valid or was already used.",
};

function readMethod(): Method {
  try {
    const saved = window.localStorage.getItem(METHOD_KEY);
    return saved === "email" || saved === "backup" ? saved : "totp";
  } catch {
    return "totp";
  }
}

const noSubscribe = () => () => {};

export function TwoFactorVerify({ next }: { next: string }) {
  // Last-used method in this browser; the server render always starts on the authenticator tab.
  const saved = useSyncExternalStore(noSubscribe, readMethod, () => "totp" as Method);
  const [chosen, setChosen] = useState<Method | null>(null);
  const method = chosen ?? saved;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [attempt, setAttempt] = useState(0); // remounts the code input after a failure

  function choose(value: Method) {
    setChosen(value);
    setError(null);
    try {
      window.localStorage.setItem(METHOD_KEY, value);
    } catch {
      // ignore (private mode)
    }
  }

  async function finish(result: { error: { code?: string; message?: string } | null }) {
    if (result.error) {
      setError(ERRORS[result.error.code ?? ""] ?? "We couldn't verify that code. Please try again.");
      setPending(false);
      setAttempt((n) => n + 1);
      return;
    }
    window.location.assign(next); // full load so the server reads the new session
  }

  async function verify(code: string) {
    setPending(true);
    setError(null);
    if (method === "totp") return finish(await authClient.twoFactor.verifyTotp({ code }));
    if (method === "email") return finish(await authClient.twoFactor.verifyOtp({ code }));
    return finish(await authClient.twoFactor.verifyBackupCode({ code }));
  }

  async function sendEmail() {
    setPending(true);
    setError(null);
    const { error: sendError } = await authClient.twoFactor.sendOtp();
    setPending(false);
    if (sendError) setError(ERRORS[sendError.code ?? ""] ?? "We couldn't send a code. Please sign in again.");
    else setEmailSent(true);
  }

  return (
    <Column fillWidth gap="20">
      <SegmentedControl
        selected={method}
        onToggle={(value) => choose(value as Method)}
        buttons={[
          { value: "totp", label: "Authenticator app" },
          { value: "email", label: "Email code" },
          { value: "backup", label: "Backup code" },
        ]}
      />

      {method === "totp" && (
        <Column gap="12">
          <Text variant="body-default-s" onBackground="neutral-medium">
            Enter the 6-digit code from your authenticator app.
          </Text>
          <OTPInput key={`totp-${attempt}`} length={6} autoFocus disabled={pending} onComplete={verify} aria-label="Authenticator code" />
        </Column>
      )}

      {method === "email" && (
        <Column gap="12">
          {!emailSent ? (
            <>
              <Text variant="body-default-s" onBackground="neutral-medium">
                We&apos;ll email a 6-digit code to the address on your account. It expires in 5 minutes.
              </Text>
              <Row>
                <Button variant="secondary" label="Email me a code" loading={pending} onClick={sendEmail} />
              </Row>
            </>
          ) : (
            <>
              <Text variant="body-default-s" onBackground="neutral-medium">
                Enter the code we just emailed you.
              </Text>
              <OTPInput key={`email-${attempt}`} length={6} autoFocus disabled={pending} onComplete={verify} aria-label="Emailed code" />
              <Row>
                <Button variant="tertiary" size="s" label="Send a new code" onClick={sendEmail} disabled={pending} />
              </Row>
            </>
          )}
        </Column>
      )}

      {method === "backup" && (
        <form
          className="fill-width"
          onSubmit={(event) => {
            event.preventDefault();
            void verify(String(new FormData(event.currentTarget).get("code") ?? "").trim());
          }}
        >
          <Column gap="12">
            <Input id="backup-code" name="code" label="Backup code" autoComplete="one-time-code" required />
            <Button type="submit" variant="primary" label="Verify" loading={pending} />
          </Column>
        </form>
      )}

      <div aria-live="polite">{error && <Feedback variant="danger" description={error} />}</div>
    </Column>
  );
}

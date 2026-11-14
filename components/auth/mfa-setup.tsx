"use client";

import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import {
  Button,
  Checkbox,
  Column,
  Feedback,
  Grid,
  InlineCode,
  OTPInput,
  PasswordInput,
  Row,
  SegmentedControl,
  Text,
} from "@once-ui-system/core";
import { authClient } from "@/lib/auth-client";

type Method = "totp" | "email";
type Step = "choose" | "verify" | "backup";

const ERRORS: Record<string, string> = {
  INVALID_PASSWORD: "That password isn't right.",
  INVALID_CODE: "That code isn't right. Check your app and try again.",
  OTP_HAS_EXPIRED: "That code expired. Send a new one.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Too many attempts. Send a new code.",
};

function messageFor(error: { code?: string } | null, fallback: string) {
  return (error && ERRORS[error.code ?? ""]) || fallback;
}

/** The base32 secret from an otpauth:// URI, for manual entry. */
function secretFrom(uri: string) {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

export function MfaSetup() {
  const [method, setMethod] = useState<Method>("totp");
  const [step, setStep] = useState<Step>("choose");
  const [password, setPassword] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    if (method === "totp") {
      const { data, error: enableError } = await authClient.twoFactor.enable({ password, method: "totp" });
      if (enableError || !data || !("totpURI" in data)) {
        setError(messageFor(enableError, "We couldn't start setup. Please try again."));
        setPending(false);
        return;
      }
      setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }));
      setSecret(secretFrom(data.totpURI));
      setBackupCodes(data.backupCodes);
    } else {
      // Emailed codes go to the account's verified address; we still confirm one arrives.
      const { error: enableError } = await authClient.twoFactor.enable({ password, method: "otp" });
      if (enableError) {
        setError(messageFor(enableError, "We couldn't start setup. Please try again."));
        setPending(false);
        return;
      }
      await authClient.twoFactor.sendOtp();
    }
    setPending(false);
    setStep("verify");
  }

  async function confirm(code: string) {
    setPending(true);
    setError(null);
    const result = method === "totp" ? await authClient.twoFactor.verifyTotp({ code }) : await authClient.twoFactor.verifyOtp({ code });
    if (result.error) {
      setError(messageFor(result.error, "We couldn't verify that code."));
      setPending(false);
      setAttempt((n) => n + 1);
      return;
    }
    if (method === "email") {
      // Better Auth keeps backup codes on the authenticator-app record, which email-only users
      // don't have. Starting (not finishing) an app registration creates that record and returns
      // real single-use codes; the unused app secret is discarded and can be replaced later.
      const { data } = await authClient.twoFactor.enable({ password, method: "totp" });
      setBackupCodes(data && "backupCodes" in data ? data.backupCodes : []);
    }
    setPassword("");
    setPending(false);
    setStep("backup");
  }

  function downloadCodes() {
    const blob = new Blob([`AB Wellness Consulting backup codes\nEach code works once.\n\n${backupCodes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: "ab-wellness-backup-codes.txt" });
    link.click();
    URL.revokeObjectURL(url);
  }

  if (step === "choose") {
    return (
      <form onSubmit={start} className="fill-width">
        <Column fillWidth gap="20">
          <SegmentedControl
            selected={method}
            onToggle={(value) => setMethod(value as Method)}
            buttons={[
              { value: "totp", label: "Authenticator app" },
              { value: "email", label: "Email codes" },
            ]}
          />
          <Text variant="body-default-s" onBackground="neutral-medium">
            {method === "totp"
              ? "Recommended. Use an app like Google Authenticator, Microsoft Authenticator, or 1Password to get a new code every 30 seconds."
              : "We'll email a code to the address on your account each time you sign in."}
          </Text>
          <PasswordInput
            id="mfa-password"
            label="Confirm your password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <div aria-live="polite">{error && <Feedback variant="danger" description={error} />}</div>
          <Button type="submit" variant="primary" size="l" fillWidth label="Continue" loading={pending} disabled={!password || pending} />
        </Column>
      </form>
    );
  }

  if (step === "verify") {
    return (
      <Column fillWidth gap="20">
        {method === "totp" ? (
          <>
            <Text variant="body-default-s" onBackground="neutral-medium">
              Scan this code with your authenticator app, then enter the 6-digit code it shows.
            </Text>
            {qr && (
              <Row horizontal="center">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated in the browser */}
                <img src={qr} width={220} height={220} alt="QR code to add AB Wellness to your authenticator app" className="mfa-qr" />
              </Row>
            )}
            <Text variant="body-default-xs" onBackground="neutral-weak">
              Can&apos;t scan? Enter this key manually: <InlineCode className="notranslate">{secret}</InlineCode>
            </Text>
          </>
        ) : (
          <Text variant="body-default-s" onBackground="neutral-medium">
            We emailed you a 6-digit code. Enter it to finish setup.
          </Text>
        )}
        <OTPInput key={attempt} length={6} autoFocus disabled={pending} onComplete={confirm} aria-label="Verification code" />
        {method === "email" && (
          <Row>
            <Button variant="tertiary" size="s" label="Send a new code" onClick={() => void authClient.twoFactor.sendOtp()} />
          </Row>
        )}
        <div aria-live="polite">{error && <Feedback variant="danger" description={error} />}</div>
      </Column>
    );
  }

  return (
    <Column fillWidth gap="20">
      <Feedback variant="success" title="Two-step verification is on" description="Save these backup codes. Each one works once if you lose access to your phone or email." />
      {backupCodes.length === 0 && (
        <Feedback variant="warning" description="We couldn't create backup codes right now. You can still continue; ask the office to help if you ever lose access to your email." />
      )}
      <Grid columns="2" gap="8" className="notranslate" aria-label="Backup codes">
        {backupCodes.map((code) => (
          <InlineCode key={code}>{code}</InlineCode>
        ))}
      </Grid>
      <Row gap="8" wrap>
        <Button variant="secondary" size="s" label="Download codes" onClick={downloadCodes} />
        <Button variant="secondary" size="s" label="Copy codes" onClick={() => void navigator.clipboard.writeText(backupCodes.join("\n"))} />
      </Row>
      <Checkbox label="I saved my backup codes somewhere safe" isChecked={saved} onToggle={() => setSaved((v) => !v)} />
      <Button
        variant="primary"
        size="l"
        fillWidth
        label="Continue"
        disabled={!saved}
        // Full load so the server reads the upgraded (MFA) session.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        onClick={() => window.location.assign("/account")}
      />
    </Column>
  );
}

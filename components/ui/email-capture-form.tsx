"use client";

import { useState, type FormEvent } from "react";
import { Button, Column, Feedback, Input, Text } from "@once-ui-system/core";
import { Mail } from "lucide-react";
import { normalizeEmail, validateEmail } from "@/lib/validations";
import type { SubscribeResponse } from "@/types";

type FormStatus = "idle" | "loading" | "success" | "error";

export function EmailCaptureForm() {
  const [email, setEmail] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);

  function runValidation(value: string) {
    const error = validateEmail(value);
    setInlineError(error);
    return error;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = normalizeEmail(email);
    if (runValidation(normalized)) {
      return;
    }

    setStatus("loading");
    setNotice(null);

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });

      const data = (await response.json()) as SubscribeResponse;

      if (!response.ok || !data.success) {
        setStatus("error");
        setNotice(data.message || "Unable to save your email right now.");
        return;
      }

      setStatus("success");
      setNotice(data.message);
      setEmail("");
      setInlineError(null);
    } catch {
      setStatus("error");
      setNotice("Something went wrong. Please try again in a moment.");
    }
  }

  return (
    <Column fillWidth maxWidth="xs">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex w-full flex-col gap-4"
      >
        <Input
          id="waitlist-email"
          name="email"
          type="email"
          label="Email address"
          placeholder="you@example.com"
          value={email}
          autoComplete="email"
          inputMode="email"
          hasPrefix={<Mail size={16} aria-hidden="true" />}
          disabled={status === "loading"}
          error={Boolean(inlineError)}
          errorMessage={inlineError ?? undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            if (inlineError) {
              runValidation(event.target.value);
            }
          }}
          onBlur={(event) => runValidation(event.target.value)}
        />
        <Button
          type="submit"
          fillWidth
          loading={status === "loading"}
          disabled={status === "loading"}
        >
          Notify me at launch
        </Button>
        <Text
          variant="label-default-s"
          onBackground="neutral-weak"
          align="center"
        >
          No spam. Just a note when we open the doors.
        </Text>
        {notice ? (
          <Feedback
            variant={status === "success" ? "success" : "danger"}
            title={
              status === "success" ? "You're on the list" : "Unable to subscribe"
            }
            description={notice}
          />
        ) : null}
      </form>
    </Column>
  );
}

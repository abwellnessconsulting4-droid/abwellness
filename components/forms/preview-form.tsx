"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Column, Feedback } from "@once-ui-system/core";

interface PreviewFormProps {
  submitLabel: string;
  /** Extra checks beyond native `required` validation; return an error message or null. */
  validate?: () => string | null;
  successTitle: string;
  children: ReactNode;
}

/**
 * Wraps the public-site forms during the client preview. Fields validate normally,
 * but nothing is sent or stored: these forms will collect personal and health
 * information, which waits on the secure backend from the Phase 1 design.
 */
export function PreviewForm({ submitLabel, validate, successTitle, children }: PreviewFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const message = validate?.() ?? null;
    setError(message);
    setSubmitted(message === null);
  }

  return (
    <form onSubmit={handleSubmit} className="fill-width">
      <Column fillWidth gap="16">
        {children}
        <div aria-live="polite">
          {error && <Feedback variant="danger" description={error} />}
          {submitted && (
            <Feedback
              variant="success"
              title={successTitle}
              description="Preview only: this form isn't connected yet, so nothing was sent or saved."
            />
          )}
        </div>
        <Button type="submit" variant="primary" size="l" fillWidth label={submitLabel} />
      </Column>
    </form>
  );
}

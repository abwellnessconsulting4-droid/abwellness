"use client";

import { useActionForm } from "@/components/use-action-form";

import { Button, Column, Feedback, Input, Row, Text } from "@once-ui-system/core";
import type { RecordsState } from "@/app/portal/records-actions";

type Action = (state: RecordsState, form: FormData) => Promise<RecordsState>;

export function UploadForm({ action, categories }: { action: Action; categories: { value: string; label: string }[] }) {
  const [state, formAction, pending] = useActionForm(action, {});
  return (
    <form {...formAction} className="fill-width">
      <Column gap="12">
        <Row gap="12" wrap s={{ direction: "column" }}>
          <label className="native-field">
            <span>What is it?</span>
            <select name="category" required defaultValue="">
              <option value="" disabled>Choose a type</option>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="native-field">
            <span>File (PDF, JPEG, PNG, or WebP, up to 4 MB)</span>
            <input type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp" />
          </label>
        </Row>
        <div aria-live="polite">
          {state.error && <Feedback variant="danger" description={state.error} />}
          {state.success && <Feedback variant="success" description={state.success} />}
        </div>
        <Row>
          <Button type="submit" variant="primary" label="Upload securely" prefixIcon="shield" loading={pending} disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

export function ConsentSignForm({ action, contentHash, expectedName }: { action: Action; contentHash: string; expectedName: string }) {
  const [state, formAction, pending] = useActionForm(action, {});
  return (
    <form {...formAction} className="fill-width">
      <input type="hidden" name="contentHash" value={contentHash} />
      <Column gap="12">
        <label className="native-check">
          <input type="checkbox" name="agree" required /> I have read and understand this form, and I agree to it.
        </label>
        <Input id="signatureName" name="signatureName" label={`Type your full name to sign (${expectedName})`} required autoComplete="name" />
        <Text variant="body-default-xs" onBackground="neutral-weak">
          Typing your name is your electronic signature. We record the date, time, and your device&apos;s network address with it, and you can download a copy anytime.
        </Text>
        {state.error && <Feedback variant="danger" description={state.error} />}
        <Row>
          <Button type="submit" variant="primary" label="Sign" loading={pending} disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

export function ScreenerForm({ action, items, choices, intro }: { action: Action; items: readonly string[]; choices: readonly string[]; intro: string }) {
  const [state, formAction, pending] = useActionForm(action, {});
  return (
    <form {...formAction} className="fill-width">
      <Column gap="20">
        <Text variant="body-default-m">{intro}</Text>
        {items.map((item, i) => (
          <fieldset key={i} className="screener-item">
            <legend>
              <span className="screener-number">{i + 1}.</span> {item}
            </legend>
            <div className="screener-choices">
              {choices.map((choice, value) => (
                <label key={value} className="screener-choice">
                  <input type="radio" name={`q${i}`} value={value} required />
                  <span>{choice}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {state.error && <Feedback variant="danger" description={state.error} />}
        <Row>
          <Button type="submit" variant="primary" label="Submit answers" loading={pending} disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

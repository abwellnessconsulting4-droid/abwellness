"use client";

import { useActionState, useState } from "react";
import { Button, Column, Feedback, Input, Row, Text } from "@once-ui-system/core";
import type { PayState } from "@/app/portal/billing/actions";

type Action = (state: PayState, form: FormData) => Promise<PayState>;
const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Pick open invoices and go to checkout. */
export function PayInvoices({ action, invoices }: { action: Action; invoices: { id: string; label: string; balanceCents: number }[] }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [selected, setSelected] = useState<string[]>(invoices.length === 1 ? [invoices[0].id] : []);
  const total = invoices.filter((i) => selected.includes(i.id)).reduce((n, i) => n + i.balanceCents, 0);
  return (
    <form action={formAction}>
      <Column gap="12">
        <fieldset className="plain-fieldset">
          <legend className="sr-only">Invoices to pay</legend>
          <Column gap="8">
            {invoices.map((i) => (
              <label key={i.id} className="native-check">
                <input
                  type="checkbox"
                  name="invoiceId"
                  value={i.id}
                  checked={selected.includes(i.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id))}
                />
                {i.label}: {money(i.balanceCents)}
              </label>
            ))}
          </Column>
        </fieldset>
        {state.error && <Feedback variant="danger" description={state.error} />}
        <Row>
          <Button type="submit" variant="primary" label={total > 0 ? `Pay ${money(total)}` : "Pay"} loading={pending} disabled={pending || total === 0} />
        </Row>
      </Column>
    </form>
  );
}

/** Simulated checkout: confirm or cancel (no card details collected). */
export function TestCheckout({ action, amountCents }: { action: Action; amountCents: number }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <Column gap="12">
        {state.error && <Feedback variant="danger" description={state.error} />}
        <Row gap="8" wrap>
          <Button type="submit" name="intent" value="confirm" variant="primary" label={`Pay ${money(amountCents)} (test)`} loading={pending} disabled={pending} />
          <Button type="submit" name="intent" value="cancel" variant="tertiary" label="Cancel" disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

/** Agree to plan terms with a typed signature. */
export function PlanAgreement({ action, expectedName }: { action: Action; expectedName: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="fill-width">
      <Column gap="12">
        <label className="native-check">
          <input type="checkbox" name="agree" required /> I agree to these payment plan terms and authorize the automatic payments listed above.
        </label>
        <Input id="signatureName" name="signatureName" label={`Type your full name to sign (${expectedName})`} required autoComplete="name" />
        <Text variant="body-default-xs" onBackground="neutral-weak">
          Typing your name is your electronic signature. We record the date, time, and your device&apos;s network address with it.
        </Text>
        {state.error && <Feedback variant="danger" description={state.error} />}
        <Row>
          <Button type="submit" variant="primary" label="Sign and start plan" loading={pending} disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

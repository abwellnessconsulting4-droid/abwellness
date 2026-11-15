"use client";

import { useActionForm } from "@/components/use-action-form";

import { Button, Column, Feedback, Input, Row, Text } from "@once-ui-system/core";
import type { PortalApptState } from "@/app/portal/appointments/actions";

type Action = (state: PortalApptState, form: FormData) => Promise<PortalApptState>;

/** One button per open time; each submits the booking. */
export function SlotPicker({ action, providerId, visitType, mode, days }: { action: Action; providerId: string; visitType: string; mode: string; days: { label: string; slots: { iso: string; label: string }[] }[] }) {
  const [state, formAction, pending] = useActionForm(action, {});
  return (
    <form {...formAction}>
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="visitType" value={visitType} />
      <input type="hidden" name="mode" value={mode} />
      <Column gap="16">
        {state.error && <Feedback variant="danger" description={state.error} />}
        {days.map((d) => (
          <Column key={d.label} gap="8">
            <Text variant="label-strong-m">{d.label}</Text>
            {d.slots.length === 0 ? (
              <Text variant="body-default-xs" onBackground="neutral-weak">No openings</Text>
            ) : (
              <Row gap="8" wrap>
                {d.slots.map((s) => (
                  <Button key={s.iso} type="submit" name="start" value={s.iso} size="s" variant="secondary" label={s.label} disabled={pending} aria-label={`Book ${d.label} at ${s.label}`} />
                ))}
              </Row>
            )}
          </Column>
        ))}
      </Column>
    </form>
  );
}

export function CancelForm({ action, late }: { action: Action; late: boolean }) {
  const [state, formAction, pending] = useActionForm(action, {});
  return (
    <form {...formAction} className="fill-width">
      <Column gap="12">
        <Input id="reason" name="reason" label="Reason (shared with your care team)" required minLength={3} />
        {state.error && <Feedback variant="danger" description={state.error} />}
        <Row>
          <Button type="submit" variant="danger" label={late ? "Cancel and accept the fee" : "Cancel appointment"} loading={pending} disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

export function JoinButton({ action }: { action: (state: PortalApptState) => Promise<PortalApptState> }) {
  const [state, formAction, pending] = useActionForm(action, {});
  return (
    <form {...formAction}>
      <Row gap="8" vertical="center" wrap>
        <Button type="submit" size="s" variant="primary" label="Join video visit" loading={pending} disabled={pending} />
        {state.error && <Text variant="body-default-xs" onBackground="danger-medium">{state.error}</Text>}
      </Row>
    </form>
  );
}

/** Post-visit rating: 1–5 stars and an optional comment. */
export function RateVisit({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionForm(action, {});
  return (
    <details className="action-panel inline-panel">
      <summary>
        <Text variant="label-strong-s">Rate this visit</Text>
      </summary>
      <form {...formAction} className="fill-width">
        <Column gap="8" paddingTop="8">
          <fieldset className="star-rating">
            <legend>How was your visit?</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n}>
                <input type="radio" name="rating" value={n} required />
                <span aria-hidden="true">★</span>
                <span className="sr-only">{n} {n === 1 ? "star" : "stars"}</span>
              </label>
            ))}
          </fieldset>
          <Input id="comment" name="comment" label="Anything to share? (optional)" maxLength={1000} />
          {state.error && <Feedback variant="danger" description={state.error} />}
          <Row>
            <Button type="submit" size="s" variant="primary" label="Send rating" loading={pending} disabled={pending} />
          </Row>
        </Column>
      </form>
    </details>
  );
}

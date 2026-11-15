"use client";

import { useActionState } from "react";
import { Button, Column, Feedback, Input, Row, Text } from "@once-ui-system/core";
import type { PortalApptState } from "@/app/portal/appointments/actions";

type Action = (state: PortalApptState, form: FormData) => Promise<PortalApptState>;

/** One button per open time; each submits the booking. */
export function SlotPicker({ action, providerId, visitType, mode, days }: { action: Action; providerId: string; visitType: string; mode: string; days: { label: string; slots: { iso: string; label: string }[] }[] }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
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
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="fill-width">
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
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <Row gap="8" vertical="center" wrap>
        <Button type="submit" size="s" variant="primary" label="Join video visit" loading={pending} disabled={pending} />
        {state.error && <Text variant="body-default-xs" onBackground="danger-medium">{state.error}</Text>}
      </Row>
    </form>
  );
}

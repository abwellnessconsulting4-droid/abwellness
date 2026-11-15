"use client";

import { useActionForm } from "@/components/use-action-form";

import { Button, Column, Feedback, Input, Row, Text } from "@once-ui-system/core";
import { appointmentAction, bookAction, bookFromWaitlistAction } from "@/app/dashboard/schedule/actions";

function WaitlistBook({ entryId, patientName, slot }: { entryId: string; patientName: string; slot: { providerId: string; mode: string; visitType: string; start: string } }) {
  const [state, action, pending] = useActionForm(bookFromWaitlistAction, {});
  if (state.success) return <Feedback variant="success" description={`${patientName}: ${state.success}`} />;
  return (
    <form {...action}>
      <input type="hidden" name="entryId" value={entryId} />
      {Object.entries(slot).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Row gap="8" vertical="center">
        <Button type="submit" size="s" variant="primary" label={`Book ${patientName}`} loading={pending} />
        {state.error && <Text variant="body-default-xs" onBackground="danger-medium">{state.error}</Text>}
      </Row>
    </form>
  );
}

export function AppointmentActions({ appointmentId, status, startsInPast }: { appointmentId: string; status: string; startsInPast: boolean }) {
  const [state, action, pending] = useActionForm(appointmentAction, {});
  const active = ["SCHEDULED", "CONFIRMED", "CHECKED_IN"].includes(status);
  if (!active && !state.success) return null;

  return (
    <Column gap="8">
      {active && !state.cancel && (
        <Row gap="8" wrap>
          {["SCHEDULED", "CONFIRMED"].includes(status) && (
            <form {...action}>
              <input type="hidden" name="appointmentId" value={appointmentId} />
              <input type="hidden" name="intent" value="check-in" />
              <Button type="submit" size="s" variant="secondary" label="Check in" disabled={pending} />
            </form>
          )}
          {startsInPast && (
            <form {...action}>
              <input type="hidden" name="appointmentId" value={appointmentId} />
              <input type="hidden" name="intent" value="no-show" />
              <Button type="submit" size="s" variant="tertiary" label="No-show" disabled={pending} />
            </form>
          )}
          <details className="action-panel inline-panel">
            <summary>
              <Text variant="label-strong-s">Cancel…</Text>
            </summary>
            <form {...action} className="fill-width">
              <input type="hidden" name="appointmentId" value={appointmentId} />
              <input type="hidden" name="intent" value="cancel" />
              <Column gap="8" paddingTop="8">
                <Input id={`reason-${appointmentId}`} name="reason" label="Reason" required minLength={3} />
                <label className="native-check">
                  <input type="checkbox" name="waiveFee" /> Waive any late-cancellation fee
                </label>
                <Button type="submit" size="s" variant="danger" label="Cancel appointment" loading={pending} />
              </Column>
            </form>
          </details>
        </Row>
      )}
      <div aria-live="polite">
        {state.error && <Feedback variant="danger" description={state.error} />}
        {state.success && <Feedback variant="success" description={state.success} />}
      </div>
      {state.cancel && state.cancel.matches.length > 0 && (
        <Column gap="8" padding="12" radius="m" border="brand-alpha-medium">
          <Text variant="label-strong-s">Waitlist matches for this opening</Text>
          {state.cancel.matches.map((m) => (
            <WaitlistBook key={m.id} entryId={m.id} patientName={m.patientName} slot={state.cancel!.freedSlot} />
          ))}
        </Column>
      )}
    </Column>
  );
}

export function BookSlotButton({ label, fields }: { label: string; fields: Record<string, string> }) {
  const [state, action, pending] = useActionForm(bookAction, {});
  return (
    <form {...action}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" size="s" variant="secondary" label={label} loading={pending} disabled={pending} />
      {state.error && <Text variant="body-default-xs" onBackground="danger-medium">{state.error}</Text>}
    </form>
  );
}

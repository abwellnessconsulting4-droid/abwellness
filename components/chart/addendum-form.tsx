"use client";

import { useActionState } from "react";
import { Button, Column, Feedback, Textarea } from "@once-ui-system/core";
import type { FormState } from "@/app/dashboard/patients/actions";

export function AddendumForm({ action }: { action: (state: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="fill-width">
      <Column gap="8">
        <Textarea id="addendum" name="addendum" label="Add an addendum" lines={3} required />
        <div aria-live="polite">
          {state.error && <Feedback variant="danger" description={state.error} />}
          {state.success && <Feedback variant="success" description={state.success} />}
        </div>
        <Button type="submit" variant="secondary" size="s" label="Sign addendum" loading={pending} disabled={pending} />
      </Column>
    </form>
  );
}

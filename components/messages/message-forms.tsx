"use client";

import { useActionState } from "react";
import { Button, Column, Feedback, Input, Row, Text, Textarea } from "@once-ui-system/core";
import type { MessageState } from "@/app/messages-actions";

type Action = (state: MessageState, form: FormData) => Promise<MessageState>;

export function ReplyForm({ action, placeholder }: { action: Action; placeholder: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="fill-width">
      <Column gap="8">
        <Textarea id="body" name="body" label="Reply" lines={4} required maxLength={5000} placeholder={placeholder} />
        {state.error && <Feedback variant="danger" description={state.error} />}
        <Row>
          <Button type="submit" variant="primary" label="Send" prefixIcon="mail" loading={pending} disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

export function NewThreadForm({
  action,
  topics,
  patients,
  defaultPatientId,
  clientFacing,
}: {
  action: Action;
  topics: { value: string; label: string }[];
  patients?: { id: string; label: string }[];
  defaultPatientId?: string;
  clientFacing: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="fill-width">
      <Column gap="12">
        {patients && (
          <label className="native-field">
            <span>Client</span>
            <select name="patientId" required defaultValue={defaultPatientId ?? ""}>
              <option value="" disabled>Choose a client</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
        )}
        <label className="native-field">
          <span>{clientFacing ? "What's this about?" : "Topic"}</span>
          <select name="topic" required defaultValue="">
            <option value="" disabled>Choose a topic</option>
            {topics.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <Input id="subject" name="subject" label="Subject" required maxLength={140} />
        <Text variant="body-default-xs" onBackground="neutral-weak">Keep the subject general (it may appear in lists). Put details in the message.</Text>
        <Textarea id="body" name="body" label="Message" lines={6} required maxLength={5000} />
        {state.error && <Feedback variant="danger" description={state.error} />}
        <Row>
          <Button type="submit" variant="primary" label="Send message" prefixIcon="mail" loading={pending} disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

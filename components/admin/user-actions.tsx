"use client";

import { useActionState, type ReactNode } from "react";
import { Button, Column, Feedback, Input, Row, Text } from "@once-ui-system/core";
import { userAction, type ActionState } from "@/app/dashboard/users/actions";

interface UserActionsProps {
  userId: string;
  email: string;
  role: string;
  status: string;
  twoFactorEnabled: boolean;
  isSelf: boolean;
  isClient: boolean;
}

const STAFF_ROLE_OPTIONS = [
  ["PROVIDER", "Provider"],
  ["FRONT_DESK", "Front desk"],
  ["BILLING_STAFF", "Billing"],
  ["SUPER_ADMIN", "Administrator"],
] as const;

function ActionPanel({ title, description, intent, userId, email, submitLabel, danger, children }: {
  title: string;
  description: string;
  intent: string;
  userId: string;
  email?: string;
  submitLabel: string;
  danger?: boolean;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(userAction, {});
  return (
    <details className="action-panel">
      <summary>
        <Text variant="label-strong-m">{title}</Text>
        <Text variant="body-default-xs" onBackground="neutral-weak">
          {description}
        </Text>
      </summary>
      <form action={formAction} className="fill-width">
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="userId" value={userId} />
        {email && <input type="hidden" name="email" value={email} />}
        <Column gap="12" paddingTop="12">
          {children}
          <Input id={`reason-${intent}`} name="reason" label="Reason (recorded in the audit trail)" required minLength={5} />
          <div aria-live="polite">
            {state.error && <Feedback variant="danger" description={state.error} />}
            {state.success && <Feedback variant="success" description={state.success} />}
          </div>
          <Row>
            <Button type="submit" variant={danger ? "danger" : "secondary"} size="s" label={submitLabel} loading={pending} disabled={pending} />
          </Row>
        </Column>
      </form>
    </details>
  );
}

export function UserActions({ userId, email, role, status, twoFactorEnabled, isSelf, isClient }: UserActionsProps) {
  if (isSelf) {
    return (
      <Text variant="body-default-s" onBackground="neutral-medium">
        This is your account. Another administrator has to change your role, status, or two-step verification, so nobody can lock themselves out by mistake.
      </Text>
    );
  }
  const active = status === "ACTIVE";
  return (
    <Column gap="8">
      {!isClient && (
        <ActionPanel title="Change role" description="Updates permissions and signs them out everywhere." intent="role" userId={userId} submitLabel="Change role">
          <label className="native-field">
            <span>New role</span>
            <select name="role" defaultValue={role}>
              {STAFF_ROLE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </ActionPanel>
      )}
      <ActionPanel
        title="Send password reset link"
        description="Emails a link to choose a new password (valid 24 hours)."
        intent="password-link"
        userId={userId}
        email={email}
        submitLabel="Send link"
      />
      {twoFactorEnabled && (
        <ActionPanel
          title="Reset two-step verification"
          description="For a lost phone or email: they'll set it up again at next sign-in. Confirm their identity first."
          intent="reset-2fa"
          userId={userId}
          submitLabel="Reset two-step"
          danger
        />
      )}
      <ActionPanel title="Sign out everywhere" description="Ends every active session on every device." intent="sign-out" userId={userId} submitLabel="Sign out everywhere" />
      {active ? (
        <ActionPanel title="Deactivate account" description="Blocks sign-in and ends all sessions. Records are kept." intent="deactivate" userId={userId} submitLabel="Deactivate" danger />
      ) : (
        <ActionPanel title="Reactivate account" description="Allows sign-in again." intent="reactivate" userId={userId} submitLabel="Reactivate" />
      )}
    </Column>
  );
}

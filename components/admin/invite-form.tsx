"use client";

import { useActionForm } from "@/components/use-action-form";
import { useState } from "react";
import { Button, Column, Feedback, Input, Row, Text } from "@once-ui-system/core";
import { inviteStaffAction } from "@/app/dashboard/users/actions";

const STAFF_ROLES = [
  { value: "PROVIDER", label: "Provider", hint: "Sees and documents care for their assigned clients." },
  { value: "FRONT_DESK", label: "Front desk", hint: "Registration, scheduling, insurance, waitlist, check-in." },
  { value: "BILLING_STAFF", label: "Billing", hint: "Claims, payments, invoices. No clinical notes." },
  { value: "SUPER_ADMIN", label: "Administrator", hint: "Full access, including users, audit trail, and compliance." },
];

export function InviteForm() {
  const [state, formAction, pending] = useActionForm(inviteStaffAction, {}, { resetOnSuccess: true });
  const [role, setRole] = useState("PROVIDER");

  return (
    <form {...formAction} className="fill-width">
      <Column fillWidth gap="16">
        <Row gap="12" s={{ direction: "column" }}>
          <Input id="name" name="name" label="Full name" autoComplete="off" required />
          <Input id="email" name="email" type="email" label="Work email" autoComplete="off" required />
        </Row>

        <fieldset className="role-picker">
          <legend>Role</legend>
          {STAFF_ROLES.map((r) => (
            <label key={r.value} className="role-picker__option">
              <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} />
              <span>
                <strong>{r.label}</strong>
                <Text variant="body-default-xs" onBackground="neutral-weak">
                  {r.hint}
                </Text>
              </span>
            </label>
          ))}
        </fieldset>

        <Row gap="12" s={{ direction: "column" }}>
          <Input id="credentials" name="credentials" label="Credentials (optional)" placeholder="e.g. LCSW, PsyD, CPC" />
          {role === "PROVIDER" && <Input id="npi" name="npi" label="NPI (optional)" inputMode="numeric" maxLength={10} />}
        </Row>
        {role === "PROVIDER" && <Input id="specialty" name="specialty" label="Specialty (optional)" />}

        <Input id="reason" name="reason" label="Reason (recorded in the audit trail)" placeholder="e.g. New hire starting 12/1" required minLength={5} />

        <div aria-live="polite">{state.error && <Feedback variant="danger" description={state.error} />}</div>
        <Text variant="body-default-xs" onBackground="neutral-weak">
          They&apos;ll get an email with a link to set their password (valid for 24 hours), then set up two-step verification at first sign-in.
        </Text>
        <Row gap="8">
          <Button type="submit" variant="primary" label="Send invitation" loading={pending} disabled={pending} />
          <Button href="/dashboard/users" variant="tertiary" label="Cancel" />
        </Row>
      </Column>
    </form>
  );
}

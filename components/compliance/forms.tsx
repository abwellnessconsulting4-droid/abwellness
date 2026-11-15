"use client";

import { useActionForm } from "@/components/use-action-form";
import type { ReactNode } from "react";

import { Button, Column, Feedback, Input, Row, Textarea } from "@once-ui-system/core";
import type { ComplianceState } from "@/app/dashboard/compliance/actions";

type Action = (state: ComplianceState, form: FormData) => Promise<ComplianceState>;

/** One form shell for every compliance record type (intent + fields). */
export function ComplianceForm({ action, intent, submitLabel, children, hidden = {} }: { action: Action; intent: string; submitLabel: string; children: ReactNode; hidden?: Record<string, string> }) {
  const [state, formAction, pending] = useActionForm(action, {}, { resetOnSuccess: true });
  return (
    <form {...formAction} className="fill-width">
      <input type="hidden" name="intent" value={intent} />
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Column gap="12" paddingTop="8">
        {children}
        <div aria-live="polite">
          {state.error && <Feedback variant="danger" description={state.error} />}
          {state.success && <Feedback variant="success" description={state.success} />}
        </div>
        <Row>
          <Button type="submit" size="s" variant="primary" label={submitLabel} loading={pending} disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

export function BaaFields({ prefix, initial }: { prefix: string; initial?: { vendor?: string; service?: string; status?: string; signedDate?: string; renewalDate?: string; notes?: string } }) {
  return (
    <>
      <Row gap="12" wrap s={{ direction: "column" }}>
        <Input id={`${prefix}-vendor`} name="vendor" label="Vendor" defaultValue={initial?.vendor} required />
        <Input id={`${prefix}-service`} name="service" label="Service" defaultValue={initial?.service} />
      </Row>
      <Row gap="12" wrap s={{ direction: "column" }}>
        <label className="native-field">
          <span>Status</span>
          <select name="status" defaultValue={initial?.status ?? "PENDING"}>
            <option value="ACTIVE">Active (signed)</option>
            <option value="PENDING">Pending</option>
            <option value="EXPIRED">Expired</option>
            <option value="TERMINATED">Terminated</option>
            <option value="NOT_APPLICABLE">Not applicable</option>
          </select>
        </label>
        <label className="native-field">
          <span>Signed</span>
          <input type="date" name="signedDate" defaultValue={initial?.signedDate} />
        </label>
        <label className="native-field">
          <span>Renewal</span>
          <input type="date" name="renewalDate" defaultValue={initial?.renewalDate} />
        </label>
      </Row>
      <Input id={`${prefix}-notes`} name="notes" label="Notes (required when not applicable)" defaultValue={initial?.notes} />
    </>
  );
}

export function DrillFields() {
  return (
    <>
      <Row gap="12" wrap s={{ direction: "column" }}>
        <Input id="drill-vendor" name="vendor" label="Backup source" defaultValue="MongoDB Atlas" />
        <Input id="drill-target" name="restoredTo" label="Restored into (non-production)" placeholder="abwellness_restore_test" required />
      </Row>
      <Row gap="12" wrap s={{ direction: "column" }}>
        <label className="native-field"><span>Snapshot time</span><input type="datetime-local" name="snapshotAt" required /></label>
        <label className="native-field"><span>Restore tested</span><input type="datetime-local" name="restoreTestedAt" required /></label>
        <label className="native-field">
          <span>Result</span>
          <select name="result" defaultValue="PASSED"><option value="PASSED">Passed</option><option value="FAILED">Failed</option></select>
        </label>
        <Input id="drill-minutes" name="durationMinutes" label="Minutes" type="number" min={1} />
      </Row>
      <Input id="drill-notes" name="notes" label="Notes (what was verified)" />
    </>
  );
}

export function NotesField({ id, label, kinds }: { id: string; label: string; kinds?: { value: string; label: string }[] }) {
  return (
    <>
      {kinds && (
        <label className="native-field">
          <span>Type</span>
          <select name="kind" defaultValue={kinds[0].value}>
            {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
      )}
      <Textarea id={id} name="notes" label={label} lines={3} required minLength={10} />
    </>
  );
}

"use client";

import { useActionForm } from "@/components/use-action-form";
import { useState } from "react";
import { Button, Column, Feedback, Input, Row, Text, Textarea } from "@once-ui-system/core";
import type { ClaimState } from "@/app/dashboard/billing/actions";
import { COMMON_DENIALS } from "@/lib/clearinghouse";

type Action = (state: ClaimState, form: FormData) => Promise<ClaimState>;
export interface EditableLine {
  id: string;
  cptCode: string;
  modifiers: string[];
  icdPointers: string[];
  placeOfService: string;
  totalCents: number;
}

const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function Result({ state }: { state: ClaimState }) {
  return (
    <div aria-live="polite">
      {state.error && <Feedback variant="danger" description={state.error} />}
      {state.success && <Feedback variant="success" description={state.success} />}
    </div>
  );
}

function LineInputs({ lines }: { lines: EditableLine[] }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Service</th>
            <th scope="col">POS</th>
            <th scope="col">Modifiers</th>
            <th scope="col">Diagnosis codes (1–4)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="notranslate">
                <input type="hidden" name="lineId" value={l.id} />
                {l.cptCode} · {money(l.totalCents)}
              </td>
              <td className="notranslate">{l.placeOfService}</td>
              <td>
                <label className="native-field compact">
                  <span className="sr-only">Modifiers for {l.cptCode}</span>
                  <input name={`mod-${l.id}`} defaultValue={l.modifiers.join(" ")} placeholder="e.g. 95" autoComplete="off" className="notranslate" />
                </label>
              </td>
              <td>
                <label className="native-field compact">
                  <span className="sr-only">Diagnosis codes for {l.cptCode}</span>
                  <input name={`icd-${l.id}`} defaultValue={l.icdPointers.join(", ")} placeholder="e.g. F41.1" autoComplete="off" className="notranslate" />
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** DRAFT: review lines, run the scrubber, and mark ready. */
export function ReviewPanel({ action, lines }: { action: Action; lines: EditableLine[] }) {
  const [state, formAction, pending] = useActionForm(action, {});
  return (
    <form {...formAction} className="fill-width">
      <Column gap="12">
        <LineInputs lines={lines} />
        <Result state={state} />
        <Row gap="8" wrap>
          <Button type="submit" name="intent" value="mark-ready" variant="primary" label="Run claim checks & mark ready" loading={pending} disabled={pending} />
          <Button type="submit" name="intent" value="save-lines" variant="secondary" label="Save changes" disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

/** READY_TO_SUBMIT: send through the clearinghouse. */
export function SubmitPanel({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionForm(action, {});
  return (
    <form {...formAction}>
      <Column gap="12">
        <Result state={state} />
        <Row gap="8" wrap>
          <Button type="submit" name="intent" value="submit" variant="primary" label="Submit claim" loading={pending} disabled={pending} />
          <Button type="submit" name="intent" value="to-draft" variant="tertiary" label="Back to draft" disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

const PARTS = [
  ["paid", "Insurance paid"],
  ["contractual", "Contractual adj. (CO-45)"],
  ["copay", "Copay (PR-3)"],
  ["deductible", "Deductible (PR-1)"],
  ["coinsurance", "Coinsurance (PR-2)"],
] as const;

function toCents(v: string) {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** SUBMITTED/ACCEPTED: post the payer's response (835 ERA / EOB). */
export function RemittancePanel({ action, lines }: { action: Action; lines: EditableLine[] }) {
  const [payState, payAction, paying] = useActionForm(action, {});
  const [denyState, denyAction, denying] = useActionForm(action, {});
  const [values, setValues] = useState<Record<string, string>>({});
  const [carc, setCarc] = useState<string>(COMMON_DENIALS[0].carc);
  const description = COMMON_DENIALS.find((d) => d.carc === carc)?.description ?? "";

  return (
    <Column gap="16">
      <Text variant="body-default-s" onBackground="neutral-medium">
        Until a clearinghouse is connected, enter the payer&apos;s response from the ERA (835) or paper EOB here. Each line must balance: billed = paid + adjustments + patient responsibility.
      </Text>
      <details className="action-panel" open>
        <summary>
          <Text variant="label-strong-m">Post payment</Text>
        </summary>
        <form {...payAction} className="fill-width">
          <input type="hidden" name="intent" value="post-payment" />
          <Column gap="12" paddingTop="12">
            {lines.map((l) => {
              const accounted = PARTS.reduce((n, [k]) => n + (toCents(values[`${k}-${l.id}`] ?? "") || 0), 0);
              const diff = l.totalCents - accounted;
              return (
                <Column key={l.id} gap="8">
                  <input type="hidden" name="lineId" value={l.id} />
                  <Text variant="label-strong-s" className="notranslate">
                    {l.cptCode} · billed {money(l.totalCents)}
                  </Text>
                  <div className="money-grid">
                    {PARTS.map(([k, label]) => (
                      <label key={k} className="native-field">
                        <span>{label}</span>
                        <input
                          name={`${k}-${l.id}`}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={values[`${k}-${l.id}`] ?? ""}
                          onChange={(e) => setValues({ ...values, [`${k}-${l.id}`]: e.target.value })}
                        />
                      </label>
                    ))}
                  </div>
                  <Text variant="body-default-xs" onBackground={diff === 0 ? "success-medium" : "warning-medium"} aria-live="polite">
                    {Number.isNaN(accounted) ? "Check the amounts." : diff === 0 ? "Balanced." : `${money(Math.abs(diff))} ${diff > 0 ? "left to account for" : "over the billed amount"}.`}
                  </Text>
                </Column>
              );
            })}
            <Row gap="12" wrap s={{ direction: "column" }}>
              <Input id="eraReference" name="eraReference" label="ERA / EOB reference (optional)" />
              <Input id="checkOrEftNumber" name="checkOrEftNumber" label="Check or EFT number (optional)" />
            </Row>
            <Result state={payState} />
            <Row>
              <Button type="submit" variant="primary" label="Post payment" loading={paying} disabled={paying || denying} />
            </Row>
          </Column>
        </form>
      </details>

      <details className="action-panel">
        <summary>
          <Text variant="label-strong-m">Post denial</Text>
        </summary>
        <form {...denyAction} className="fill-width">
          <input type="hidden" name="intent" value="post-denial" />
          <Column gap="12" paddingTop="12">
            <label className="native-field">
              <span>Reason (CARC)</span>
              <select name="carc" value={carc} onChange={(e) => setCarc(e.target.value)}>
                {COMMON_DENIALS.map((d) => (
                  <option key={d.carc} value={d.carc}>
                    {d.carc}: {d.description}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="description" value={description} />
            <Row gap="12" wrap s={{ direction: "column" }}>
              <Input id="rarc" name="rarc" label="Remark codes (RARC, optional)" />
              <Input id="denialEra" name="eraReference" label="ERA reference (optional)" />
            </Row>
            <Result state={denyState} />
            <Row>
              <Button type="submit" variant="danger" label="Post denial" loading={denying} disabled={paying || denying} />
            </Row>
          </Column>
        </form>
      </details>
    </Column>
  );
}

/** DENIED/REJECTED: correct the lines, explain the correction, and resubmit. */
export function ResubmitPanel({ action, lines }: { action: Action; lines: EditableLine[] }) {
  const [state, formAction, pending] = useActionForm(action, {});
  return (
    <form {...formAction} className="fill-width">
      <input type="hidden" name="intent" value="resubmit" />
      <Column gap="12">
        <LineInputs lines={lines} />
        <Textarea id="correctionNote" name="correctionNote" label="Correction note (kept on the appeal record)" lines={3} required minLength={5} />
        <Result state={state} />
        <Row>
          <Button type="submit" variant="primary" label="Resubmit claim" loading={pending} disabled={pending} />
        </Row>
      </Column>
    </form>
  );
}

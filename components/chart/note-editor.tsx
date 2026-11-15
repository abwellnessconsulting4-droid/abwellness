"use client";

import { useActionForm } from "@/components/use-action-form";
import type React from "react";
import { useState, useTransition } from "react";
import { Button, Column, Feedback, Input, Row, Tag, Text, Textarea } from "@once-ui-system/core";
import { codeSearchAction, type FormState } from "@/app/dashboard/patients/actions";

type Line = { cptCode: string; modifiers: string[]; units: number; minutes?: number };
type Kind = "SOAP" | "PROGRESS" | "INTAKE" | "PSYCHOTHERAPY";

interface NoteEditorProps {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  mode: "create" | "edit";
  initial?: {
    noteType: Kind;
    sections: Partial<Record<"subjective" | "objective" | "assessment" | "plan" | "body", string>>;
    diagnosisCodes: string[];
    serviceLines: Line[];
  };
  appointments?: { id: string; label: string }[];
  sessionMinutes?: number;
}

function CodePicker({ kind, onPick }: { kind: "diagnosis" | "procedure"; onPick: (code: string) => void }) {
  const [results, setResults] = useState<{ code: string; description: string }[]>([]);
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  return (
    <Column gap="4">
      <Input
        id={`search-${kind}`}
        label={kind === "diagnosis" ? "Search diagnoses (ICD-10-CM)" : "Search services (CPT/HCPCS)"}
        value={query}
        onChange={(e) => {
          const value = e.target.value;
          setQuery(value);
          if (value.trim().length >= 2) start(async () => setResults(await codeSearchAction(kind, value)));
          else setResults([]);
        }}
        hasSuffix={pending ? <Text variant="label-default-xs">…</Text> : undefined}
      />
      {results.length > 0 && (
        <ul className="code-results" role="listbox" aria-label="Matching codes">
          {results.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => {
                  onPick(r.code);
                  setQuery("");
                  setResults([]);
                }}
              >
                <strong className="notranslate">{r.code}</strong> {r.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Column>
  );
}

export function NoteEditor({ action, mode, initial, appointments = [], sessionMinutes }: NoteEditorProps) {
  const [state, formAction, pending] = useActionForm(action, {});
  const [noteType, setNoteType] = useState<Kind>(initial?.noteType ?? "SOAP");
  const [codes, setCodes] = useState<string[]>(initial?.diagnosisCodes ?? []);
  const [lines, setLines] = useState<Line[]>(initial?.serviceLines ?? []);
  const free = noteType === "PROGRESS" || noteType === "PSYCHOTHERAPY";
  const s = initial?.sections ?? {};

  return (
    <form {...formAction} className="fill-width">
      <input type="hidden" name="diagnosisCodes" value={codes.join(",")} />
      <input type="hidden" name="serviceLines" value={JSON.stringify(lines)} />
      <Column gap="20">
        {mode === "create" && (
          <Row gap="12" wrap s={{ direction: "column" }}>
            <label className="native-field">
              <span>Note type</span>
              <select name="noteType" value={noteType} onChange={(e) => setNoteType(e.target.value as Kind)}>
                <option value="SOAP">SOAP note</option>
                <option value="PROGRESS">Progress note</option>
                <option value="INTAKE">Intake / evaluation</option>
                <option value="PSYCHOTHERAPY">Psychotherapy note (private to you)</option>
              </select>
            </label>
            <label className="native-field">
              <span>Visit</span>
              <select name="appointmentId" defaultValue="">
                <option value="">Not linked to a visit</option>
                {appointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          </Row>
        )}

        {noteType === "PSYCHOTHERAPY" && (
          <Feedback variant="info" description="Psychotherapy notes are kept separate from the clinical record: only you can read them, they never go on a claim, and they're excluded from records requests unless the client gives specific authorization." />
        )}

        {free ? (
          <Textarea id="body" name="body" label="Note" lines={10} defaultValue={s.body} required />
        ) : (
          <>
            <Textarea id="subjective" name="subjective" label="Subjective" lines={4} defaultValue={s.subjective} placeholder="What the client reports" />
            <Textarea id="objective" name="objective" label="Objective" lines={4} defaultValue={s.objective} placeholder="Observations, measures (e.g. PHQ-9, GAD-7)" />
            <Textarea id="assessment" name="assessment" label="Assessment" lines={4} defaultValue={s.assessment} placeholder="Clinical impression" />
            <Textarea id="plan" name="plan" label="Plan" lines={4} defaultValue={s.plan} placeholder="Interventions, follow-up" />
          </>
        )}

        {noteType !== "PSYCHOTHERAPY" && (
          <Column gap="12" padding="16" radius="l" border="neutral-alpha-weak">
            <Text variant="label-strong-m">Diagnoses</Text>
            <Row gap="8" wrap>
              {codes.length === 0 && <Text variant="body-default-xs" onBackground="neutral-weak">None selected.</Text>}
              {codes.map((c) => (
                <button key={c} type="button" className="chip-button notranslate" onClick={() => setCodes(codes.filter((x) => x !== c))} aria-label={`Remove ${c}`}>
                  {c} ×
                </button>
              ))}
            </Row>
            <CodePicker kind="diagnosis" onPick={(code) => setCodes((prev) => (prev.includes(code) ? prev : [...prev, code].slice(0, 12)))} />

            <Text variant="label-strong-m">Services (for billing)</Text>
            {lines.map((line, i) => (
              <Row key={`${line.cptCode}-${i}`} gap="8" vertical="end" wrap>
                <Tag variant="brand" label={line.cptCode} className="notranslate" />
                <Input
                  id={`mod-${i}`}
                  label="Modifiers"
                  value={line.modifiers.join(" ")}
                  onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, modifiers: e.target.value.toUpperCase().split(/[\s,]+/).filter(Boolean).slice(0, 4) } : l)))}
                />
                <Input id={`units-${i}`} label="Units" type="number" min={1} max={24} value={String(line.units)} onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, units: Number(e.target.value) || 1 } : l)))} />
                <Button type="button" variant="tertiary" size="s" label="Remove" onClick={() => setLines(lines.filter((_, j) => j !== i))} />
              </Row>
            ))}
            <CodePicker kind="procedure" onPick={(code) => setLines((prev) => [...prev, { cptCode: code, modifiers: [], units: 1, minutes: sessionMinutes }].slice(0, 10))} />
            {sessionMinutes ? <Text variant="body-default-xs" onBackground="neutral-weak">Recorded session length: {sessionMinutes} {sessionMinutes === 1 ? "minute" : "minutes"}.</Text> : null}
            <Text variant="body-default-xs" onBackground="neutral-weak">Video visits get telehealth modifier 95 automatically on the claim unless you choose another.</Text>
          </Column>
        )}

        <div aria-live="polite">
          {state.error && <Feedback variant="danger" description={state.error} />}
          {state.success && <Feedback variant="success" description={state.success} />}
        </div>
        <Row gap="8" wrap>
          <Button type="submit" name="intent" value="save" variant="secondary" label={mode === "create" ? "Save draft" : "Save draft"} loading={pending} disabled={pending} />
          {mode === "edit" && (
            <Button
              type="submit"
              name="intent"
              value="sign"
              variant="primary"
              label="Sign and lock"
              disabled={pending}
              onClick={(e: React.MouseEvent) => {
                if (!window.confirm("Sign this note? It will be locked; later changes must be added as addenda.")) e.preventDefault();
              }}
            />
          )}
        </Row>
      </Column>
    </form>
  );
}

"use client";

import { useActionState, type ReactNode } from "react";
import { Button, Column, Feedback, Input, Row } from "@once-ui-system/core";
import { clinicalAction, type FormState } from "@/app/dashboard/patients/actions";

function ClinicalForm({ patientId, intent, submitLabel, children, compact }: { patientId: string; intent: string; submitLabel: string; children?: ReactNode; compact?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(clinicalAction.bind(null, patientId), {});
  return (
    <form action={action} className={compact ? undefined : "fill-width"}>
      <input type="hidden" name="intent" value={intent} />
      <Column gap="8">
        {children && <Row gap="8" wrap vertical="end" s={{ direction: "column" }}>{children}</Row>}
        <Row gap="8" vertical="center" wrap>
          <Button type="submit" size="s" variant={compact ? "tertiary" : "secondary"} label={submitLabel} loading={pending} disabled={pending} />
          {state.error && <Feedback variant="danger" description={state.error} />}
        </Row>
      </Column>
    </form>
  );
}

export function AddDiagnosisForm({ patientId }: { patientId: string }) {
  return (
    <ClinicalForm patientId={patientId} intent="add-diagnosis" submitLabel="Add diagnosis">
      <Input id="dx-code" name="code" label="ICD-10-CM code" placeholder="F41.1" required />
      <Input id="dx-onset" name="onsetDate" type="date" label="Onset (optional)" />
      <label className="native-check">
        <input type="checkbox" name="isPrimary" /> Primary
      </label>
    </ClinicalForm>
  );
}

export function ResolveDiagnosisButton({ patientId, id }: { patientId: string; id: string }) {
  return (
    <ClinicalForm patientId={patientId} intent="resolve-diagnosis" submitLabel="Mark resolved" compact>
      <input type="hidden" name="id" value={id} />
    </ClinicalForm>
  );
}

export function AddMedicationForm({ patientId }: { patientId: string }) {
  return (
    <ClinicalForm patientId={patientId} intent="add-medication" submitLabel="Add medication">
      <Input id="med-name" name="name" label="Medication" required />
      <Input id="med-dosage" name="dosage" label="Dose" placeholder="50 mg" />
      <Input id="med-frequency" name="frequency" label="Frequency" placeholder="Once daily" />
    </ClinicalForm>
  );
}

export function DiscontinueMedicationButton({ patientId, id }: { patientId: string; id: string }) {
  return (
    <ClinicalForm patientId={patientId} intent="discontinue-medication" submitLabel="Discontinue" compact>
      <input type="hidden" name="id" value={id} />
    </ClinicalForm>
  );
}

export function AddAllergyForm({ patientId }: { patientId: string }) {
  return (
    <ClinicalForm patientId={patientId} intent="add-allergy" submitLabel="Add allergy">
      <Input id="allergen" name="allergen" label="Allergen" required />
      <Input id="reaction" name="reaction" label="Reaction" />
      <label className="native-field">
        <span>Severity</span>
        <select name="severity" defaultValue="UNKNOWN">
          <option value="MILD">Mild</option>
          <option value="MODERATE">Moderate</option>
          <option value="SEVERE">Severe</option>
          <option value="LIFE_THREATENING">Life-threatening</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
      </label>
    </ClinicalForm>
  );
}

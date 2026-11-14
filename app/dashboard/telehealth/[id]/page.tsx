import { Column, Feedback, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/chart/note-editor";
import { StartNote, VideoTile, VisitControls } from "@/components/telehealth/visit-controls";
import { saveDraftAction } from "@/app/dashboard/patients/actions";
import { startNoteAction, visitAction } from "@/app/dashboard/telehealth/actions";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { getNote } from "@/lib/services/notes";
import { getChart } from "@/lib/services/patients";
import { DEFAULT_TZ } from "@/lib/services/scheduling";
import { getVisit, TelehealthError } from "@/lib/services/telehealth";
import { ageOn } from "@/lib/time";
import { formatTime } from "@/lib/tz";

export const metadata = { title: "Video visit" };

export default async function VisitPage({ params }: PageProps<"/dashboard/telehealth/[id]">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const { id } = await params;
  const visit = await orForbidden(
    getVisit(ctx, id).catch((error) => {
      if (error instanceof TelehealthError) notFound();
      throw error;
    }),
  );
  const chart = await orForbidden(getChart(ctx, visit.patientId));
  if (!chart) notFound();
  const note = visit.note && visit.isProvider ? await orForbidden(getNote(ctx, visit.note.id)) : null;
  const { patient } = chart;
  const name = `${patient.preferredName ?? patient.firstName} ${patient.lastName}`;
  const activeDx = (chart.diagnoses ?? []).filter((d) => d.status === "ACTIVE");
  const activeMeds = (chart.medications ?? []).filter((m) => m.status === "ACTIVE");

  return (
    <Column gap="20" fillWidth>
      <Column gap="8">
        <SmartLink href="/dashboard/telehealth">← Waiting room</SmartLink>
        <Row gap="12" vertical="center" wrap>
          <Heading as="h1" variant="display-strong-xs">Video visit: {name}</Heading>
          <Tag variant={visit.status === "IN_SESSION" ? "brand" : visit.status === "COMPLETED" ? "success" : "warning"} label={visit.status.replaceAll("_", " ").toLowerCase()} />
        </Row>
        {visit.appointment && (
          <Text variant="body-default-s" onBackground="neutral-medium">
            Scheduled {formatTime(visit.appointment.start, DEFAULT_TZ)}–{formatTime(visit.appointment.end, DEFAULT_TZ)}
            {visit.minutes != null ? ` · session length ${visit.minutes} min` : ""}
          </Text>
        )}
      </Column>

      <div className="visit-split">
        <Column gap="16" className="visit-pane">
          <VideoTile status={visit.status} patient={name} startedAt={visit.startedAt?.toISOString()} waitingSince={visit.waitingSince?.toISOString()} />
          <VisitControls action={visitAction.bind(null, id)} status={visit.status} isProvider={visit.isProvider} />

          <Column gap="12" padding="16" radius="l" border="neutral-alpha-weak">
            <Row horizontal="between" vertical="center" wrap gap="8">
              <Heading as="h2" variant="heading-strong-s">Chart summary</Heading>
              <SmartLink href={`/dashboard/patients/${patient.id}`}>Full chart</SmartLink>
            </Row>
            <Text variant="body-default-s">
              {patient.pronouns ? `${patient.pronouns} · ` : ""}
              {ageOn(patient.dob)} years · MRN <span className="notranslate">{patient.mrn}</span>
            </Text>
            {chart.allergies && (
              <Text variant="body-default-s" onBackground={chart.allergies.length ? "danger-medium" : "neutral-medium"}>
                Allergies: {chart.allergies.length ? chart.allergies.map((a) => `${a.allergen}${a.reaction ? ` (${a.reaction})` : ""}`).join(", ") : "none recorded"}
              </Text>
            )}
            {chart.diagnoses && (
              <Column gap="4">
                <Text variant="label-strong-s">Active diagnoses</Text>
                {activeDx.length === 0 ? (
                  <Text variant="body-default-s" onBackground="neutral-weak">None</Text>
                ) : (
                  activeDx.map((d) => (
                    <Text key={String(d._id)} variant="body-default-s">
                      <span className="notranslate">{d.icd10Code}</span> {d.description}
                      {d.isPrimary ? " (primary)" : ""}
                    </Text>
                  ))
                )}
              </Column>
            )}
            {chart.medications && (
              <Column gap="4">
                <Text variant="label-strong-s">Current medications</Text>
                {activeMeds.length === 0 ? (
                  <Text variant="body-default-s" onBackground="neutral-weak">None</Text>
                ) : (
                  activeMeds.map((m) => (
                    <Text key={String(m._id)} variant="body-default-s">
                      {m.name} {[m.dosage, m.frequency].filter(Boolean).join(", ")}
                    </Text>
                  ))
                )}
              </Column>
            )}
          </Column>
        </Column>

        <Column gap="16" className="visit-pane">
          <Heading as="h2" variant="heading-strong-m">Visit note</Heading>
          {visit.codeWarnings.map((w) => (
            <Feedback key={w} variant="warning" title="Check the service code" description={w} />
          ))}
          {!visit.isProvider ? (
            <Text variant="body-default-s" onBackground="neutral-weak">The note is written by the visit&apos;s provider.</Text>
          ) : !note ? (
            <Column gap="8">
              <Text variant="body-default-s" onBackground="neutral-medium">No note for this visit yet. It will be linked to this appointment so the claim gets telehealth modifier 95 and place of service 10.</Text>
              <StartNote action={startNoteAction.bind(null, id)} />
            </Column>
          ) : note.status === "SIGNED_LOCKED" ? (
            <Column gap="8">
              <Feedback variant="success" description="This visit's note is signed and locked. A draft claim was created for billing review." />
              <SmartLink href={`/dashboard/patients/${patient.id}/notes/${note.id}`}>View the signed note</SmartLink>
            </Column>
          ) : (
            <NoteEditor
              key={`${note.id}-${note.sessionMinutes ?? 0}`}
              mode="edit"
              action={saveDraftAction.bind(null, patient.id, note.id)}
              initial={{ noteType: note.noteType as "SOAP", sections: note.sections, diagnosisCodes: note.diagnosisCodes, serviceLines: note.serviceLines }}
              sessionMinutes={note.sessionMinutes}
            />
          )}
        </Column>
      </div>
    </Column>
  );
}

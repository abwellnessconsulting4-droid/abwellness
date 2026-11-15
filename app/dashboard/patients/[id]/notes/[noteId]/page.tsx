import { Column, Feedback, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { AddendumForm } from "@/components/chart/addendum-form";
import { NoteEditor } from "@/components/chart/note-editor";
import { addendumAction, saveDraftAction } from "@/app/dashboard/patients/actions";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { getNote } from "@/lib/services/notes";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Clinical note" };

const SECTION_LABELS = { subjective: "Subjective", objective: "Objective", assessment: "Assessment", plan: "Plan", body: "Note" } as const;

export default async function NotePage({ params, searchParams }: PageProps<"/dashboard/patients/[id]/notes/[noteId]">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const { id, noteId } = await params;
  const query = await searchParams;
  // RBAC + audit happen inside getNote; a denial renders a 403 (Use Case 6).
  const note = await orForbidden(getNote(ctx, noteId));
  const signed = note.status === "SIGNED_LOCKED";

  return (
    <Column gap="24" maxWidth="m">
      <Column gap="8">
        <SmartLink href={`/dashboard/patients/${id}?tab=notes`}>← Back to chart</SmartLink>
        <Row gap="12" vertical="center" wrap>
          <Heading as="h1" variant="display-strong-xs">
            {note.noteType === "SOAP" ? "SOAP note" : note.noteType === "PSYCHOTHERAPY" ? "Psychotherapy note" : `${note.noteType.toLowerCase()} note`}
          </Heading>
          <Tag variant={signed ? "success" : "warning"} label={signed ? "Signed & locked" : "Draft"} />
        </Row>
        <Text variant="body-default-s" onBackground="neutral-medium">
          {note.author} · created {formatDateTime(note.createdAt)}
          {note.signature ? ` · signed ${formatDateTime(note.signature.signedAt)}` : ""}
        </Text>
      </Column>
      {query.saved && !signed && <Feedback variant="success" description="Draft saved." />}

      {!signed && note.isAuthor ? (
        <NoteEditor
          mode="edit"
          action={saveDraftAction.bind(null, id, noteId)}
          initial={{ noteType: note.noteType as "SOAP", sections: note.sections, diagnosisCodes: note.diagnosisCodes, serviceLines: note.serviceLines }}
          sessionMinutes={note.sessionMinutes}
        />
      ) : (
        <Column gap="16">
          {(Object.keys(SECTION_LABELS) as (keyof typeof SECTION_LABELS)[]).filter((k) => note.sections[k]).map((k) => (
            <Column key={k} gap="4">
              <Text variant="label-strong-s" onBackground="accent-medium">{SECTION_LABELS[k]}</Text>
              <Text variant="body-default-m" style={{ whiteSpace: "pre-wrap" }}>{note.sections[k]}</Text>
            </Column>
          ))}
          {note.diagnosisCodes.length > 0 && (
            <Text variant="body-default-s" className="notranslate">Diagnoses: {note.diagnosisCodes.join(", ")}</Text>
          )}
          {note.serviceLines.length > 0 && (
            <Text variant="body-default-s" className="notranslate">
              Services: {note.serviceLines.map((l) => `${l.cptCode}${l.modifiers.length ? `-${l.modifiers.join("-")}` : ""} ×${l.units}`).join(", ")}
            </Text>
          )}
          {note.signature && (
            <Text variant="body-default-xs" onBackground="neutral-weak" className="notranslate">
              Electronically signed by {note.signature.signerName}. Content fingerprint {note.signature.contentHash.slice(0, 16)}…
            </Text>
          )}
          {!signed && !note.isAuthor && <Feedback variant="info" description="This draft can only be edited and signed by its author." />}
        </Column>
      )}

      {note.addenda.length > 0 && (
        <Column gap="12">
          <Heading as="h2" variant="heading-strong-m">Addenda</Heading>
          {note.addenda.map((a, i) => (
            <Column key={i} gap="4" padding="12" radius="m" border="neutral-alpha-weak">
              <Text variant="label-default-s" onBackground="neutral-weak">{a.author} · {formatDateTime(a.createdAt)}</Text>
              <Text variant="body-default-s" style={{ whiteSpace: "pre-wrap" }}>{a.text}</Text>
            </Column>
          ))}
        </Column>
      )}
      {signed && ctx.role === "PROVIDER" && <AddendumForm action={addendumAction.bind(null, id, noteId)} />}
    </Column>
  );
}

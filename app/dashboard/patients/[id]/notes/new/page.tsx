import { notFound } from "next/navigation";
import { Column, Heading, SmartLink, Text } from "@once-ui-system/core";
import { NoteEditor } from "@/components/chart/note-editor";
import { createNoteAction } from "@/app/dashboard/patients/actions";
import { authzToken } from "@/lib/authz";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { loadPatientForAccess } from "@/lib/services/patients";
import { formatDateTime } from "@/lib/time";
import { Appointment } from "@/models";

export const metadata = { title: "New note" };

export default async function NewNotePage({ params }: PageProps<"/dashboard/patients/[id]/notes/new">) {
  const ctx = await requireSession({ roles: ["PROVIDER"] });
  await connectToDatabase();
  const { id } = await params;
  const patient = await orForbidden(loadPatientForAccess(ctx, id));
  if (!patient) notFound();
  const visits = await Appointment.find({ patientId: id, providerId: ctx.staffProfileId, status: { $nin: ["CANCELLED", "LATE_CANCELLED"] } }, { scheduledStart: 1, mode: 1, visitType: 1 })
    .sort({ scheduledStart: -1 })
    .limit(10)
    .setOptions({ authz: authzToken(ctx) })
    .lean();

  return (
    <Column gap="24" maxWidth="m">
      <Column gap="8">
        <SmartLink href={`/dashboard/patients/${id}?tab=notes`}>← {patient.firstName} {patient.lastName}</SmartLink>
        <Heading as="h1" variant="display-strong-xs">New note</Heading>
        <Text variant="body-default-s" onBackground="neutral-medium">Saved as a draft. You can sign it when it&apos;s complete.</Text>
      </Column>
      <NoteEditor
        mode="create"
        action={createNoteAction.bind(null, id)}
        appointments={visits.map((v) => ({ id: String(v._id), label: `${formatDateTime(v.scheduledStart)} · ${v.mode === "VIRTUAL" ? "Video" : "In person"} · ${v.visitType}` }))}
      />
    </Column>
  );
}

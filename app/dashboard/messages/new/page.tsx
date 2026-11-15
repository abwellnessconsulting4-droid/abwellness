import { Column, Heading, SmartLink } from "@once-ui-system/core";
import { forbidden } from "next/navigation";
import { startThreadAction } from "@/app/messages-actions";
import { NewThreadForm } from "@/components/messages/message-forms";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { TOPICS, type Topic } from "@/lib/services/messages";
import { searchPatients } from "@/lib/services/patients";

export const metadata = { title: "New message" };

/** Topics each staff role may open (mirrors lib/authz.ts). */
const STAFF_TOPICS: Record<string, Topic[]> = {
  PROVIDER: ["CLINICAL", "SCHEDULING", "GENERAL", "BILLING"],
  FRONT_DESK: ["SCHEDULING", "GENERAL", "BILLING"],
  BILLING_STAFF: ["BILLING"],
};

export default async function NewStaffMessagePage({ searchParams }: PageProps<"/dashboard/messages/new">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const topics = STAFF_TOPICS[ctx.role];
  if (!topics) forbidden();
  const { patient } = await searchParams;
  const patients = await orForbidden(searchPatients(ctx, ""));

  return (
    <Column gap="20" fillWidth maxWidth="s">
      <SmartLink href="/dashboard/messages">← Messages</SmartLink>
      <Heading as="h1" variant="display-strong-xs">New message</Heading>
      <NewThreadForm
        action={startThreadAction}
        clientFacing={false}
        topics={topics.map((t) => ({ value: t, label: TOPICS[t].staffLabel }))}
        patients={patients.map((p) => ({ id: p.id, label: `${p.name} · ${p.mrn}` }))}
        defaultPatientId={typeof patient === "string" ? patient : undefined}
      />
    </Column>
  );
}

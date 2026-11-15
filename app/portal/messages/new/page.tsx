import { Column, Heading, SmartLink, Text } from "@once-ui-system/core";
import { startThreadAction } from "@/app/messages-actions";
import { NewThreadForm } from "@/components/messages/message-forms";
import { requireSession } from "@/lib/dal";
import { TOPICS, type Topic } from "@/lib/services/messages";

export const metadata = { title: "New message" };

export default async function NewPortalMessagePage() {
  await requireSession({ roles: ["PATIENT"] });
  return (
    <Column gap="20" fillWidth maxWidth="s">
      <SmartLink href="/portal/messages">← Messages</SmartLink>
      <Heading as="h1" variant="display-strong-xs">New message</Heading>
      <Text variant="body-default-s" onBackground="neutral-medium">
        Questions for your provider go only to them. Scheduling and billing questions go to our office team.
      </Text>
      <NewThreadForm action={startThreadAction} clientFacing topics={(Object.keys(TOPICS) as Topic[]).map((t) => ({ value: t, label: TOPICS[t].label }))} />
      <Text variant="body-default-xs" onBackground="neutral-weak">Not for emergencies. If you&apos;re in crisis, call or text 988, or call 911.</Text>
    </Column>
  );
}

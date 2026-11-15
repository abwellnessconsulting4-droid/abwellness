import { notFound } from "next/navigation";
import { Column, Feedback, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { closeThreadAction, replyAction } from "@/app/messages-actions";
import { ReplyForm } from "@/components/messages/message-forms";
import { ThreadView } from "@/components/messages/thread-view";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { getThread, MessageError, TOPICS } from "@/lib/services/messages";

export const metadata = { title: "Conversation" };

export default async function StaffThreadPage({ params, searchParams }: PageProps<"/dashboard/messages/[id]">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const { id } = await params;
  const query = await searchParams;
  const thread = await orForbidden(
    getThread(ctx, id).catch((error) => {
      if (error instanceof MessageError) notFound();
      throw error;
    }),
  );

  return (
    <Column gap="20" fillWidth maxWidth="m">
      <SmartLink href="/dashboard/messages">← Messages</SmartLink>
      <Column gap="8">
        <Row gap="12" vertical="center" wrap>
          <Heading as="h1" variant="display-strong-xs">{thread.subject}</Heading>
          <Tag variant="neutral" label={TOPICS[thread.category]?.staffLabel ?? thread.category} />
          {thread.closed && <Tag variant="neutral" label="Closed" />}
        </Row>
        <Text variant="body-default-s" onBackground="neutral-medium">
          With <SmartLink href={`/dashboard/patients/${thread.patientId}`}>{thread.patient}</SmartLink>
        </Text>
      </Column>
      {query.sent && <Feedback variant="success" description="Sent. The client gets an email telling them to sign in (it never includes the message)." />}
      <ThreadView messages={thread.messages} />
      {thread.canReply ? (
        <Column gap="12">
          <ReplyForm action={replyAction.bind(null, id)} placeholder="Write a reply. Clinical guidance belongs here; emergencies should be handled by phone." />
          <form action={closeThreadAction.bind(null, id)}>
            <button type="submit" className="link-button">Mark resolved and close</button>
          </form>
        </Column>
      ) : (
        <Text variant="body-default-s" onBackground="neutral-weak">{thread.closed ? "This conversation is closed." : "Administrators can review conversations but not reply."}</Text>
      )}
    </Column>
  );
}

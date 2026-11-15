import { notFound } from "next/navigation";
import { Column, Feedback, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { replyAction } from "@/app/messages-actions";
import { ReplyForm } from "@/components/messages/message-forms";
import { ThreadView } from "@/components/messages/thread-view";
import { AuditedDenial } from "@/lib/audit";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { getThread, MessageError, TOPICS } from "@/lib/services/messages";

export const metadata = { title: "Conversation" };

export default async function PortalThreadPage({ params, searchParams }: PageProps<"/portal/messages/[id]">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const { id } = await params;
  const query = await searchParams;
  const thread = await getThread(ctx, id).catch((error) => {
    if (error instanceof MessageError || error instanceof AuditedDenial) notFound();
    throw error;
  });

  return (
    <Column gap="20" fillWidth maxWidth="m">
      <SmartLink href="/portal/messages">← Messages</SmartLink>
      <Row gap="12" vertical="center" wrap>
        <Heading as="h1" variant="display-strong-xs">{thread.subject}</Heading>
        <Tag variant="neutral" label={TOPICS[thread.category]?.label ?? thread.category} />
      </Row>
      {query.sent && <Feedback variant="success" description="Sent securely. We'll email you when there's a reply." />}
      <ThreadView messages={thread.messages} />
      {thread.canReply ? (
        <ReplyForm action={replyAction.bind(null, id)} placeholder="Write your reply" />
      ) : (
        <Text variant="body-default-s" onBackground="neutral-weak">This conversation is closed. Start a new message if you need anything else.</Text>
      )}
    </Column>
  );
}

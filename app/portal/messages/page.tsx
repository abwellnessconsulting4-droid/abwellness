import { Button, Column, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { listThreads, TOPICS } from "@/lib/services/messages";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Messages" };

export default async function PortalMessagesPage() {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  if (!ctx.patientId) return <Text variant="body-default-m">Your account isn&apos;t linked to a client record yet.</Text>;
  const threads = await listThreads(ctx);

  return (
    <Column gap="24" fillWidth maxWidth="m">
      <Row horizontal="between" vertical="center" gap="12" wrap>
        <Column gap="8">
          <Heading as="h1" variant="display-strong-xs">Messages</Heading>
          <Text variant="body-default-m" onBackground="neutral-medium">Secure messages with your care team. We usually reply within 2 business days.</Text>
        </Column>
        <Button href="/portal/messages/new" variant="primary" label="New message" prefixIcon="mail" />
      </Row>
      <div role="note" className="crisis-notice compact">
        <Text variant="body-default-s">
          Messages aren&apos;t monitored around the clock. <strong>If you&apos;re in crisis, call or text 988, or call 911.</strong>
        </Text>
      </div>

      {threads.length === 0 ? (
        <Text variant="body-default-m" onBackground="neutral-weak">No messages yet.</Text>
      ) : (
        <Column gap="8">
          {threads.map((t) => (
            <Column key={t.id} gap="4" padding="16" radius="l" background="surface" border={t.unread ? "brand-alpha-medium" : "neutral-alpha-weak"}>
              <Row horizontal="between" vertical="center" gap="8" wrap>
                <SmartLink href={`/portal/messages/${t.id}`}>{t.subject}</SmartLink>
                <Row gap="8">
                  {t.unread && <Tag variant="brand" label="New reply" />}
                  {t.closed && <Tag variant="neutral" label="Closed" />}
                </Row>
              </Row>
              <Text variant="body-default-xs" onBackground="neutral-weak">
                {TOPICS[t.category]?.label ?? t.category}
                {t.lastMessageAt ? ` · ${formatDateTime(t.lastMessageAt)}` : ""}
              </Text>
            </Column>
          ))}
        </Column>
      )}
    </Column>
  );
}

import Link from "next/link";
import { Button, Column, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { can, STAFF_ROLES } from "@/lib/rbac";
import { listThreads, TOPICS } from "@/lib/services/messages";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Messages" };

export default async function StaffMessagesPage({ searchParams }: PageProps<"/dashboard/messages">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const { view } = await searchParams;
  const unreadOnly = view === "unread";
  const threads = await orForbidden(listThreads(ctx, { unreadOnly }));
  const canStart = can(ctx.role, "message", "create") && ctx.role !== "SUPER_ADMIN";

  return (
    <Column gap="24" fillWidth>
      <Row horizontal="between" vertical="center" gap="12" wrap>
        <Column gap="8">
          <Heading as="h1" variant="display-strong-xs">Messages</Heading>
          <Text variant="body-default-m" onBackground="neutral-medium">
            {ctx.role === "PROVIDER" ? "Conversations with your clients." : ctx.role === "BILLING_STAFF" ? "Billing and insurance questions." : ctx.role === "FRONT_DESK" ? "Scheduling, billing, and general questions (clinical threads go to providers)." : "All conversations (read-only)."}
          </Text>
        </Column>
        {canStart && <Button href="/dashboard/messages/new" variant="primary" label="New message" prefixIcon="mail" />}
      </Row>

      <nav aria-label="Message filter" className="chart-tabs">
        <Link href="?view=all" aria-current={!unreadOnly ? "page" : undefined}>All</Link>
        <Link href="?view=unread" aria-current={unreadOnly ? "page" : undefined}>Unread</Link>
      </nav>

      {threads.length === 0 ? (
        <Text variant="body-default-m" onBackground="neutral-weak">{unreadOnly ? "You're all caught up." : "No conversations yet."}</Text>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col">Client</th>
                <th scope="col">Topic</th>
                <th scope="col">Last message</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {threads.map((t) => (
                <tr key={t.id} className={t.unread ? "is-unread" : undefined}>
                  <td>
                    <SmartLink href={`/dashboard/messages/${t.id}`}>{t.subject}</SmartLink>
                  </td>
                  <td>{t.patient}</td>
                  <td>{TOPICS[t.category]?.staffLabel ?? t.category}</td>
                  <td>{t.lastMessageAt ? formatDateTime(t.lastMessageAt) : "—"}</td>
                  <td>
                    <Row gap="8" wrap>
                      {t.unread && <Tag variant="brand" label="New" />}
                      {t.closed ? <Tag variant="neutral" label="Closed" /> : t.awaitingReply && <Tag variant="warning" label="Awaiting reply" />}
                    </Row>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Column>
  );
}

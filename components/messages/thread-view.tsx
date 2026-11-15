import { Column, Row, Tag, Text } from "@once-ui-system/core";
import { formatDateTime } from "@/lib/time";

export interface ThreadMessage {
  id: string;
  mine: boolean;
  fromClient: boolean;
  sender: string;
  body: string;
  at: Date;
}

/** Conversation bubbles (server component; bodies are already decrypted and authorized). */
export function ThreadView({ messages }: { messages: ThreadMessage[] }) {
  return (
    <ol className="message-list" aria-label="Messages">
      {messages.map((m) => (
        <li key={m.id} className={`message-bubble${m.mine ? " is-mine" : ""}`}>
          <Row gap="8" vertical="center" wrap>
            <Text variant="label-strong-s">{m.mine ? "You" : m.sender}</Text>
            {!m.fromClient && !m.mine && <Tag variant="neutral" label="Care team" />}
            <Text variant="label-default-xs" onBackground="neutral-weak">{formatDateTime(m.at)}</Text>
          </Row>
          <Column paddingTop="4">
            <Text variant="body-default-m" style={{ whiteSpace: "pre-wrap" }}>{m.body}</Text>
          </Column>
        </li>
      ))}
    </ol>
  );
}

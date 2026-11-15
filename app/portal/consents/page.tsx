import { Column, Feedback, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { myConsents, type ConsentState } from "@/lib/services/consents";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Consents" };

const STATE: Record<ConsentState, { label: string; variant: "success" | "warning" | "danger" | "info" }> = {
  SIGNED: { label: "Signed", variant: "success" },
  NEEDS_SIGNATURE: { label: "Needs your signature", variant: "warning" },
  EXPIRED: { label: "Expired: please sign again", variant: "danger" },
  UPDATED: { label: "Updated: please review", variant: "info" },
};

export default async function PortalConsentsPage({ searchParams }: PageProps<"/portal/consents">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const query = await searchParams;
  if (!ctx.patientId) return <Text variant="body-default-m">Your account isn&apos;t linked to a client record yet.</Text>;
  const consents = await myConsents(ctx);
  const todo = consents.filter((c) => c.available && c.state !== "SIGNED").length;

  return (
    <Column gap="24" fillWidth maxWidth="m">
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">Consents</Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          {todo === 0 ? "All your agreements are signed. Thank you!" : `${todo} ${todo === 1 ? "agreement needs" : "agreements need"} your signature.`}
        </Text>
      </Column>
      {query.signed && <Feedback variant="success" description="Signed. A copy is saved to your record." />}
      {consents.map((c) => {
        const tag = STATE[c.state];
        return (
          <Column key={c.type} gap="8" padding="20" radius="l" background="surface" border={c.state === "SIGNED" ? "neutral-alpha-weak" : "accent-alpha-medium"}>
            <Row horizontal="between" vertical="center" gap="12" wrap>
              <Text variant="label-strong-m">{c.title}</Text>
              <Tag variant={tag.variant} label={tag.label} />
            </Row>
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {c.signedAt ? `Signed ${formatDate(c.signedAt)} (version ${c.signedVersion})` : "Not signed yet"}
              {c.expiresAt && c.state === "SIGNED" ? ` · renews ${formatDate(c.expiresAt)}` : ""}
            </Text>
            {c.available && <SmartLink href={`/portal/consents/${c.type}`}>{c.state === "SIGNED" ? "Read again" : "Review and sign"}</SmartLink>}
          </Column>
        );
      })}
      <Text variant="body-default-xs" onBackground="neutral-weak">
        To share your records with someone outside our practice (a release of information), or to withdraw a consent, message us and we&apos;ll help.
      </Text>
    </Column>
  );
}

import { notFound } from "next/navigation";
import { Column, Heading, SmartLink, Text } from "@once-ui-system/core";
import { signConsentAction } from "@/app/portal/records-actions";
import { ConsentSignForm } from "@/components/portal/records-forms";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { ConsentError, consentForSigning, myConsents } from "@/lib/services/consents";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Review and sign" };

/** Minimal, safe rendering of the template's markdown: headings, bullets, paragraphs. */
function Body({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="consent-body">
      {blocks.map((block, i) => {
        const heading = block.match(/^(#{1,3})\s+(.*)$/);
        if (heading) return heading[1].length === 1 ? <h2 key={i}>{heading[2]}</h2> : <h3 key={i}>{heading[2]}</h3>;
        const lines = block.split("\n");
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^[-*]\s+/, "").replace(/\*\*/g, "")}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{block.replace(/\*\*/g, "")}</p>;
      })}
    </div>
  );
}

export default async function ConsentSignPage({ params }: PageProps<"/portal/consents/[type]">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const { type } = await params;
  const form = await consentForSigning(ctx, type).catch((error) => {
    if (error instanceof ConsentError) notFound();
    throw error;
  });
  const current = (await myConsents(ctx)).find((c) => c.type === form.type);

  return (
    <Column gap="20" fillWidth maxWidth="m">
      <SmartLink href="/portal/consents">← Consents</SmartLink>
      <Column gap="4">
        <Heading as="h1" variant="display-strong-xs">{form.title}</Heading>
        <Text variant="body-default-s" onBackground="neutral-medium">
          Version {form.version}
          {form.renewalDays ? ` · renews every ${Math.round(form.renewalDays / 30)} months` : ""}
        </Text>
      </Column>
      <Column padding="24" radius="l" background="surface" border="neutral-alpha-weak">
        <Body markdown={form.body} />
      </Column>
      {current?.state === "SIGNED" ? (
        <Text variant="body-default-s" onBackground="neutral-medium">You signed this version on {current.signedAt ? formatDate(current.signedAt) : "file"}.</Text>
      ) : (
        <ConsentSignForm action={signConsentAction.bind(null, form.type)} contentHash={form.contentHash} expectedName={ctx.displayName ?? "your full name"} />
      )}
    </Column>
  );
}

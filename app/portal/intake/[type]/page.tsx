import { notFound } from "next/navigation";
import { Column, Heading, SmartLink, Text } from "@once-ui-system/core";
import { screenerAction } from "@/app/portal/records-actions";
import { ScreenerForm } from "@/components/portal/records-forms";
import { requireSession } from "@/lib/dal";
import { ANSWER_CHOICES, SCREENERS, type ScreenerType } from "@/lib/services/assessments";

export const metadata = { title: "Questionnaire" };

export default async function ScreenerPage({ params }: PageProps<"/portal/intake/[type]">) {
  await requireSession({ roles: ["PATIENT"] });
  const { type } = await params;
  if (!(type in SCREENERS)) notFound();
  const screener = SCREENERS[type as ScreenerType];

  return (
    <Column gap="20" fillWidth maxWidth="m">
      <SmartLink href="/portal/intake">← Forms &amp; intake</SmartLink>
      <Heading as="h1" variant="display-strong-xs">{screener.title}</Heading>
      <ScreenerForm action={screenerAction.bind(null, type as ScreenerType, screener.items.length)} items={screener.items} choices={ANSWER_CHOICES} intro={screener.intro} />
      <Text variant="body-default-xs" onBackground="neutral-weak">
        This questionnaire isn&apos;t monitored in real time. If you&apos;re in crisis, call or text 988, or call 911.
      </Text>
    </Column>
  );
}

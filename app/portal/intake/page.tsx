import { Column, Feedback, Heading, Row, SmartLink, Text } from "@once-ui-system/core";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { CrisisNotice } from "@/components/portal/crisis-notice";
import { myScreeners, SCREENERS, type ScreenerType } from "@/lib/services/assessments";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Forms & intake" };

const LABEL: Record<string, string> = { MINIMAL: "Minimal", MILD: "Mild", MODERATE: "Moderate", MODERATELY_SEVERE: "Moderately severe", SEVERE: "Severe" };

export default async function PortalIntakePage({ searchParams }: PageProps<"/portal/intake">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const query = await searchParams;
  if (!ctx.patientId) return <Text variant="body-default-m">Your account isn&apos;t linked to a client record yet.</Text>;
  const history = await myScreeners(ctx);
  const done = typeof query.done === "string" ? history.find((h) => h.id === query.done) : undefined;
  const flagged = Boolean(done?.safetyFlag);

  return (
    <Column gap="24" fillWidth maxWidth="m">
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">Forms &amp; intake</Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          Short check-ins help your provider see how you&apos;re doing between visits. Your answers go to your care team and are kept private.
        </Text>
      </Column>

      {done && (
        <Feedback
          variant="success"
          title="Thanks for completing it"
          description={`Your ${done.type === "PHQ9" ? "PHQ-9" : "GAD-7"} score is ${done.score} (${LABEL[done.severity ?? ""] ?? ""}). Your provider will go over it with you.`}
        />
      )}
      {flagged && <CrisisNotice />}

      {(Object.keys(SCREENERS) as ScreenerType[]).map((type) => {
        const last = history.find((h) => h.type === type);
        return (
          <Column key={type} gap="8" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
            <Row horizontal="between" vertical="center" gap="12" wrap>
              <Text variant="label-strong-m">{SCREENERS[type].title}</Text>
              <Text variant="body-default-xs" onBackground="neutral-weak">{SCREENERS[type].items.length} questions · about 2 minutes</Text>
            </Row>
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {last ? `Last completed ${formatDate(last.completedAt)}: score ${last.score} (${LABEL[last.severity ?? ""] ?? ""})` : "Not completed yet"}
            </Text>
            <SmartLink href={`/portal/intake/${type}`}>{last ? "Take it again" : "Start"}</SmartLink>
          </Column>
        );
      })}
    </Column>
  );
}

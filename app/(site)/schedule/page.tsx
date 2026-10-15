import { Button, Column, Feedback, Grid, Heading, Icon, Row, Text } from "@once-ui-system/core";
import { CtaBand, PageHero, Section } from "@/components/site/blocks";
import { APPOINTMENT_TYPES } from "@/content/site";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Schedule a consultation",
  description: "Book a free introductory call, an intake consultation, or an organizational discovery session.",
  path: "/schedule",
});

export default function SchedulePage() {
  return (
    <>
      <PageHero
        eyebrow="Schedule"
        title="Book a time to talk"
        description="Pick the conversation that fits where you are. Every relationship starts with a free introductory call."
      />
      <Section id="appointment-types" title="Consultation types">
        <Grid columns="3" gap="16" m={{ columns: 1 }}>
          {APPOINTMENT_TYPES.map((type) => (
            <Column key={type.name} gap="16" padding="24" radius="l" background="surface" border="neutral-alpha-weak">
              <Row gap="12" vertical="center">
                <Icon name={type.icon} onBackground="brand-medium" decorative />
                <Heading as="h3" variant="heading-strong-m">
                  {type.name}
                </Heading>
              </Row>
              <Text variant="label-default-s" onBackground="accent-medium">
                {type.duration}
              </Text>
              <Text variant="body-default-s" onBackground="neutral-medium">
                {type.description}
              </Text>
              <Row paddingTop="8">
                <Button href="/request-services" variant="secondary" size="s" label="Request this time" />
              </Row>
            </Column>
          ))}
        </Grid>
        <Column fillWidth maxWidth="m" className="mx-auto">
          <Feedback
            variant="info"
            title="Online booking is on the way"
            description="Soon you'll be able to choose a time directly from our calendar. For now, send a request and we'll reach out with available times."
          />
        </Column>
      </Section>
      <CtaBand />
    </>
  );
}

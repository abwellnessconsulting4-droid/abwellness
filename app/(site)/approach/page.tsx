import { Column, Heading, Row, Text } from "@once-ui-system/core";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/blocks";
import { APPROACH_STEPS, PRINCIPLES } from "@/content/site";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Our approach",
  description:
    "A person-centered, strengths-based process: connect, understand, plan, support, and grow, at a pace that works for you.",
  path: "/approach",
});

export default function ApproachPage() {
  return (
    <>
      <PageHero
        eyebrow="Our approach"
        title="Calm, clear, and built around you"
        description="Lasting change rarely comes from a single breakthrough. It comes from steady steps, the right support, and a plan you believe in."
      />

      <Section id="process" eyebrow="The process" title="Five steps, at your pace">
        <Column as="ol" fillWidth maxWidth="m" gap="16" className="list-none p-0 my-0 mx-auto">
          {APPROACH_STEPS.map((step, index) => (
            <Row
              as="li"
              key={step.title}
              gap="24"
              padding="24"
              radius="l"
              background="surface"
              border="neutral-alpha-weak"
              vertical="start"
              s={{ gap: "16", padding: "20" }}
            >
              <Text variant="display-strong-s" onBackground="accent-medium" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </Text>
              <Column gap="8">
                <Heading as="h3" variant="heading-strong-l">
                  {step.title}
                </Heading>
                <Text variant="body-default-m" onBackground="neutral-medium">
                  {step.description}
                </Text>
              </Column>
            </Row>
          ))}
        </Column>
      </Section>

      <Section id="principles" eyebrow="Our principles" title="What you can count on">
        <FeatureGrid items={PRINCIPLES} columns={4} />
      </Section>

      <CtaBand title="Start with a conversation" />
    </>
  );
}

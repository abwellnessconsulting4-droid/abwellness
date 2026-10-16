import { Button, Column, Heading, Row, Text } from "@once-ui-system/core";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/blocks";
import { AUDIENCES, FOUNDER, VALUES } from "@/content/site";
import { SITE_NAME } from "@/lib/constants";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "About us",
  description: `${SITE_NAME} offers calm, personal wellness support for individuals, families, and organizations, grounded in long-term growth.`,
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About us"
        title="Steady support for the moments that shape a life"
        description={`${SITE_NAME} exists so that people, and the organizations that serve them, have a calm, capable partner for building wellbeing that lasts.`}
      />

      <Section id="mission" align="start">
        <Row fillWidth gap="48" m={{ direction: "column", gap: "32" }}>
          <Column flex={1} gap="16">
            <Text variant="label-default-s" onBackground="accent-medium">
              Our mission
            </Text>
            <Heading as="h2" id="mission-title" variant="display-strong-xs" wrap="balance">
              Solutions for growth. Support for life.
            </Heading>
          </Column>
          <Column flex={1} gap="16">
            <Text variant="body-default-l" onBackground="neutral-medium">
              We help people build the routines, skills, and connections that make everyday life feel
              more manageable, and we stay alongside them while those changes take root.
            </Text>
            <Text variant="body-default-l" onBackground="neutral-medium">
              Our work blends coaching, practical skill-building, and care coordination, so the
              people we serve don&apos;t have to navigate complicated systems alone. [Add the
              organization&apos;s origin story and community focus.]
            </Text>
          </Column>
        </Row>
      </Section>

      <Section id="values" eyebrow="What guides us" title="Our values">
        <FeatureGrid items={VALUES} columns={4} />
      </Section>

      <Section id="who-we-serve" eyebrow="Who we serve" title="People, families, and organizations">
        <FeatureGrid items={AUDIENCES} />
      </Section>

      <Section id="leadership" eyebrow="Leadership" title={`Led by ${FOUNDER.name}`}>
        <Column horizontal="center" gap="20">
          <Text variant="body-default-m" onBackground="neutral-medium" align="center">
            {FOUNDER.title}. {FOUNDER.credentials}
          </Text>
          <Button href="/founder" variant="secondary" label="Meet our founder" suffixIcon="arrowRight" />
        </Column>
      </Section>

      <CtaBand />
    </>
  );
}

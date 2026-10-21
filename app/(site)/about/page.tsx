import { Button, Column, Heading, Icon, Row, Tag, Text } from "@once-ui-system/core";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/blocks";
import { AUDIENCES, FOUNDER, VALUES } from "@/content/site";
import { SITE_NAME } from "@/lib/constants";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "About us",
  description: `${SITE_NAME}, founded by ${FOUNDER.name}, ${FOUNDER.postNominal}, offers calm, personal support for individuals, families, and organizations, backed by 20+ years in social work, behavioral health, and housing services.`,
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
              {SITE_NAME} was founded by {FOUNDER.name}, {FOUNDER.postNominal}, who brings more than
              20 years of experience in social work, behavioral health, and housing services. That
              experience shapes everything we do: practical help, coordinated with the services people
              already rely on, delivered with dignity and respect.
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

      <Section id="leadership" align="start">
        <Row
          fillWidth
          gap="48"
          padding="40"
          radius="xl"
          background="surface"
          border="neutral-alpha-weak"
          vertical="start"
          m={{ direction: "column", gap: "32" }}
          s={{ padding: "24" }}
        >
          <Column flex={3} gap="20">
            <Text variant="label-default-s" onBackground="accent-medium">
              Leadership
            </Text>
            <Column gap="8">
              <Heading as="h2" id="leadership-title" variant="display-strong-xs">
                {FOUNDER.name}, {FOUNDER.postNominal}
              </Heading>
              <Text variant="body-default-m" onBackground="brand-medium">
                {FOUNDER.title}
              </Text>
            </Column>
            <Row as="ul" gap="8" wrap aria-label="Areas of focus" className="list-none p-0 m-0">
              {FOUNDER.specialties.map((specialty) => (
                <li key={specialty}>
                  <Tag size="m" variant="brand" label={specialty} />
                </li>
              ))}
            </Row>
            {FOUNDER.summary.map((paragraph) => (
              <Text key={paragraph} as="p" variant="body-default-l" onBackground="neutral-medium" className="m-0">
                {paragraph}
              </Text>
            ))}
            <Row>
              <Button
                href="/founder"
                variant="secondary"
                label={`Read ${FOUNDER.firstName}'s full story`}
                suffixIcon="arrowRight"
              />
            </Row>
          </Column>

          <Column flex={2} gap="24" fillWidth>
            <Column as="ul" gap="16" className="list-none p-0 m-0">
              {FOUNDER.highlights.map((item) => (
                <Row as="li" key={item} gap="12" vertical="start">
                  <Icon name="checkCircle" onBackground="accent-medium" decorative />
                  <Text variant="body-default-m">{item}</Text>
                </Row>
              ))}
            </Column>
            <Column
              gap="12"
              padding="24"
              radius="l"
              background="brand-alpha-weak"
              border="brand-alpha-medium"
            >
              <Text variant="label-default-s" onBackground="accent-medium">
                {FOUNDER.firstName}&apos;s mission
              </Text>
              <Text variant="heading-default-m" className="font-heading">
                {FOUNDER.mission}
              </Text>
            </Column>
          </Column>
        </Row>
      </Section>

      <CtaBand />
    </>
  );
}

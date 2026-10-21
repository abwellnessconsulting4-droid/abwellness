import Image from "next/image";
import { Column, Heading, Icon, Row, Tag, Text } from "@once-ui-system/core";
import { CtaBand, PageHero, Section } from "@/components/site/blocks";
import { FOUNDER } from "@/content/site";
import { SITE_NAME } from "@/lib/constants";
import { founderJsonLd, JsonLd } from "@/components/site/json-ld";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: `${FOUNDER.name}, ${FOUNDER.postNominal}, Founder`,
  description: `${FOUNDER.name}, ${FOUNDER.postNominal}, founder of ${SITE_NAME}, brings 20+ years in social work, behavioral health, and housing services, plus staff development and program consultation.`,
  path: "/founder",
});

export default function FounderPage() {
  return (
    <>
      <JsonLd data={founderJsonLd()} />
      <PageHero
        eyebrow="Our founder"
        title={`${FOUNDER.name}, ${FOUNDER.postNominal}`}
        description={`${FOUNDER.title}, ${SITE_NAME}. ${FOUNDER.specialties.join(" · ")}`}
      />

      <Section id="story" align="start">
        <Row fillWidth gap="48" vertical="start" m={{ direction: "column", gap: "32" }}>
          <Column flex={2} gap="20" horizontal="center" fillWidth className="founder-aside">
            <Column
              fillWidth
              aspectRatio="4 / 5"
              radius="xl"
              overflow="hidden"
              position="relative"
              border="accent-alpha-medium"
              maxWidth={24}
            >
              <Image
                src={FOUNDER.photo}
                alt={`Portrait of ${FOUNDER.name}`}
                fill
                priority
                sizes="(max-width: 1024px) 384px, 384px"
                className="founder-photo"
              />
            </Column>
            <Column as="ul" gap="12" fillWidth className="list-none p-0 m-0">
              {FOUNDER.highlights.map((item) => (
                <Row as="li" key={item} gap="8" vertical="center">
                  <Icon name="checkCircle" size="s" onBackground="accent-medium" decorative />
                  <Text variant="body-default-s">{item}</Text>
                </Row>
              ))}
            </Column>
          </Column>

          <Column flex={3} gap="24">
            <Heading as="h2" id="story-title" variant="display-strong-xs">
              {FOUNDER.firstName}&apos;s story
            </Heading>
            {FOUNDER.bio.map((paragraph) => (
              <Text key={paragraph} variant="body-default-l" onBackground="neutral-medium">
                {paragraph}
              </Text>
            ))}
            <Column gap="12" paddingTop="8">
              <Heading as="h3" variant="heading-strong-m">
                Areas of expertise
              </Heading>
              <Row as="ul" gap="8" wrap className="list-none p-0 m-0">
                {FOUNDER.expertise.map((item) => (
                  <li key={item}>
                    <Tag size="m" variant="neutral" label={item} />
                  </li>
                ))}
              </Row>
            </Column>
            <Column
              gap="12"
              padding="24"
              radius="l"
              background="brand-alpha-weak"
              border="brand-alpha-medium"
            >
              <Text variant="label-default-s" onBackground="accent-medium">
                Mission
              </Text>
              <Text variant="heading-default-l" className="font-heading">
                {FOUNDER.mission}
              </Text>
            </Column>
          </Column>
        </Row>
      </Section>

      <CtaBand title={`Work with ${FOUNDER.firstName} and the team`} />
    </>
  );
}

import { Column, Heading, Icon, Row, Text } from "@once-ui-system/core";
import { CtaBand, PageHero, Section } from "@/components/site/blocks";
import { FOUNDER } from "@/content/site";
import { SITE_NAME } from "@/lib/constants";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: `${FOUNDER.name}, Founder`,
  description: `Meet ${FOUNDER.name}, founder and principal consultant of ${SITE_NAME}.`,
  path: "/founder",
});

export default function FounderPage() {
  return (
    <>
      <PageHero eyebrow="Our founder" title={FOUNDER.name} description={`${FOUNDER.title}, ${SITE_NAME}`} />

      <Section id="story" align="start">
        <Row fillWidth gap="48" vertical="start" m={{ direction: "column", gap: "32" }}>
          <Column flex={2} gap="20" horizontal="center" fillWidth>
            {/* Replace with a professional photo: public/images/founder.jpg */}
            <Column
              fillWidth
              aspectRatio="4 / 5"
              radius="xl"
              center
              gap="12"
              background="surface"
              border="accent-alpha-medium"
              maxWidth={24}
            >
              <Text variant="display-strong-l" onBackground="accent-medium" className="monogram monogram--l" aria-hidden>
                AB
              </Text>
              <Text variant="label-default-s" onBackground="neutral-weak">
                [Founder photo]
              </Text>
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
            <Text variant="body-default-s" onBackground="neutral-weak">
              Credentials: {FOUNDER.credentials}
            </Text>
            <Column
              as="blockquote"
              gap="12"
              paddingLeft="24"
              paddingY="8"
              borderLeft="accent-medium"
              borderWidth={2}
              className="m-0"
            >
              <Text variant="heading-default-l" className="font-heading">
                &ldquo;{FOUNDER.quote}&rdquo;
              </Text>
              <Text variant="label-default-s" onBackground="neutral-medium">
                {FOUNDER.name}
              </Text>
            </Column>
          </Column>
        </Row>
      </Section>

      <CtaBand title={`Work with ${FOUNDER.firstName} and the team`} />
    </>
  );
}

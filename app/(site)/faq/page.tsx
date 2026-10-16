import { AccordionGroup, Column, Heading, Text } from "@once-ui-system/core";
import { CtaBand, PageHero, Section } from "@/components/site/blocks";
import { FAQ_GROUPS } from "@/content/site";
import { faqJsonLd, JsonLd } from "@/components/site/json-ld";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Frequently asked questions",
  description: "Answers about getting started, sessions, fees, privacy, and what to do in an emergency.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqJsonLd()} />
      <PageHero
        eyebrow="FAQ"
        title="Questions, answered"
        description="If you don't see your question here, reach out. We're happy to help."
      />
      <Section id="questions">
        <Column fillWidth maxWidth="m" className="mx-auto" gap="40">
          {FAQ_GROUPS.map((group) => (
            <Column key={group.title} gap="16">
              <Heading as="h2" variant="heading-strong-l">
                {group.title}
              </Heading>
              <Column fillWidth radius="l" border="neutral-alpha-weak" background="surface" overflow="hidden">
                <AccordionGroup
                  items={group.items.map((item) => ({
                    title: item.question,
                    content: (
                      <Text variant="body-default-m" onBackground="neutral-medium">
                        {item.answer}
                      </Text>
                    ),
                  }))}
                />
              </Column>
            </Column>
          ))}
        </Column>
      </Section>
      <CtaBand title="Still have questions?" />
    </>
  );
}

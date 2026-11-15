import { Column, Feedback, Heading, Row, Text } from "@once-ui-system/core";
import { PageHero, Prose, Section } from "@/components/site/blocks";
import type { LegalDocument } from "@/content/legal";

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <>
      <PageHero eyebrow="Legal" title={document.title} description={document.summary} />
      <Section id="document" align="start">
        <Prose>
          <Feedback
            variant="warning"
            title="Draft for review"
            description="This text is a starting draft and must be reviewed by legal counsel before launch."
          />
          <Text variant="label-default-s" onBackground="neutral-weak">
            Effective: {document.effectiveDate}
          </Text>
          {document.sections.map((section) => (
            <Column as="section" key={section.heading} id={section.id} gap="12" className="legal-section">
              <Heading as="h2" variant="heading-strong-l">
                {section.heading}
              </Heading>
              {section.paragraphs?.map((paragraph) => (
                <Text key={paragraph} as="p" variant="body-default-m" onBackground="neutral-medium" className="m-0">
                  {paragraph}
                </Text>
              ))}
              {section.list && (
                <Column as="ul" gap="8" paddingLeft="20" className="m-0">
                  {section.list.map((item) => (
                    <Row as="li" key={item} className="list-item">
                      <Text variant="body-default-m" onBackground="neutral-medium">
                        {item}
                      </Text>
                    </Row>
                  ))}
                </Column>
              )}
            </Column>
          ))}
        </Prose>
      </Section>
    </>
  );
}

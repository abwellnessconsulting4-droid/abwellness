import { Column, Heading, Row, Text } from "@once-ui-system/core";
import { RequestServicesForm } from "@/components/forms/request-services-form";
import { PageHero, Section } from "@/components/site/blocks";
import { APPROACH_STEPS } from "@/content/site";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Request services",
  description: "Tell us a little about what you're looking for and we'll reach out to schedule a free introductory call.",
  path: "/request-services",
});

export default function RequestServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Request services"
        title="Let's find the right support together"
        description="Share a few details and we'll reach out to schedule a free introductory call. It takes about two minutes."
      />
      <Section id="request" align="start">
        <Row fillWidth gap="32" vertical="start" m={{ direction: "column" }}>
          <Column flex={3} fillWidth padding="32" radius="l" background="surface" border="neutral-alpha-weak" s={{ padding: "20" }}>
            <RequestServicesForm />
          </Column>
          <Column flex={2} fillWidth gap="20" padding="32" radius="l" border="neutral-alpha-weak" s={{ padding: "24" }}>
            <Heading as="h2" variant="heading-strong-l">
              What happens next
            </Heading>
            <Column as="ol" gap="16" className="list-none p-0 m-0">
              {APPROACH_STEPS.slice(0, 3).map((step, index) => (
                <Row as="li" key={step.title} gap="12" vertical="start">
                  <Text variant="heading-strong-m" onBackground="accent-medium" aria-hidden>
                    {index + 1}.
                  </Text>
                  <Column gap="4">
                    <Text variant="heading-strong-s">{step.title}</Text>
                    <Text variant="body-default-s" onBackground="neutral-medium">
                      {step.description}
                    </Text>
                  </Column>
                </Row>
              ))}
            </Column>
          </Column>
        </Row>
      </Section>
    </>
  );
}

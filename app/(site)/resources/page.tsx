import { Column, Grid, Heading, Icon, Row, SmartLink, Text } from "@once-ui-system/core";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/blocks";
import { CRISIS_RESOURCES, RESOURCE_COLLECTIONS } from "@/content/site";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Resources",
  description:
    "Crisis lines, community services, and practical guides for individuals, families, caregivers, and organizations.",
  path: "/resources",
});

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Helpful tools and trusted connections"
        description="Guides and toolkits to support your progress between sessions, plus where to turn right away if you need urgent help."
      />

      <Section id="urgent-help" eyebrow="Need help now?" title="Urgent and crisis support">
        <Grid columns="3" gap="16" m={{ columns: 1 }}>
          {CRISIS_RESOURCES.map((resource) => (
            <Column
              key={resource.name}
              gap="12"
              padding="24"
              radius="l"
              background="surface"
              border="danger-alpha-medium"
            >
              <Row gap="8" vertical="center">
                <Icon name="lifebuoy" onBackground="danger-medium" decorative />
                <Heading as="h3" variant="heading-strong-m">
                  {resource.name}
                </Heading>
              </Row>
              <SmartLink href={resource.href}>
                <Text variant="heading-strong-l">{resource.contact}</Text>
              </SmartLink>
              <Text variant="body-default-s" onBackground="neutral-medium">
                {resource.description}
              </Text>
            </Column>
          ))}
        </Grid>
        <Text variant="body-default-s" onBackground="neutral-weak" align="center">
          {"AB Wellness Consulting does not provide emergency or crisis services."}
        </Text>
      </Section>

      <Section id="library" eyebrow="Library" title="Guides and toolkits">
        <FeatureGrid items={RESOURCE_COLLECTIONS} columns={4} />
      </Section>

      <CtaBand title="Looking for something specific?" description="Tell us what you need and we'll point you to the right resource, or help you get connected." />
    </>
  );
}

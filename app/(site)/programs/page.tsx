import { Button, Column, Grid, Heading, Icon, Row, Tag, Text } from "@once-ui-system/core";
import { CtaBand, PageHero, Section } from "@/components/site/blocks";
import { PROGRAMS } from "@/content/site";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Programs",
  description:
    "Structured programs for building routines, finding stable housing, learning in groups, and supporting workplace wellness.",
  path: "/programs",
});

export default function ProgramsPage() {
  return (
    <>
      <PageHero
        eyebrow="Programs"
        title="Structured programs for focused goals"
        description="Each program pairs a clear structure with personal support, so you always know what you're working toward and who's helping."
      />
      <Section id="program-list" title="Current programs" description="[Confirm program names, length, format, and availability.]">
        <Grid columns="2" gap="16" s={{ columns: 1 }}>
          {PROGRAMS.map((program) => (
            <Column
              key={program.name}
              as="article"
              gap="20"
              padding="32"
              radius="l"
              background="surface"
              border="neutral-alpha-weak"
              s={{ padding: "24" }}
            >
              <Column gap="8">
                <Heading as="h3" variant="heading-strong-xl">
                  {program.name}
                </Heading>
                <Text variant="body-default-m" onBackground="neutral-medium">
                  {program.summary}
                </Text>
              </Column>
              <Row gap="8" wrap>
                <Tag size="s" variant="brand" prefixIcon="clock" label={program.duration} />
                <Tag size="s" variant="neutral" prefixIcon="users" label={program.format} />
              </Row>
              <Text variant="label-default-s" onBackground="accent-medium">
                For: {program.audience}
              </Text>
              <Column as="ul" gap="8" className="list-none p-0 m-0">
                {program.includes.map((item) => (
                  <Row as="li" key={item} gap="8" vertical="center">
                    <Icon name="check" size="xs" onBackground="accent-medium" decorative />
                    <Text variant="body-default-s">{item}</Text>
                  </Row>
                ))}
              </Column>
              <Row paddingTop="8">
                <Button href="/request-services" variant="secondary" size="s" label={`Ask about ${program.name}`} />
              </Row>
            </Column>
          ))}
        </Grid>
      </Section>
      <CtaBand />
    </>
  );
}

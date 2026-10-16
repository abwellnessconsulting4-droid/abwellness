import type { Metadata } from "next";
import Image from "next/image";
import {
  Background,
  Button,
  Column,
  Grid,
  Heading,
  Row,
  Text,
} from "@once-ui-system/core";
import { CtaBand, FeatureCard, FeatureGrid, Section } from "@/components/site/blocks";
import { ComingSoon } from "@/components/ui/coming-soon";
import { APPROACH_STEPS, AUDIENCES, FOUNDER, PROGRAMS, SERVICES } from "@/content/site";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { getSiteMode } from "@/lib/site-mode";

// Title, share card, and brand image come from the root layout (mode-aware in
// resources/seo.ts); redefining openGraph here would drop the inherited image.
export function generateMetadata(): Metadata {
  if (getSiteMode() === "coming-soon") {
    return {};
  }
  return {
    description: SITE_DESCRIPTION,
    alternates: { canonical: "/" },
  };
}

export default function Home() {
  if (getSiteMode() === "coming-soon") {
    return <ComingSoon />;
  }

  return (
    <>
      <Column
        as="section"
        fillWidth
        position="relative"
        horizontal="center"
        paddingX="l"
        paddingTop="80"
        paddingBottom="64"
        s={{ paddingX: "16", paddingTop: "48" }}
      >
        <Background
          position="absolute"
          top="0"
          left="0"
          fill
          pointerEvents="none"
          gradient={{
            display: true,
            colorStart: "brand-alpha-medium",
            colorEnd: "static-transparent",
            x: 50,
            y: 0,
            width: 150,
            height: 80,
            opacity: 50,
          }}
          dots={{ display: true, color: "neutral-alpha-weak", size: "2", opacity: 30 }}
        />
        <Row
          fillWidth
          maxWidth="l"
          gap="48"
          vertical="center"
          zIndex={1}
          m={{ direction: "column", gap: "32" }}
        >
          <Column flex={3} gap="24" className="home-hero__copy">
            <Text variant="label-default-s" onBackground="accent-medium">
              {SITE_TAGLINE}
            </Text>
            <Heading as="h1" variant="display-strong-l" wrap="balance">
              Wellness consulting, designed for lasting growth.
            </Heading>
            <Text variant="body-default-l" onBackground="neutral-medium">
              {SITE_NAME} partners with people and organizations who want clearer routines,
              calmer decision-making, and support that lasts beyond a single season.
            </Text>
            <Row gap="12" wrap className="home-hero__actions">
              <Button href="/request-services" variant="primary" size="l" label="Request services" suffixIcon="arrowRight" />
              <Button href="/approach" variant="secondary" size="l" label="How we work" />
            </Row>
          </Column>
          <Column flex={2} horizontal="center">
            <Image
              src="/images/logo_ab.png"
              alt={`${SITE_NAME} logo`}
              width={420}
              height={420}
              priority
              className="home-hero__logo"
            />
          </Column>
        </Row>
      </Column>

      <Section
        id="who-we-serve"
        eyebrow="Who we serve"
        title="Support for people, families, and the organizations around them"
      >
        <FeatureGrid items={AUDIENCES} />
      </Section>

      <Section
        id="services"
        eyebrow="Services"
        title="Practical help, delivered with care"
        description="From one-on-one coaching to coordinating the services you rely on, we meet you where you are."
      >
        <FeatureGrid items={SERVICES.slice(0, 3)} />
        <Row horizontal="center">
          <Button href="/services" variant="secondary" label="See all services" suffixIcon="arrowRight" />
        </Row>
      </Section>

      <Section
        id="approach"
        eyebrow="Our approach"
        title="A clear path, one step at a time"
        description="Every relationship follows the same calm, transparent process, so you always know what comes next."
      >
        <Grid columns="5" gap="16" m={{ columns: 3 }} s={{ columns: 1 }} as="ol" className="list-none p-0 m-0">
          {APPROACH_STEPS.map((step, index) => (
            <Column as="li" key={step.title} gap="12" padding="20" radius="l" border="neutral-alpha-weak" background="surface">
              <Text variant="display-strong-xs" onBackground="accent-medium" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </Text>
              <Heading as="h3" variant="heading-strong-m">
                {step.title}
              </Heading>
              <Text variant="body-default-s" onBackground="neutral-medium">
                {step.description}
              </Text>
            </Column>
          ))}
        </Grid>
      </Section>

      <Section id="programs" eyebrow="Programs" title="Structured programs for focused goals">
        <Grid columns="4" gap="16" m={{ columns: 2 }} s={{ columns: 1 }}>
          {PROGRAMS.map((program) => (
            <FeatureCard
              key={program.name}
              icon="calendar"
              title={program.name}
              description={program.summary}
              points={[program.duration]}
            />
          ))}
        </Grid>
        <Row horizontal="center">
          <Button href="/programs" variant="secondary" label="Explore programs" suffixIcon="arrowRight" />
        </Row>
      </Section>

      <Section id="founder" align="start">
        <Row
          fillWidth
          gap="40"
          padding="40"
          radius="xl"
          background="surface"
          border="neutral-alpha-weak"
          vertical="center"
          s={{ direction: "column", padding: "24", gap: "24" }}
        >
          <Row
            width="160"
            height="160"
            radius="full"
            center
            background="brand-alpha-weak"
            border="accent-alpha-medium"
            style={{ flexShrink: 0 }}
            aria-hidden
          >
            <Text variant="display-strong-m" onBackground="accent-medium" className="monogram monogram--m">
              AB
            </Text>
          </Row>
          <Column gap="16">
            <Text variant="label-default-s" onBackground="accent-medium">
              Meet the founder
            </Text>
            <Heading as="h2" id="founder-title" variant="display-strong-xs">
              {FOUNDER.name}
            </Heading>
            <Text variant="body-default-m" onBackground="neutral-medium">
              {FOUNDER.bio[0]}
            </Text>
            <Row>
              <Button href="/founder" variant="tertiary" label={`Read ${FOUNDER.firstName}'s story`} suffixIcon="arrowRight" />
            </Row>
          </Column>
        </Row>
      </Section>

      <CtaBand />
    </>
  );
}

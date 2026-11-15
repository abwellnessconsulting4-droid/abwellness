import type { ReactNode } from "react";
import {
  Background,
  Button,
  Column,
  Grid,
  Heading,
  Icon,
  Row,
  Text,
} from "@once-ui-system/core";
import type { Feature } from "@/content/site";

interface PageHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  /** Lucide icon (resources/icons.ts) shown in the medallion and the eyebrow. */
  icon?: string;
}

/**
 * Hero for inner pages (About, Services, ...): a full-width colored band with
 * a gold accent and an icon medallion, distinct from the home page hero.
 */
export function PageHero({ eyebrow, title, description, actions, icon = "sparkles" }: PageHeroProps) {
  return (
    <section className="page-hero">
      <div className="page-hero__inner">
        <div className="page-hero__text">
          <span className="page-hero__eyebrow">
            <Icon name={icon} size="xs" decorative />
            {eyebrow}
          </span>
          <Heading as="h1" variant="display-strong-m" wrap="balance">
            {title}
          </Heading>
          <Text variant="body-default-l" onBackground="neutral-medium" wrap="balance" className="page-hero__lede">
            {description}
          </Text>
          {actions && (
            <Row gap="12" paddingTop="8" wrap>
              {actions}
            </Row>
          )}
        </div>
        <div className="page-hero__medallion" aria-hidden="true">
          <span className="page-hero__ring">
            <Icon name={icon} size="xl" decorative />
          </span>
        </div>
      </div>
    </section>
  );
}

interface SectionProps {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  align?: "start" | "center";
  children: ReactNode;
}

export function Section({ id, eyebrow, title, description, align = "center", children }: SectionProps) {
  const centered = align === "center";

  return (
    <Column
      as="section"
      id={id}
      aria-labelledby={title && id ? `${id}-title` : undefined}
      fillWidth
      maxWidth="l"
      className="mx-auto"
      paddingX="l"
      paddingY="64"
      gap="40"
      s={{ paddingX: "16", paddingY: "48" }}
    >
      {(eyebrow || title || description) && (
        <Column gap="12" maxWidth="s" horizontal={centered ? "center" : "start"} className={centered ? "mx-auto" : undefined}>
          {eyebrow && (
            <Text variant="label-default-s" onBackground="accent-medium" align={centered ? "center" : "left"}>
              {eyebrow}
            </Text>
          )}
          {title && (
            <Heading
              as="h2"
              id={id ? `${id}-title` : undefined}
              variant="display-strong-xs"
              align={centered ? "center" : "left"}
              wrap="balance"
            >
              {title}
            </Heading>
          )}
          {description && (
            <Text variant="body-default-m" onBackground="neutral-medium" align={centered ? "center" : "left"}>
              {description}
            </Text>
          )}
        </Column>
      )}
      {children}
    </Column>
  );
}

export function FeatureCard({ icon, title, description, points }: Feature) {
  return (
    <Column
      fillWidth
      fillHeight
      gap="16"
      padding="24"
      radius="l"
      background="surface"
      border="neutral-alpha-weak"
    >
      <Row
        width="48"
        height="48"
        radius="m"
        center
        background="brand-alpha-weak"
        border="brand-alpha-medium"
      >
        <Icon name={icon} onBackground="brand-strong" size="m" decorative />
      </Row>
      <Column gap="8">
        <Heading as="h3" variant="heading-strong-m">
          {title}
        </Heading>
        <Text variant="body-default-s" onBackground="neutral-medium">
          {description}
        </Text>
      </Column>
      {points && points.length > 0 && (
        <Column as="ul" gap="8" className="list-none p-0 m-0">
          {points.map((point) => (
            <Row as="li" key={point} gap="8" vertical="start">
              <Icon name="check" size="xs" onBackground="accent-medium" decorative />
              <Text variant="body-default-s" onBackground="neutral-strong">
                {point}
              </Text>
            </Row>
          ))}
        </Column>
      )}
    </Column>
  );
}

export function FeatureGrid({ items, columns = 3 }: { items: Feature[]; columns?: 2 | 3 | 4 }) {
  return (
    <Grid
      fillWidth
      columns={columns}
      gap="16"
      m={{ columns: 2 }}
      s={{ columns: 1 }}
    >
      {items.map((item) => (
        <FeatureCard key={item.title} {...item} />
      ))}
    </Grid>
  );
}

interface CtaBandProps {
  title?: string;
  description?: string;
}

export function CtaBand({
  title = "Ready to take the next step?",
  description = "Start with a free introductory call. We'll listen, answer your questions, and help you decide what comes next.",
}: CtaBandProps) {
  return (
    <Column
      as="section"
      fillWidth
      maxWidth="l"
      className="mx-auto"
      paddingX="l"
      paddingY="64"
      s={{ paddingX: "16", paddingY: "48" }}
    >
      <Column
        fillWidth
        position="relative"
        overflow="hidden"
        horizontal="center"
        gap="20"
        paddingX="40"
        paddingY="56"
        radius="xl"
        border="brand-alpha-medium"
        background="surface"
        s={{ paddingX: "20", paddingY: "40" }}
      >
        <Background
          position="absolute"
          top="0"
          left="0"
          fill
          pointerEvents="none"
          gradient={{
            display: true,
            colorStart: "accent-alpha-weak",
            colorEnd: "static-transparent",
            x: 50,
            y: 100,
            width: 100,
            height: 100,
            opacity: 60,
          }}
        />
        <Column horizontal="center" gap="20" zIndex={1}>
          <Heading as="h2" variant="display-strong-xs" align="center" wrap="balance">
            {title}
          </Heading>
          <Text variant="body-default-m" onBackground="neutral-medium" align="center" wrap="balance">
            {description}
          </Text>
          <Row gap="12" horizontal="center" wrap>
            <Button href="/request-services" variant="primary" label="Request services" suffixIcon="arrowRight" />
            <Button href="/schedule" variant="secondary" label="Schedule a consultation" />
          </Row>
        </Column>
      </Column>
    </Column>
  );
}

/** Long-form text (legal pages, bios). */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <Column fillWidth maxWidth="s" gap="24" className="prose-block mx-auto">
      {children}
    </Column>
  );
}

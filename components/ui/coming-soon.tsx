import Image from "next/image";
import {
  Background,
  Badge,
  Column,
  Heading,
  Line,
  RevealFx,
  Text,
} from "@once-ui-system/core";
import { CountdownTimer } from "@/components/ui/countdown-timer";
import { EmailCaptureForm } from "@/components/ui/email-capture-form";
import { SiteFooter } from "@/components/ui/site-footer";
import {
  LAUNCH_DATE_ISO,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/constants";

export function ComingSoon() {
  return (
    <Column
      as="main"
      fillWidth
      horizontal="center"
      minHeight="100%"
      paddingX="l"
      paddingY="32"
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
          opacity: 40,
        }}
        dots={{
          display: true,
          color: "neutral-alpha-weak",
          size: "2",
          opacity: 30,
        }}
      />
      <Column
        fillWidth
        maxWidth="m"
        horizontal="center"
        gap="40"
        paddingY="24"
        zIndex={1}
      >
        <RevealFx horizontal="center">
          <Column as="header" horizontal="center">
            <Image
              src="/images/logo_ab.png"
              alt={`${SITE_NAME} logo`}
              width={320}
              height={320}
              priority
              className="h-auto w-[220px] sm:w-[280px] md:w-[320px]"
            />
          </Column>
        </RevealFx>

        <Column horizontal="center" align="center" gap="24" maxWidth="s">
          <RevealFx horizontal="center" delay={0.15}>
            <Badge
              background="brand-alpha-weak"
              onBackground="brand-medium"
              textVariant="label-default-s"
              paddingX="16"
              paddingY="8"
            >
              Coming soon
            </Badge>
          </RevealFx>
          <RevealFx horizontal="center" delay={0.3}>
            <Heading as="h1" variant="display-strong-l" align="center">
              Wellness consulting, designed for lasting growth.
            </Heading>
          </RevealFx>
          <RevealFx horizontal="center" delay={0.45}>
            <Text
              variant="body-default-l"
              onBackground="neutral-medium"
              align="center"
            >
              {SITE_NAME} partners with people and organizations who want
              clearer routines, calmer decision-making, and support that lasts
              beyond a single season. {SITE_TAGLINE}
            </Text>
          </RevealFx>
        </Column>

        <RevealFx fillWidth horizontal="center" delay={0.6}>
          <Column fillWidth maxWidth="xs" gap="16" horizontal="center">
            <Text variant="label-default-s" onBackground="accent-medium">
              Launching in
            </Text>
            <CountdownTimer targetDate={LAUNCH_DATE_ISO} />
          </Column>
        </RevealFx>

        <RevealFx fillWidth horizontal="center" delay={0.75}>
          <Column
            fillWidth
            maxWidth="xs"
            gap="20"
            padding="24"
            radius="l"
            background="surface"
            border="neutral-alpha-weak"
            horizontal="center"
          >
            <Column gap="8" horizontal="center" align="center">
              <Heading as="h2" variant="heading-strong-m">
                Join the waitlist
              </Heading>
              <Text
                variant="body-default-s"
                onBackground="neutral-medium"
                align="center"
              >
                Be the first to hear when consultations, programs, and resources
                become available.
              </Text>
            </Column>
            <EmailCaptureForm />
          </Column>
        </RevealFx>

        <Line background="neutral-alpha-weak" />
        <SiteFooter />
      </Column>
    </Column>
  );
}

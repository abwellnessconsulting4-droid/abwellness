import { Column, Heading, Icon, Row, SmartLink, Text } from "@once-ui-system/core";
import { CONTACT_DETAILS } from "@/content/site";
import { CONTACT_EMAIL } from "@/lib/constants";
import type { IconName } from "@/resources/icons";

const ROWS: { icon: IconName; label: string; value: string; href?: string }[] = [
  { icon: "mail", label: "Email", value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
  { icon: "phone", label: "Phone", value: CONTACT_DETAILS.phone },
  { icon: "mapPin", label: "Office", value: CONTACT_DETAILS.address },
  { icon: "clock", label: "Hours", value: CONTACT_DETAILS.hours },
];

export function ContactDetails() {
  return (
    <Column gap="24" padding="32" radius="l" background="surface" border="neutral-alpha-weak" s={{ padding: "24" }}>
      <Heading as="h2" variant="heading-strong-l">
        Get in touch
      </Heading>
      <Column as="dl" gap="20" className="m-0">
        {ROWS.map((row) => (
          <Row key={row.label} gap="16" vertical="start">
            <Icon name={row.icon} onBackground="brand-medium" decorative />
            <Column gap="4">
              <Text as="dt" variant="label-default-s" onBackground="neutral-weak">
                {row.label}
              </Text>
              <Text as="dd" variant="body-default-m" className="m-0">
                {row.href ? <SmartLink href={row.href}>{row.value}</SmartLink> : row.value}
              </Text>
            </Column>
          </Row>
        ))}
      </Column>
      <Text variant="body-default-s" onBackground="neutral-medium">
        In an emergency, call 911. For a mental health crisis, call or text 988.
      </Text>
    </Column>
  );
}

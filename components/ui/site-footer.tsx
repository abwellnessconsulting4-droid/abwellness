import {
  Column,
  IconButton,
  Row,
  SmartLink,
  Text,
} from "@once-ui-system/core";
import { CONTACT_EMAIL, SITE_LEGAL_NAME, SOCIAL_LINKS } from "@/lib/constants";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <Column
      as="footer"
      fillWidth
      gap="16"
      paddingY="24"
      horizontal="center"
      borderTop="neutral-alpha-weak"
    >
      <Row gap="8">
        {SOCIAL_LINKS.map((link) => (
          <IconButton
            key={link.label}
            href={link.href}
            icon={link.icon}
            tooltip={link.label}
            variant="tertiary"
            data-border="rounded"
            aria-label={link.label}
          />
        ))}
      </Row>
      <Text variant="label-default-s" onBackground="neutral-medium" align="center">
        © {year} {SITE_LEGAL_NAME}. All rights reserved.
      </Text>
      <SmartLink href={`mailto:${CONTACT_EMAIL}`} unstyled>
        <Text variant="label-default-s" onBackground="brand-medium">
          {CONTACT_EMAIL}
        </Text>
      </SmartLink>
    </Column>
  );
}

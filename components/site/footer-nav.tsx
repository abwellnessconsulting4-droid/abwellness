import Image from "next/image";
import { Column, Grid, SmartLink, Text } from "@once-ui-system/core";
import { CONTACT_DETAILS, FOOTER_NAV } from "@/content/site";
import { CONTACT_EMAIL, SITE_NAME, SITE_TAGLINE } from "@/lib/constants";

export function FooterNav() {
  return (
    <Grid
      as="nav"
      aria-label="Footer"
      fillWidth
      columns="5"
      gap="32"
      paddingTop="48"
      paddingBottom="32"
      m={{ columns: 3 }}
      s={{ columns: 2 }}
      xs={{ columns: 1 }}
    >
      <Column gap="12">
        <Image src="/images/logo_ab.png" alt={`${SITE_NAME} logo`} width={72} height={72} />
        <Text variant="body-default-s" onBackground="neutral-medium">
          {SITE_TAGLINE}
        </Text>
        <SmartLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</SmartLink>
        <Text variant="body-default-s" onBackground="neutral-weak">
          {CONTACT_DETAILS.phone}
        </Text>
      </Column>
      {FOOTER_NAV.map((group) => (
        <Column key={group.title} gap="12">
          <Text as="h2" variant="label-strong-s" onBackground="accent-medium">
            {group.title}
          </Text>
          <Column as="ul" gap="8" className="list-none p-0 m-0">
            {group.links.map((link) => (
              <li key={link.href}>
                <SmartLink href={link.href}>{link.label}</SmartLink>
              </li>
            ))}
          </Column>
        </Column>
      ))}
    </Grid>
  );
}

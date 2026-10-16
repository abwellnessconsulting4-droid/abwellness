"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button, Column, IconButton, Row, SmartLink, Text } from "@once-ui-system/core";
import { MAIN_NAV } from "@/content/site";
import { SITE_NAME } from "@/lib/constants";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;

  return (
    <Column
      as="header"
      fillWidth
      position="sticky"
      top="0"
      zIndex={9}
      borderBottom="neutral-alpha-weak"
      className="site-header"
    >
      <Row
        fillWidth
        maxWidth="l"
        className="mx-auto"
        paddingX="l"
        paddingY="12"
        vertical="center"
        horizontal="between"
        gap="16"
        s={{ paddingX: "16" }}
      >
        <Link href="/" aria-label={`${SITE_NAME} home`} className="site-header__brand">
          <Image
            src="/images/logo_ab.png"
            alt=""
            width={44}
            height={44}
            priority
            className="site-header__logo"
          />
          <Column gap="2">
            <Text variant="heading-strong-s" onBackground="neutral-strong">
              AB Wellness
            </Text>
            <Text variant="label-default-s" onBackground="brand-medium">
              Consulting Inc.
            </Text>
          </Column>
        </Link>

        <Row as="nav" aria-label="Main" gap="4" vertical="center" m={{ hide: true }}>
          {MAIN_NAV.map((item) => (
            <SmartLink
              key={item.href}
              href={item.href}
              selected={isActive(pathname, item.href)}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
            >
              {item.label}
            </SmartLink>
          ))}
        </Row>

        <Row gap="8" vertical="center" m={{ hide: true }}>
          <Button href="/login" variant="tertiary" size="s" label="Client login" />
          <Button href="/request-services" variant="primary" size="s" label="Request services" />
        </Row>

        <Row hide m={{ hide: false }}>
          <IconButton
            icon={menuOpen ? "close" : "menu"}
            variant="tertiary"
            size="l"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpenOn(menuOpen ? null : pathname)}
          />
        </Row>
      </Row>

      {menuOpen && (
        <Column
          id="mobile-menu"
          as="nav"
          aria-label="Main"
          fillWidth
          paddingX="16"
          paddingBottom="24"
          gap="4"
          hide
          m={{ hide: false }}
        >
          {MAIN_NAV.map((item) => (
            <Button
              key={item.href}
              href={item.href}
              variant={isActive(pathname, item.href) ? "secondary" : "tertiary"}
              fillWidth
              horizontal="start"
              label={item.label}
            />
          ))}
          <Row gap="8" paddingTop="12">
            <Button href="/login" variant="secondary" fillWidth label="Client login" />
            <Button href="/request-services" variant="primary" fillWidth label="Request services" />
          </Row>
        </Column>
      )}
    </Column>
  );
}

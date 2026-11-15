import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Column, Text } from "@once-ui-system/core";
import { SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Minimal shell for sign-in and two-step verification (no marketing header, no analytics). */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <Column as="main" fillWidth flex={1} horizontal="center" vertical="center" gap="24" paddingX="16" paddingY="48">
      <Link href="/" aria-label={`${SITE_NAME} home`} className="auth-brand">
        <Image src="/images/logo_ab.png" alt="" width={56} height={56} priority className="site-header__logo" />
        <Text variant="heading-strong-m" onBackground="neutral-strong">
          {SITE_NAME}
        </Text>
      </Link>
      <Column fillWidth maxWidth={28} gap="24" padding="32" radius="xl" background="surface" border="neutral-alpha-weak" s={{ padding: "24" }}>
        {children}
      </Column>
      <Text variant="body-default-xs" onBackground="neutral-weak" align="center">
        For your privacy, you&apos;ll be signed out after a period of inactivity.
      </Text>
    </Column>
  );
}

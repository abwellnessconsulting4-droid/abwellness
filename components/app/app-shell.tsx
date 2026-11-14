import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Column, Row, Text } from "@once-ui-system/core";
import { SessionTimeout } from "@/components/session/session-timeout";
import { SideNav } from "@/components/app/side-nav";
import { SignOutButton } from "@/components/app/sign-out-button";
import type { AuthContext } from "@/lib/authz";
import { navFor, ROLE_LABELS, type NavItem } from "@/lib/navigation";
import { SESSION_POLICY, sessionPolicyFor } from "@/lib/rbac";

interface AppShellProps {
  ctx: AuthContext;
  nav: NavItem[];
  area: string;
  children: ReactNode;
}

/** Signed-in layout for the staff dashboard and the client portal. */
export function AppShell({ ctx, nav, area, children }: AppShellProps) {
  const items = navFor(ctx.role, nav);
  return (
    <div className="app-shell">
      <a href="#app-main" className="skip-link">
        Skip to main content
      </a>
      <aside className="app-shell__sidebar">
        <Link href={nav[0].href} className="site-header__brand notranslate" translate="no">
          <Image src="/images/logo_ab.png" alt="" width={36} height={36} className="site-header__logo" />
          <Column gap="2">
            <Text variant="heading-strong-xs">AB Wellness</Text>
            <Text variant="label-default-xs" onBackground="brand-medium">
              {area}
            </Text>
          </Column>
        </Link>
        <SideNav items={items} label={area} />
      </aside>
      <div className="app-shell__body">
        <Row as="header" className="app-shell__header" fillWidth horizontal="between" vertical="center" gap="16" paddingX="24" paddingY="12">
          <Column gap="2">
            <Text variant="label-strong-m">{ctx.displayName}</Text>
            <Text variant="label-default-s" onBackground="neutral-weak">
              {ROLE_LABELS[ctx.role]}
            </Text>
          </Column>
          <SignOutButton />
        </Row>
        <main id="app-main" className="app-shell__main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <SessionTimeout idleMinutes={sessionPolicyFor(ctx.role).idleMinutes} warningSeconds={SESSION_POLICY.warningSeconds} />
    </div>
  );
}

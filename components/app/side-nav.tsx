"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, Tag, Text } from "@once-ui-system/core";
import type { NavItem } from "@/lib/navigation";

export function SideNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && href !== "/portal" && pathname.startsWith(`${href}/`));

  return (
    <nav aria-label={label} className="app-nav">
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            {item.ready ? (
              <Link href={item.href} className="app-nav__link" aria-current={isActive(item.href) ? "page" : undefined}>
                <Icon name={item.icon} size="s" decorative />
                <Text variant="label-default-m">{item.label}</Text>
              </Link>
            ) : (
              <span className="app-nav__link app-nav__link--soon" aria-disabled="true">
                <Icon name={item.icon} size="s" decorative />
                <Text variant="label-default-m">{item.label}</Text>
                <Tag size="s" variant="neutral" label="Soon" />
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

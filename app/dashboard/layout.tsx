import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { requireSession } from "@/lib/dal";
import { STAFF_NAV } from "@/lib/navigation";
import { STAFF_ROLES } from "@/lib/rbac";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s | AB Wellness Dashboard" },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  return (
    <AppShell ctx={ctx} nav={STAFF_NAV} area="Staff dashboard">
      {children}
    </AppShell>
  );
}

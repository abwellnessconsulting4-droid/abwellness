import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { requireSession } from "@/lib/dal";
import { PATIENT_NAV } from "@/lib/navigation";

export const metadata: Metadata = {
  title: { default: "My portal", template: "%s | AB Wellness Portal" },
  robots: { index: false, follow: false },
};

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  return (
    <AppShell ctx={ctx} nav={PATIENT_NAV} area="Client portal">
      {children}
    </AppShell>
  );
}

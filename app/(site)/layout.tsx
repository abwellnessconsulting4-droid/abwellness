import { Analytics } from "@vercel/analytics/next";
import { Column, Line } from "@once-ui-system/core";
import { FooterNav } from "@/components/site/footer-nav";
import { PreviewBanner } from "@/components/site/preview-banner";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/ui/site-footer";
import { getSiteMode } from "@/lib/site-mode";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  const mode = getSiteMode();

  // Analytics lives here rather than in the root layout so it never loads on the
  // client portal or admin pages (no third-party scripts where PHI is shown).

  // Coming-soon mode only ever serves "/" (proxy.ts redirects everything else),
  // and that page brings its own full-screen layout.
  if (mode === "coming-soon") {
    return (
      <>
        {children}
        <Analytics />
      </>
    );
  }

  return (
    <>
      <Analytics />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {mode === "preview" && <PreviewBanner />}
      <SiteHeader />
      <Column as="main" id="main-content" fillWidth flex={1} tabIndex={-1}>
        {children}
      </Column>
      <Column fillWidth maxWidth="l" className="mx-auto" paddingX="l" s={{ paddingX: "16" }}>
        <Line background="neutral-alpha-weak" />
        <FooterNav />
        <SiteFooter />
      </Column>
    </>
  );
}

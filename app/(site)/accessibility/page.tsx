import { LegalPage } from "@/components/site/legal-page";
import { ACCESSIBILITY_STATEMENT } from "@/content/legal";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Accessibility statement",
  description: "Our commitment to an accessible website and how to request assistance.",
  path: "/accessibility",
});

export default function AccessibilityPage() {
  return <LegalPage document={ACCESSIBILITY_STATEMENT} />;
}

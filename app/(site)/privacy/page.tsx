import { LegalPage } from "@/components/site/legal-page";
import { PRIVACY_POLICY } from "@/content/legal";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Privacy policy",
  description: "How AB Wellness Consulting collects, uses, and protects your information.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return <LegalPage document={PRIVACY_POLICY} />;
}

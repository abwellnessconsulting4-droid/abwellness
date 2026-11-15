import { LegalPage } from "@/components/site/legal-page";
import { TERMS_OF_USE } from "@/content/legal";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Terms of use",
  description: "The terms that apply when you use the AB Wellness Consulting website.",
  path: "/terms",
});

export default function TermsPage() {
  return <LegalPage document={TERMS_OF_USE} />;
}

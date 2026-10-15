import { Button } from "@once-ui-system/core";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/blocks";
import { SERVICES } from "@/content/site";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Services",
  description:
    "Wellness coaching, care coordination, housing stability support, life skills, caregiver support, and organizational wellness consulting.",
  path: "/services",
});

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Services"
        title="Support that fits your life"
        description="Choose a single service or combine several. Every plan is built around your goals and reviewed with you along the way."
        actions={<Button href="/request-services" variant="primary" label="Request services" suffixIcon="arrowRight" />}
      />
      <Section id="all-services" title="What we offer" description="[Confirm the final list of services and what each includes.]">
        <FeatureGrid items={SERVICES} />
      </Section>
      <CtaBand title="Not sure which service is right?" />
    </>
  );
}

import { Button, Row } from "@once-ui-system/core";
import { CtaBand, FeatureGrid, PageHero, Section } from "@/components/site/blocks";
import { LANGUAGES_NOTE, SERVICE_TRACKS } from "@/content/site";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Services",
  description:
    "Housing stabilization, resource navigation, case management support, and skill-building for individuals and families; staff training, program consultation, and compliance support for organizations. English and Spanish.",
  path: "/services",
});

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Services"
        title="Support for people, and for the organizations that serve them"
        description={`Practical help for individuals and families, and training and consultation for organizations, built on more than 20 years in social work, behavioral health, and housing. ${LANGUAGES_NOTE}`}
        actions={
          <>
            <Button href="#individuals" variant="secondary" label="For individuals & families" />
            <Button href="#organizations" variant="secondary" label="For organizations" />
          </>
        }
      />
      {SERVICE_TRACKS.map((track) => (
        <Section key={track.id} id={track.id} eyebrow="Services" title={track.title} description={track.description}>
          <FeatureGrid items={track.services} columns={track.services.length === 4 ? 2 : 3} />
          <Row horizontal="center">
            <Button
              href="/request-services"
              variant="primary"
              label={track.id === "organizations" ? "Request a consultation" : "Request services"}
              suffixIcon="arrowRight"
            />
          </Row>
        </Section>
      ))}
      <CtaBand title="Not sure which service is right?" />
    </>
  );
}

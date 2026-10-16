import { Column, Row } from "@once-ui-system/core";
import { ContactForm } from "@/components/forms/contact-form";
import { PageHero, Section } from "@/components/site/blocks";
import { ContactDetails } from "@/components/site/contact-details";
import { pageMetadata } from "@/resources/seo";

export const metadata = pageMetadata({
  title: "Contact",
  description: "Reach AB Wellness Consulting by email, phone, or our contact form. We typically reply within two business days.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="We'd love to hear from you"
        description="Send a note and we'll reply within [two business days]. Looking to start services? The request form is the fastest route."
      />
      <Section id="contact-form" align="start">
        <Row fillWidth gap="32" vertical="start" m={{ direction: "column" }}>
          <Column flex={3} fillWidth padding="32" radius="l" background="surface" border="neutral-alpha-weak" s={{ padding: "20" }}>
            <ContactForm />
          </Column>
          <Column flex={2} fillWidth>
            <ContactDetails />
          </Column>
        </Row>
      </Section>
    </>
  );
}

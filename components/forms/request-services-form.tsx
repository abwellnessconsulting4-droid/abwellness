"use client";

import { useState } from "react";
import { Checkbox, Column, Grid, Input, Row, Select, Text, Textarea } from "@once-ui-system/core";
import { PreviewForm } from "@/components/forms/preview-form";
import { SERVICE_TRACKS } from "@/content/site";

const REQUEST_FOR = [
  { value: "self", label: "Myself" },
  { value: "someone-else", label: "Someone I support (family, friend, client)" },
  { value: "organization", label: "My organization" },
];

const CONTACT_METHODS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone call" },
  { value: "text", label: "Text message" },
];

export function RequestServicesForm() {
  const [requestFor, setRequestFor] = useState("self");
  const [contactMethod, setContactMethod] = useState("email");
  const [services, setServices] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);

  function toggleService(title: string) {
    setServices((current) =>
      current.includes(title) ? current.filter((s) => s !== title) : [...current, title],
    );
  }

  return (
    <PreviewForm
      submitLabel="Submit request"
      successTitle="Request received"
      validate={() => {
        if (services.length === 0) return "Choose at least one service you're interested in.";
        if (!consent) return "Please confirm we may contact you about this request.";
        return null;
      }}
    >
      <Select
        id="request-for"
        label="Who is this request for?"
        options={REQUEST_FOR}
        value={requestFor}
        onSelect={(value) => setRequestFor(value as string)}
      />
      <Row gap="16" fillWidth s={{ direction: "column" }}>
        <Input id="request-name" name="name" label="Your full name" autoComplete="name" required />
        <Input id="request-email" name="email" type="email" label="Email" autoComplete="email" required />
      </Row>
      <Row gap="16" fillWidth s={{ direction: "column" }}>
        <Input id="request-phone" name="phone" type="tel" label="Phone" autoComplete="tel" required />
        <Select
          id="request-contact-method"
          label="Best way to reach you"
          options={CONTACT_METHODS}
          value={contactMethod}
          onSelect={(value) => setContactMethod(value as string)}
        />
      </Row>
      {requestFor === "organization" && (
        <Input id="request-organization" name="organization" label="Organization name" autoComplete="organization" required />
      )}

      <Column gap="16" paddingY="8">
        <Text variant="label-strong-s" onBackground="neutral-strong">
          Services you&apos;re interested in
        </Text>
        {SERVICE_TRACKS.map((track) => (
          <Column key={track.id} as="fieldset" gap="8" className="border-0 p-0 m-0">
            <Text as="legend" variant="label-default-s" onBackground="accent-medium">
              {track.title}
            </Text>
            <Grid columns="2" gap="8" s={{ columns: 1 }}>
              {track.services.map((service) => (
                <Checkbox
                  className="checkbox-row"
                  key={service.title}
                  label={service.title}
                  isChecked={services.includes(service.title)}
                  onToggle={() => toggleService(service.title)}
                />
              ))}
            </Grid>
          </Column>
        ))}
      </Column>

      <Textarea
        id="request-message"
        name="message"
        label="What would you like help with? (optional)"
        lines={4}
        description="A sentence or two is plenty. Please don't share medical details here; we'll gather what's needed securely."
      />

      <Checkbox
        className="checkbox-row"
        label="I agree to be contacted about this request."
        description="We'll only use your information to respond. See our privacy policy."
        isChecked={consent}
        onToggle={() => setConsent((value) => !value)}
      />
    </PreviewForm>
  );
}

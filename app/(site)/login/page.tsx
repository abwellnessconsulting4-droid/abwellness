import { Column, Heading, Icon, Row, SmartLink, Text } from "@once-ui-system/core";
import { LoginForm } from "@/components/forms/login-form";
import { pageMetadata } from "@/resources/seo";

export const metadata = {
  ...pageMetadata({
    title: "Client login",
    description: "Sign in to the AB Wellness client portal.",
    path: "/login",
  }),
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Column fillWidth horizontal="center" paddingX="l" paddingY="80" s={{ paddingX: "16", paddingY: "48" }}>
      <Column fillWidth maxWidth={28} gap="24" padding="32" radius="xl" background="surface" border="neutral-alpha-weak" s={{ padding: "24" }}>
        <Column gap="8" horizontal="center">
          <Row width="48" height="48" radius="full" center background="brand-alpha-weak">
            <Icon name="lock" onBackground="brand-strong" decorative />
          </Row>
          <Heading as="h1" variant="heading-strong-xl" align="center">
            Client portal
          </Heading>
          <Text variant="body-default-s" onBackground="neutral-medium" align="center">
            Sign in to complete forms, upload documents, sign agreements, and message your team securely.
          </Text>
        </Column>
        <LoginForm />
        <Text variant="body-default-s" onBackground="neutral-medium" align="center">
          New to AB Wellness? <SmartLink href="/request-services">Request services</SmartLink> to get started.
        </Text>
      </Column>
    </Column>
  );
}

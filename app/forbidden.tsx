import { Button, Column, Heading, Text } from "@once-ui-system/core";

/** 403 page for RBAC denials (the attempt has already been audited). */
export default function Forbidden() {
  return (
    <Column as="main" fillWidth flex={1} horizontal="center" vertical="center" gap="16" paddingX="16" paddingY="104">
      <Text variant="label-default-s" onBackground="danger-medium">
        403 · Not allowed
      </Text>
      <Heading as="h1" variant="display-strong-s" align="center">
        You don&apos;t have access to this
      </Heading>
      <Text variant="body-default-m" onBackground="neutral-medium" align="center">
        Your role doesn&apos;t include this information. The attempt has been recorded. If you need access, ask an administrator.
      </Text>
      <Button href="/account" variant="secondary" label="Back to my dashboard" />
    </Column>
  );
}

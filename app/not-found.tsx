import { Button, Column, Heading, Row, Text } from "@once-ui-system/core";

export default function NotFound() {
  return (
    <Column as="main" fillWidth flex={1} horizontal="center" vertical="center" gap="20" paddingX="16" paddingY="104">
      <Text variant="label-default-s" onBackground="accent-medium">
        404
      </Text>
      <Heading as="h1" variant="display-strong-s" align="center">
        We couldn&apos;t find that page
      </Heading>
      <Text variant="body-default-m" onBackground="neutral-medium" align="center">
        The link may be out of date, or the page may have moved.
      </Text>
      <Row gap="12" wrap horizontal="center">
        <Button href="/" variant="primary" label="Go to the home page" />
        <Button href="/contact" variant="secondary" label="Contact us" />
      </Row>
    </Column>
  );
}

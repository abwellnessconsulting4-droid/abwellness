import { Row, Text } from "@once-ui-system/core";

export function PreviewBanner() {
  return (
    <Row
      role="note"
      fillWidth
      horizontal="center"
      paddingX="16"
      paddingY="8"
      background="accent-alpha-weak"
      borderBottom="accent-alpha-medium"
    >
      <Text variant="label-default-s" onBackground="accent-strong" align="center">
        Website preview. Content is a draft; items in [brackets] need your input. Forms don&apos;t send yet.
      </Text>
    </Row>
  );
}

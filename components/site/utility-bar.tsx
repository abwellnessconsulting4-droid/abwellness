import { Row, SmartLink, Text } from "@once-ui-system/core";
import { LanguageSwitcher } from "@/components/site/language-switcher";

export function UtilityBar() {
  return (
    <Row fillWidth borderBottom="neutral-alpha-weak" background="surface">
      <Row
        fillWidth
        maxWidth="l"
        className="mx-auto"
        paddingX="l"
        paddingY="4"
        gap="16"
        vertical="center"
        horizontal="between"
        s={{ paddingX: "16", horizontal: "end" }}
      >
        <Row s={{ hide: true }}>
          <Text variant="label-default-s" onBackground="neutral-medium">
            Services in English &amp; Spanish ·{" "}
            <SmartLink href="/accessibility#translation">About translations</SmartLink>
          </Text>
        </Row>
        <LanguageSwitcher />
      </Row>
    </Row>
  );
}

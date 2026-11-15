import { Heading, Text } from "@once-ui-system/core";

/** Shown right after a PHQ-9 with any item-9 answer above "not at all". */
export function CrisisNotice() {
  return (
    <div role="alert" className="crisis-notice">
      <Heading as="h2" variant="heading-strong-m">You don&apos;t have to face this alone</Heading>
      <Text variant="body-default-m">
        You mentioned thoughts of being better off dead or hurting yourself. Your provider has been notified and will follow up. If you&apos;re in danger or might act on these thoughts, get help now:
      </Text>
      <ul>
        <li><strong>Call or text 988</strong> (Suicide &amp; Crisis Lifeline, 24/7), or chat at 988lifeline.org</li>
        <li><strong>Call 911</strong> or go to the nearest emergency room</li>
        <li>Text <strong>HOME to 741741</strong> (Crisis Text Line)</li>
      </ul>
    </div>
  );
}

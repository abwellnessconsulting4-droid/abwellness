"use client";

import { useEffect, useState } from "react";
import { Column, Row, Text } from "@once-ui-system/core";
import type { CountdownParts } from "@/types";

function getCountdownParts(target: Date, now: number): CountdownParts {
  const diff = Math.max(0, target.getTime() - now);
  const totalSeconds = Math.floor(diff / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: diff === 0,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

const UNITS: { key: keyof Omit<CountdownParts, "expired">; label: string }[] = [
  { key: "days", label: "Days" },
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Minutes" },
  { key: "seconds", label: "Seconds" },
];

export function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [parts, setParts] = useState<CountdownParts | null>(null);

  useEffect(() => {
    const target = new Date(targetDate);
    const tick = () => setParts(getCountdownParts(target, Date.now()));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [targetDate]);

  const display = parts ?? {
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    expired: false,
  };

  if (display.expired) {
    return (
      <Column
        fillWidth
        horizontal="center"
        padding="24"
        radius="l"
        background="brand-alpha-weak"
        border="brand-alpha-weak"
      >
        <Text variant="heading-strong-m" onBackground="brand-medium">
          We are live. Welcome in.
        </Text>
      </Column>
    );
  }

  return (
    <Row fillWidth gap="12" wrap horizontal="center">
      {UNITS.map((unit) => (
        <Column
          key={unit.key}
          flex={1}
          minWidth={6}
          horizontal="center"
          gap="4"
          paddingY="20"
          paddingX="12"
          radius="l"
          background="surface"
          border="neutral-alpha-weak"
        >
          <Text
            variant="display-strong-s"
            family="code"
            onBackground="neutral-strong"
            className="tabular-nums"
            style={{
              fontVariantNumeric: "lining-nums tabular-nums",
              minWidth: "2.75ch",
              textAlign: "center",
              fontFeatureSettings: '"lnum" 1, "tnum" 1',
            }}
          >
            {unit.key === "days" ? display[unit.key] : pad(display[unit.key])}
          </Text>
          <Text variant="label-default-s" onBackground="neutral-medium">
            {unit.label}
          </Text>
        </Column>
      ))}
    </Row>
  );
}

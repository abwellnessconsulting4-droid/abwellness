"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Column, Heading, Row, Text } from "@once-ui-system/core";
import { authClient } from "@/lib/auth-client";

/**
 * Inactivity timeout for signed-in areas (15 min staff, 30 min patients).
 *
 * - Tracks real activity (keys, pointer, scroll, touch), shared across tabs via localStorage.
 * - While the user is active, pings the session endpoint at most every few minutes so the
 *   server-side sliding session (lib/auth.ts) doesn't expire under someone reading a chart.
 * - Shows a warning with a countdown, then signs out. The server enforces the same limit
 *   independently (lib/dal.ts), so closing the tab or disabling JS doesn't extend a session.
 */

const ACTIVITY_KEY = "abw:last-activity";
const KEEPALIVE_MS = 4 * 60_000;
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "pointermove", "scroll", "touchstart", "wheel"] as const;

interface SessionTimeoutProps {
  idleMinutes: number;
  warningSeconds?: number;
}

function readLastActivity() {
  try {
    return Number(window.localStorage.getItem(ACTIVITY_KEY)) || Date.now();
  } catch {
    return Date.now();
  }
}

export function SessionTimeout({ idleMinutes, warningSeconds = 120 }: SessionTimeoutProps) {
  const idleMs = idleMinutes * 60_000;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(0);
  const lastKeepalive = useRef(0);
  const signingOut = useRef(false);
  const stayButton = useRef<HTMLButtonElement>(null);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      await authClient.signOut();
    } finally {
      // Full reload on purpose: clears any PHI held in client memory after sign-out.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login?reason=timeout";
    }
  }, []);

  const keepAlive = useCallback(async () => {
    lastKeepalive.current = Date.now();
    const response = await fetch("/api/auth/get-session", { credentials: "same-origin", cache: "no-store" });
    const session = response.ok ? await response.json() : null;
    if (!session) void signOut(); // the server already ended it
  }, [signOut]);

  const markActive = useCallback(() => {
    const now = Date.now();
    // Throttle writes; pointermove fires constantly.
    if (now - lastActivity.current < 5_000) return;
    lastActivity.current = now;
    try {
      window.localStorage.setItem(ACTIVITY_KEY, String(now));
    } catch {
      // Private mode: fall back to this tab's timer.
    }
    if (now - lastKeepalive.current > KEEPALIVE_MS) void keepAlive();
  }, [keepAlive]);

  useEffect(() => {
    lastActivity.current = Date.now();
    lastKeepalive.current = Date.now();
    try {
      window.localStorage.setItem(ACTIVITY_KEY, String(lastActivity.current));
    } catch {
      // ignore
    }
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, markActive, { passive: true });

    const tick = window.setInterval(() => {
      const last = Math.max(lastActivity.current, readLastActivity());
      const remainingMs = idleMs - (Date.now() - last);
      if (remainingMs <= 0) {
        void signOut();
      } else if (remainingMs <= warningSeconds * 1000) {
        setSecondsLeft(Math.ceil(remainingMs / 1000));
      } else {
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, markActive);
      window.clearInterval(tick);
    };
  }, [idleMs, warningSeconds, markActive, signOut]);

  const warningOpen = secondsLeft !== null;

  useEffect(() => {
    if (warningOpen) stayButton.current?.focus();
  }, [warningOpen]);

  if (!warningOpen) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="session-timeout__backdrop">
      <Column
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-description"
        gap="16"
        padding="32"
        radius="l"
        background="surface"
        border="neutral-alpha-medium"
        maxWidth={28}
        className="session-timeout__dialog"
      >
        <Heading as="h2" id="session-timeout-title" variant="heading-strong-l">
          Are you still there?
        </Heading>
        <Text id="session-timeout-description" variant="body-default-m" onBackground="neutral-medium">
          For your privacy, you&apos;ll be signed out in{" "}
          <strong aria-live="polite">
            {minutes}:{seconds}
          </strong>{" "}
          because of inactivity.
        </Text>
        <Row gap="12" wrap>
          <Button
            ref={stayButton}
            variant="primary"
            label="Stay signed in"
            onClick={() => {
              lastActivity.current = 0; // bypass throttle
              markActive();
              void keepAlive();
              setSecondsLeft(null);
            }}
          />
          <Button variant="secondary" label="Sign out now" onClick={() => void signOut()} />
        </Row>
      </Column>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Column, Feedback, Row, Text } from "@once-ui-system/core";
import type { VisitState } from "@/app/dashboard/telehealth/actions";

type Action = (state: VisitState, form: FormData) => Promise<VisitState>;

function elapsed(since: number, now: number) {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Live mm:ss counter, updated every second (client clock). */
export function Elapsed({ since, label }: { since: string; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  return (
    <Text variant="label-default-s" onBackground="neutral-medium" aria-live="off">
      {label} {now === null ? "--:--" : elapsed(new Date(since).getTime(), now)}
    </Text>
  );
}

/** Mock video tile: stands in for the vendor's embedded call until a BAA-covered provider is wired up. */
export function VideoTile({ status, patient, startedAt, waitingSince }: { status: string; patient: string; startedAt?: string; waitingSince?: string }) {
  const live = status === "IN_SESSION";
  return (
    <div className={`video-tile${live ? " is-live" : ""}`} role="img" aria-label={live ? `Video call with ${patient} in progress (demo video)` : `Video call with ${patient}: ${status.toLowerCase().replaceAll("_", " ")}`}>
      <div className="video-avatar" aria-hidden="true">
        {patient
          .split(" ")
          .map((p) => p[0])
          .join("")
          .slice(0, 2)}
      </div>
      <Text variant="label-strong-m">{patient}</Text>
      {live && startedAt && <Elapsed since={startedAt} label="In session" />}
      {status === "IN_WAITING_ROOM" && waitingSince && <Elapsed since={waitingSince} label="Waiting" />}
      {status === "NOT_ARRIVED" && <Text variant="label-default-s" onBackground="neutral-weak">Not in the waiting room yet</Text>}
      {status === "COMPLETED" && <Text variant="label-default-s" onBackground="neutral-weak">Visit ended</Text>}
      <span className="video-badge">Demo video</span>
    </div>
  );
}

export function VisitControls({ action, status, isProvider }: { action: Action; status: string; isProvider: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <Column gap="8">
      {isProvider && (status === "IN_WAITING_ROOM" || status === "NOT_ARRIVED") && (
        <form action={formAction}>
          <input type="hidden" name="intent" value="admit" />
          <Button type="submit" variant="primary" label={status === "NOT_ARRIVED" ? "Start visit" : "Admit client"} loading={pending} disabled={pending} />
        </form>
      )}
      {isProvider && status === "IN_SESSION" && (
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!window.confirm("End this visit? The session length will be recorded on the note.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="end" />
          <Button type="submit" variant="danger" label="End visit" loading={pending} disabled={pending} />
        </form>
      )}
      {!isProvider && <Text variant="body-default-xs" onBackground="neutral-weak">Only the visit&apos;s provider can admit the client or end the visit.</Text>}
      <div aria-live="polite">
        {state.error && <Feedback variant="danger" description={state.error} />}
        {state.success && <Feedback variant="success" description={state.success} />}
      </div>
    </Column>
  );
}

export function StartNote({ action }: { action: (state: VisitState) => Promise<VisitState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <Row gap="8" vertical="center" wrap>
        <Button type="submit" variant="secondary" label="Start visit note" loading={pending} disabled={pending} />
        {state.error && <Text variant="body-default-xs" onBackground="danger-medium">{state.error}</Text>}
      </Row>
    </form>
  );
}

/** Refreshes server data on an interval (waiting room). */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

import Link from "next/link";
import { Button, Column, Feedback, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { AppointmentActions } from "@/components/schedule/appointment-actions";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { can, STAFF_ROLES } from "@/lib/rbac";
import { DEFAULT_TZ, listDay, listProviders, listWaitlist } from "@/lib/services/scheduling";
import { addDays, dateKey, formatTime } from "@/lib/tz";

export const metadata = { title: "Schedule" };

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "brand"> = {
  SCHEDULED: "neutral", CONFIRMED: "brand", CHECKED_IN: "success", IN_SESSION: "success", COMPLETED: "neutral", CANCELLED: "neutral", LATE_CANCELLED: "warning", NO_SHOW: "danger",
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pretty = (s: string) => s.replaceAll("_", " ").toLowerCase();

export default async function SchedulePage({ searchParams }: PageProps<"/dashboard/schedule">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const params = await searchParams;
  const now = new Date();
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : dateKey(now, DEFAULT_TZ);
  const providers = await listProviders();
  const providerId = ctx.role === "PROVIDER" ? ctx.staffProfileId : typeof params.provider === "string" ? params.provider : undefined;
  const [rows, waitlist] = await Promise.all([
    orForbidden(listDay(ctx, { date, providerId })),
    can(ctx.role, "waitlist", "read") && ctx.role !== "PROVIDER" ? listWaitlist(ctx) : Promise.resolve(null),
  ]);
  const canBook = can(ctx.role, "appointment", "create");
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
  const q = (d: string) => `?date=${d}${providerId && ctx.role !== "PROVIDER" ? `&provider=${providerId}` : ""}`;

  return (
    <Column gap="24">
      <Row horizontal="between" vertical="end" gap="16" wrap>
        <Column gap="8">
          <Heading as="h1" variant="display-strong-xs">Schedule</Heading>
          <Text variant="body-default-m" onBackground="neutral-medium">{label} · times in Eastern Time</Text>
        </Column>
        {canBook && <Button href={`/dashboard/schedule/new?date=${date}${providerId ? `&provider=${providerId}` : ""}`} variant="primary" label="Book appointment" prefixIcon="plus" />}
      </Row>
      {params.booked && <Feedback variant="success" description="Appointment booked." />}

      <Row gap="8" wrap vertical="center">
        <Button href={q(addDays(date, -1))} variant="tertiary" size="s" label="← Previous day" />
        <Button href={q(dateKey(now, DEFAULT_TZ))} variant="secondary" size="s" label="Today" />
        <Button href={q(addDays(date, 1))} variant="tertiary" size="s" label="Next day →" />
        {ctx.role !== "PROVIDER" && (
          <form method="get" className="inline-form">
            <input type="hidden" name="date" value={date} />
            <label className="native-field">
              <span className="sr-only">Provider</span>
              <select name="provider" defaultValue={providerId ?? ""}>
                <option value="">All providers</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <Button type="submit" variant="tertiary" size="s" label="Filter" />
          </form>
        )}
      </Row>

      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th scope="col">Time</th><th scope="col">Client</th><th scope="col">Visit</th><th scope="col">Provider</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}>No appointments on this day.</td></tr>}
            {rows.map((a) => (
              <tr key={a.id}>
                <td style={{ whiteSpace: "nowrap" }}>{formatTime(a.start)}–{formatTime(a.end)}</td>
                <td>
                  {can(ctx.role, "patient", "read") ? <Link className="table-link" href={`/dashboard/patients/${a.patientId}`}>{a.patient}</Link> : a.patient}
                  <br /><Text variant="label-default-xs" onBackground="neutral-weak" className="notranslate">{a.mrn}</Text>
                </td>
                <td>{a.mode === "VIRTUAL" ? "Video" : "In person"} · {a.visitType}</td>
                <td>{a.provider}</td>
                <td><Tag size="s" variant={STATUS_TONE[a.status] ?? "neutral"} label={pretty(a.status)} />{a.fee && <><br /><Text variant="label-default-xs" onBackground="neutral-weak">{a.fee}</Text></>}</td>
                <td>{can(ctx.role, "appointment", "update") && <AppointmentActions appointmentId={a.id} status={a.status} startsInPast={a.start < now} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {waitlist && (
        <Column gap="12" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
          <Heading as="h2" variant="heading-strong-m">Waitlist</Heading>
          {waitlist.length === 0 ? <Text variant="body-default-s" onBackground="neutral-weak">Nobody is waiting.</Text> : waitlist.map((w) => (
            <Text key={w.id} variant="body-default-s">
              <strong>{w.patient}</strong> · {w.provider} · {w.modes.length ? w.modes.map((m) => (m === "VIRTUAL" ? "video" : "in person")).join("/") : "any format"} · {w.preferredDays.length ? w.preferredDays.map((d) => DAYS[d]).join(", ") : "any day"} · {pretty(w.status)}
            </Text>
          ))}
          <Text variant="body-default-xs" onBackground="neutral-weak">When an appointment is cancelled, matching clients appear right there with a one-click Book button.</Text>
        </Column>
      )}
      <SmartLink href="/dashboard/patients">Find a client →</SmartLink>
    </Column>
  );
}

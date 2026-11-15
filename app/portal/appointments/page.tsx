import { Button, Column, Feedback, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { joinVideoAction } from "@/app/portal/appointments/actions";
import { JoinButton } from "@/components/portal/appointment-forms";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { JOIN_EARLY_MINUTES, myAppointments } from "@/lib/services/portal-appointments";
import { DEFAULT_TZ } from "@/lib/services/scheduling";
import { formatDateTime } from "@/lib/time";
import { formatTime } from "@/lib/tz";

export const metadata = { title: "Appointments" };

const STATUS: Record<string, { label: string; variant: "neutral" | "success" | "warning" | "danger" | "info" | "brand" }> = {
  SCHEDULED: { label: "Scheduled", variant: "info" },
  CONFIRMED: { label: "Confirmed", variant: "success" },
  CHECKED_IN: { label: "Checked in", variant: "brand" },
  IN_SESSION: { label: "In session", variant: "brand" },
  COMPLETED: { label: "Completed", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
  LATE_CANCELLED: { label: "Late cancellation", variant: "warning" },
  NO_SHOW: { label: "Missed", variant: "danger" },
};

export default async function PortalAppointmentsPage({ searchParams }: PageProps<"/portal/appointments">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const query = await searchParams;
  if (!ctx.patientId) return <Text variant="body-default-m">Your account isn&apos;t linked to a client record yet.</Text>;
  const { upcoming, past } = await myAppointments(ctx);

  return (
    <Column gap="32" fillWidth>
      <Row horizontal="between" vertical="center" gap="12" wrap>
        <Column gap="8">
          <Heading as="h1" variant="display-strong-xs">Appointments</Heading>
          <Text variant="body-default-m" onBackground="neutral-medium">Times are shown in Eastern Time.</Text>
        </Column>
        <Button href="/portal/appointments/book" variant="primary" label="Book a visit" prefixIcon="calendar" />
      </Row>

      {query.booked && <Feedback variant="success" title="You're booked" description="Your appointment is below. Video visits open here 15 minutes before the start time." />}
      {query.cancelled === "1" && <Feedback variant="success" description="Your appointment was cancelled. No fee applies." />}
      {query.cancelled === "fee" && <Feedback variant="info" description="Your appointment was cancelled. A late-cancellation fee was added to Billing, per your signed financial agreement." />}

      <Column gap="12">
        <Heading as="h2" variant="heading-strong-l">Upcoming</Heading>
        {upcoming.length === 0 && <Text variant="body-default-s" onBackground="neutral-weak">Nothing scheduled.</Text>}
        {upcoming.map((a) => {
          const tag = STATUS[a.status] ?? STATUS.SCHEDULED;
          const opensAt = new Date(a.start.getTime() - JOIN_EARLY_MINUTES * 60_000);
          return (
            <Column key={a.id} gap="8" padding="20" radius="l" background="surface" border={a.join === "open" ? "brand-alpha-medium" : "neutral-alpha-weak"}>
              <Row gap="8" vertical="center" wrap>
                <Text variant="label-strong-m">{formatDateTime(a.start)}</Text>
                <Tag variant={tag.variant} label={tag.label} />
                <Tag variant="neutral" label={a.mode === "VIRTUAL" ? "Video" : "In person"} />
              </Row>
              <Text variant="body-default-s">{a.visit} with {a.provider}</Text>
              {a.mode === "IN_PERSON" && a.location && <Text variant="body-default-xs" onBackground="neutral-weak">{a.location}</Text>}
              <Row gap="16" vertical="center" wrap>
                {a.join === "open" && <JoinButton action={joinVideoAction.bind(null, a.id)} />}
                {a.mode === "VIRTUAL" && a.join === "not-yet" && (
                  <Text variant="body-default-xs" onBackground="neutral-weak">The video waiting room opens at {formatTime(opensAt, DEFAULT_TZ)} on the day of your visit.</Text>
                )}
                {a.cancellable && <SmartLink href={`/portal/appointments/${a.id}/cancel`}>Cancel</SmartLink>}
              </Row>
            </Column>
          );
        })}
      </Column>

      {past.length > 0 && (
        <Column gap="12">
          <Heading as="h2" variant="heading-strong-l">Past and cancelled</Heading>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Visit</th>
                  <th scope="col">Format</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {past.map((a) => {
                  const tag = STATUS[a.status] ?? STATUS.SCHEDULED;
                  return (
                    <tr key={a.id}>
                      <td>{formatDateTime(a.start)}</td>
                      <td>{a.visit} with {a.provider}</td>
                      <td>{a.mode === "VIRTUAL" ? "Video" : "In person"}</td>
                      <td><Tag variant={tag.variant} label={tag.label} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Column>
      )}
    </Column>
  );
}

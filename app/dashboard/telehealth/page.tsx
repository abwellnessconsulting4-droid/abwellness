import { Column, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { AutoRefresh, Elapsed } from "@/components/telehealth/visit-controls";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { waitingRoom } from "@/lib/services/telehealth";
import { formatDate } from "@/lib/time";
import { addDays, dateKey, formatTime, zonedTime } from "@/lib/tz";
import { DEFAULT_TZ } from "@/lib/services/scheduling";

export const metadata = { title: "Telehealth" };

const STATUS: Record<string, { label: string; variant: "neutral" | "warning" | "success" | "brand" }> = {
  NOT_ARRIVED: { label: "Not arrived", variant: "neutral" },
  IN_WAITING_ROOM: { label: "In waiting room", variant: "warning" },
  IN_SESSION: { label: "In session", variant: "brand" },
  COMPLETED: { label: "Completed", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
};

export default async function TelehealthPage({ searchParams }: PageProps<"/dashboard/telehealth">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const { date: requested } = await searchParams;
  const today = dateKey(new Date(), DEFAULT_TZ);
  const date = typeof requested === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  const visits = await orForbidden(waitingRoom(ctx, date));
  const waiting = visits.filter((v) => v.status === "IN_WAITING_ROOM").length;

  return (
    <Column gap="24" fillWidth>
      <AutoRefresh seconds={15} />
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">Telehealth</Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          {date === today ? "Today\u2019s video visits." : `Video visits on ${formatDate(zonedTime(date, "12:00", DEFAULT_TZ), DEFAULT_TZ)}.`} {waiting === 0 ? "Nobody is waiting." : `${waiting} ${waiting === 1 ? "client is" : "clients are"} in the waiting room.`} This page refreshes every 15 seconds.
        </Text>
        <Row gap="16" wrap>
          <SmartLink href={`/dashboard/telehealth?date=${addDays(date, -1)}`}>← Previous day</SmartLink>
          {date !== today && <SmartLink href="/dashboard/telehealth">Today</SmartLink>}
          <SmartLink href={`/dashboard/telehealth?date=${addDays(date, 1)}`}>Next day →</SmartLink>
        </Row>
      </Column>
      {visits.length === 0 ? (
        <Text variant="body-default-m" onBackground="neutral-weak">No video visits scheduled{date === today ? " today" : " that day"}.</Text>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Client</th>
                {ctx.role !== "PROVIDER" && <th scope="col">Provider</th>}
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => {
                const s = STATUS[v.status] ?? STATUS.NOT_ARRIVED;
                return (
                  <tr key={v.sessionId}>
                    <td>{formatTime(v.start, DEFAULT_TZ)}</td>
                    <td>{v.patient}</td>
                    {ctx.role !== "PROVIDER" && <td>{v.provider}</td>}
                    <td>
                      <Row gap="8" vertical="center" wrap>
                        <Tag variant={s.variant} label={s.label} />
                        {v.status === "IN_WAITING_ROOM" && v.waitingSince && <Elapsed since={v.waitingSince.toISOString()} label="for" />}
                        {v.status === "COMPLETED" && v.durationSeconds != null && <Text variant="label-default-s" onBackground="neutral-weak">{Math.round(v.durationSeconds / 60)} min</Text>}
                      </Row>
                    </td>
                    <td>
                      <SmartLink href={`/dashboard/telehealth/${v.sessionId}`}>{v.status === "IN_WAITING_ROOM" ? "Open & admit" : "Open"}</SmartLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Column>
  );
}

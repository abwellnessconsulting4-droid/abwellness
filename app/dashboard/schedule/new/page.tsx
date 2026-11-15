import { Button, Column, Feedback, Heading, Row, SmartLink, Text } from "@once-ui-system/core";
import { BookSlotButton } from "@/components/schedule/appointment-actions";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { searchPatients } from "@/lib/services/patients";
import { availableSlots, DEFAULT_TZ, listProviders, SchedulingError } from "@/lib/services/scheduling";
import { dateKey, formatTime } from "@/lib/tz";

export const metadata = { title: "Book appointment" };

const get = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function BookPage({ searchParams }: PageProps<"/dashboard/schedule/new">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const params = await searchParams;
  const [patients, providers] = await Promise.all([orForbidden(searchPatients(ctx, "")), listProviders()]);
  const visible = ctx.role === "PROVIDER" ? providers.filter((p) => p.id === ctx.staffProfileId) : providers;

  const patientId = get(params.patient);
  const providerId = get(params.provider) || (visible.length === 1 ? visible[0].id : "");
  const provider = visible.find((p) => p.id === providerId);
  const visitType = get(params.visitType) || provider?.visitTypes[0]?.key || "";
  const mode = (get(params.mode) || "VIRTUAL") as "IN_PERSON" | "VIRTUAL";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(get(params.date)) ? get(params.date) : dateKey(new Date(), DEFAULT_TZ);

  let slots: Date[] = [];
  let error: string | undefined;
  if (patientId && provider && visitType) {
    try {
      slots = await availableSlots({ providerId, date, visitType, mode });
    } catch (e) {
      if (e instanceof SchedulingError) error = e.message;
      else throw e;
    }
  }

  return (
    <Column gap="24" maxWidth="m">
      <Column gap="8">
        <SmartLink href={`/dashboard/schedule?date=${date}`}>← Schedule</SmartLink>
        <Heading as="h1" variant="display-strong-xs">Book an appointment</Heading>
      </Column>
      <form method="get" className="fill-width">
        <Column gap="12" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
          <label className="native-field">
            <span>Client</span>
            <select name="patient" defaultValue={patientId} required>
              <option value="">Choose a client</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.mrn}</option>)}
            </select>
          </label>
          <Row gap="12" wrap s={{ direction: "column" }}>
            <label className="native-field">
              <span>Provider</span>
              <select name="provider" defaultValue={providerId} required>
                <option value="">Choose a provider</option>
                {visible.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="native-field">
              <span>Visit type</span>
              <select name="visitType" defaultValue={visitType}>
                {(provider?.visitTypes ?? []).map((v) => <option key={v.key} value={v.key}>{v.name} ({v.durationMinutes} min)</option>)}
              </select>
            </label>
          </Row>
          <Row gap="12" wrap s={{ direction: "column" }}>
            <label className="native-field">
              <span>Format</span>
              <select name="mode" defaultValue={mode}>
                <option value="VIRTUAL">Video visit</option>
                <option value="IN_PERSON">In person</option>
              </select>
            </label>
            <label className="native-field">
              <span>Date</span>
              <input type="date" name="date" defaultValue={date} />
            </label>
          </Row>
          <Row><Button type="submit" variant="secondary" label="Show available times" /></Row>
        </Column>
      </form>

      {error && <Feedback variant="warning" description={error} />}
      {patientId && provider && !error && (
        <Column gap="12">
          <Heading as="h2" variant="heading-strong-m">Available times (Eastern)</Heading>
          {slots.length === 0 ? (
            <Text variant="body-default-s" onBackground="neutral-weak">No openings for that day and format. Try another date, or switch between video and in person.</Text>
          ) : (
            <Row gap="8" wrap>
              {slots.map((s) => (
                <BookSlotButton key={s.toISOString()} label={formatTime(s)} fields={{ patientId, providerId, visitType, mode, start: s.toISOString() }} />
              ))}
            </Row>
          )}
        </Column>
      )}
    </Column>
  );
}

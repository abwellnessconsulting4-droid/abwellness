import { Button, Column, Feedback, Heading, Row, SmartLink, Text } from "@once-ui-system/core";
import { bookMineAction } from "@/app/portal/appointments/actions";
import { SlotPicker } from "@/components/portal/appointment-forms";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { bookingOptions, weekSlots } from "@/lib/services/portal-appointments";
import { DEFAULT_TZ, SchedulingError } from "@/lib/services/scheduling";
import { formatDate } from "@/lib/time";
import { addDays, formatTime, zonedTime } from "@/lib/tz";

export const metadata = { title: "Book a visit" };

const get = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TZ, weekday: "long", month: "short", day: "numeric" }).format(zonedTime(date, "12:00", DEFAULT_TZ));

export default async function BookVisitPage({ searchParams }: PageProps<"/portal/appointments/book">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const params = await searchParams;
  if (!ctx.patientId) return <Text variant="body-default-m">Your account isn&apos;t linked to a client record yet.</Text>;
  const { providers, telehealthConsent } = await bookingOptions(ctx);
  const provider = providers.find((p) => p.id === get(params.provider)) ?? providers[0];

  if (!provider) {
    return (
      <Column gap="12" maxWidth="s">
        <SmartLink href="/portal/appointments">← Appointments</SmartLink>
        <Feedback variant="info" description="Online booking isn't available for your care plan yet. Message us and we'll find a time." />
      </Column>
    );
  }

  const visit = provider.visitTypes.find((v) => v.key === get(params.visitType)) ?? provider.visitTypes[0];
  const requestedMode = get(params.mode) === "IN_PERSON" ? "IN_PERSON" : "VIRTUAL";
  const mode = visit.modes.includes(requestedMode) ? requestedMode : visit.modes[0];
  const blockedVideo = mode === "VIRTUAL" && !telehealthConsent;

  let week: Awaited<ReturnType<typeof weekSlots>> | null = null;
  let error: string | undefined;
  if (!blockedVideo) {
    try {
      week = await weekSlots(ctx, { providerId: provider.id, visitType: visit.key, mode, from: get(params.from) || undefined });
    } catch (e) {
      if (e instanceof SchedulingError) error = e.message;
      else throw e;
    }
  }
  const qs = (from: string) => `?provider=${provider.id}&visitType=${visit.key}&mode=${mode}&from=${from}`;

  return (
    <Column gap="24" maxWidth="m">
      <Column gap="8">
        <SmartLink href="/portal/appointments">← Appointments</SmartLink>
        <Heading as="h1" variant="display-strong-xs">Book a visit</Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">With {provider.name}. Times are Eastern Time.</Text>
      </Column>

      <form method="get" className="fill-width">
        <input type="hidden" name="provider" value={provider.id} />
        <Row gap="12" wrap vertical="end" s={{ direction: "column" }}>
          <label className="native-field">
            <span>Visit</span>
            <select name="visitType" defaultValue={visit.key}>
              {provider.visitTypes.map((v) => (
                <option key={v.key} value={v.key}>{v.name} · {v.durationMinutes} min</option>
              ))}
            </select>
          </label>
          <label className="native-field">
            <span>Format</span>
            <select name="mode" defaultValue={mode}>
              {visit.modes.includes("VIRTUAL") && <option value="VIRTUAL">Video</option>}
              {visit.modes.includes("IN_PERSON") && <option value="IN_PERSON">In person</option>}
            </select>
          </label>
          <Button type="submit" variant="secondary" label="Show times" />
        </Row>
      </form>

      {blockedVideo && (
        <Feedback variant="warning" title="Telehealth consent needed" description="Please sign the telehealth consent on the Consents page before booking a video visit, or choose an in-person visit." />
      )}
      {error && <Feedback variant="danger" description={error} />}

      {week && (
        <Column gap="16" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
          <Row horizontal="between" vertical="center" gap="12" wrap>
            <Text variant="label-strong-m">Week of {formatDate(zonedTime(week.from, "12:00", DEFAULT_TZ), DEFAULT_TZ)}</Text>
            <Row gap="16">
              <SmartLink href={qs(addDays(week.from, -7))}>← Earlier</SmartLink>
              <SmartLink href={qs(addDays(week.from, 7))}>Later →</SmartLink>
            </Row>
          </Row>
          <SlotPicker
            action={bookMineAction}
            providerId={provider.id}
            visitType={visit.key}
            mode={mode}
            days={week.days.map((d) => ({ label: dayLabel(d.date), slots: d.slots.map((s) => ({ iso: s.toISOString(), label: formatTime(s, DEFAULT_TZ) })) }))}
          />
        </Column>
      )}
      <Text variant="body-default-xs" onBackground="neutral-weak">
        Cancelling with less than 24 hours&apos; notice may incur a fee under your signed financial agreement.
      </Text>
    </Column>
  );
}

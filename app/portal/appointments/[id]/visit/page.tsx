import { notFound } from "next/navigation";
import { Column, Feedback, Heading, SmartLink, Text } from "@once-ui-system/core";
import { AutoRefresh, VideoTile } from "@/components/telehealth/visit-controls";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { myVisit } from "@/lib/services/portal-appointments";
import { SchedulingError } from "@/lib/services/scheduling";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Video visit" };

/** The client's waiting room and call screen (mock video for now). */
export default async function PortalVisitPage({ params }: PageProps<"/portal/appointments/[id]/visit">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const { id } = await params;
  const visit = await myVisit(ctx, id).catch((error) => {
    if (error instanceof SchedulingError) notFound();
    throw error;
  });
  const name = ctx.displayName ?? "You";

  return (
    <Column gap="20" maxWidth="m">
      {visit.status !== "IN_SESSION" && visit.status !== "COMPLETED" && <AutoRefresh seconds={10} />}
      <SmartLink href="/portal/appointments">← Appointments</SmartLink>
      <Column gap="4">
        <Heading as="h1" variant="display-strong-xs">{visit.status === "IN_SESSION" ? "Your visit" : "Waiting room"}</Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">{visit.visit} with {visit.provider} · {formatDateTime(visit.start)}</Text>
      </Column>
      <VideoTile status={visit.status} patient={name} startedAt={visit.startedAt?.toISOString()} waitingSince={visit.waitingSince?.toISOString()} />
      <div aria-live="polite">
        {visit.status === "IN_WAITING_ROOM" && <Feedback variant="info" description={`You're in the waiting room. ${visit.provider} will let you in shortly. This page updates by itself.`} />}
        {visit.status === "NOT_ARRIVED" && <Feedback variant="info" description="Use “Join video visit” on the Appointments page to enter the waiting room." />}
        {visit.status === "IN_SESSION" && <Feedback variant="success" description="You're connected with your provider." />}
        {visit.status === "COMPLETED" && <Feedback variant="success" description="This visit has ended. Thank you!" />}
        {visit.status === "CANCELLED" && <Feedback variant="info" description="This visit was cancelled." />}
      </div>
      <Text variant="body-default-xs" onBackground="neutral-weak">
        Before your visit: find a private, quiet spot and check your camera and microphone. If you&apos;re in crisis, call or text 988, or call 911.
      </Text>
    </Column>
  );
}

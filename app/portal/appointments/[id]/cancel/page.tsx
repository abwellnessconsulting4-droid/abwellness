import { notFound } from "next/navigation";
import { Column, Feedback, Heading, SmartLink, Text } from "@once-ui-system/core";
import { cancelMineAction } from "@/app/portal/appointments/actions";
import { CancelForm } from "@/components/portal/appointment-forms";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { cancellationPreview } from "@/lib/services/portal-appointments";
import { SchedulingError } from "@/lib/services/scheduling";
import { formatDateTime, formatMoney } from "@/lib/time";

export const metadata = { title: "Cancel appointment" };

export default async function CancelPage({ params }: PageProps<"/portal/appointments/[id]/cancel">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const { id } = await params;
  const preview = await cancellationPreview(ctx, id).catch((error) => {
    if (error instanceof SchedulingError) notFound();
    throw error;
  });

  return (
    <Column gap="20" maxWidth="s">
      <SmartLink href="/portal/appointments">← Appointments</SmartLink>
      <Heading as="h1" variant="display-strong-xs">Cancel appointment</Heading>
      <Column gap="4" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
        <Text variant="label-strong-m">{formatDateTime(preview.start)}</Text>
        <Text variant="body-default-s">{preview.visit} with {preview.provider} · {preview.mode === "VIRTUAL" ? "Video" : "In person"}</Text>
      </Column>
      {!preview.cancellable ? (
        <Feedback variant="info" description="This appointment can't be cancelled online. Please message us." />
      ) : (
        <>
          {preview.late ? (
            <Feedback
              variant="warning"
              title={`Late cancellation: ${formatMoney(preview.feeCents)} fee`}
              description={`Your visit is ${preview.hoursNotice} hours away. Under the financial agreement you signed (${preview.policyVersion}), cancelling with less than ${preview.policyHours} hours' notice has a ${formatMoney(preview.feeCents)} fee. If this is an emergency, message us instead and we'll review it.`}
            />
          ) : (
            <Feedback variant="success" description={`No fee: you're giving ${Math.floor(preview.hoursNotice)} hours' notice.`} />
          )}
          <CancelForm action={cancelMineAction.bind(null, id)} late={preview.late && preview.feeCents > 0} />
        </>
      )}
    </Column>
  );
}

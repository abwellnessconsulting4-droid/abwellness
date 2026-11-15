import Link from "next/link";
import { Column, Feedback, Heading, SmartLink, Text } from "@once-ui-system/core";
import { enrollPlanAction } from "@/app/portal/billing/actions";
import { PlanAgreement } from "@/components/portal/billing-forms";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { isTestMode } from "@/lib/payments";
import { PaymentError, PLAN_INSTALLMENTS, previewPlan } from "@/lib/services/payments";
import { formatMoney } from "@/lib/time";

export const metadata = { title: "Payment plan" };

export default async function PlanPage({ params, searchParams }: PageProps<"/portal/billing/plan/[invoiceId]">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const { invoiceId } = await params;
  const { n } = await searchParams;
  const count = PLAN_INSTALLMENTS.find((c) => String(c) === n) ?? 3;
  let preview;
  try {
    preview = await previewPlan(ctx, invoiceId, count);
  } catch (error) {
    if (!(error instanceof PaymentError)) throw error;
    return (
      <Column gap="12" maxWidth="s">
        <SmartLink href="/portal/billing">← Billing</SmartLink>
        <Feedback variant="info" description={error.message} />
      </Column>
    );
  }

  return (
    <Column gap="24" maxWidth="s">
      <Column gap="8">
        <SmartLink href="/portal/billing">← Billing</SmartLink>
        <Heading as="h1" variant="display-strong-xs">Set up a payment plan</Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          Spread <strong>{formatMoney(preview.totalCents)}</strong> for {preview.invoice.invoiceNumber} over monthly payments. No interest, no fees.
        </Text>
      </Column>

      <nav aria-label="Number of payments" className="chart-tabs">
        {PLAN_INSTALLMENTS.map((c) => (
          <Link key={c} href={`?n=${c}`} aria-current={c === count ? "page" : undefined}>
            {c} payments
          </Link>
        ))}
      </nav>

      <Column gap="8" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
        <Heading as="h2" variant="heading-strong-s">Plan terms</Heading>
        <pre className="terms-text">{preview.text}</pre>
      </Column>
      {isTestMode() && <Feedback variant="info" description="Test mode: a test card is saved for autopay and no real charges are made." />}
      <PlanAgreement action={enrollPlanAction.bind(null, invoiceId, count)} expectedName={ctx.displayName ?? "your full name"} />
    </Column>
  );
}

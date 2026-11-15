import { notFound, redirect } from "next/navigation";
import { Column, Feedback, Heading, Text } from "@once-ui-system/core";
import { checkoutAction } from "@/app/portal/billing/actions";
import { TestCheckout } from "@/components/portal/billing-forms";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { getCheckout, PaymentError } from "@/lib/services/payments";
import { formatMoney } from "@/lib/time";

export const metadata = { title: "Checkout" };

/** Stand-in for the processor's hosted checkout while payments are simulated. */
export default async function CheckoutPage({ params }: PageProps<"/portal/billing/checkout/[ref]">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const { ref } = await params;
  const checkout = await getCheckout(ctx, ref).catch((error) => {
    if (error instanceof PaymentError) notFound();
    throw error;
  });
  if (checkout.processor !== "SIMULATED") notFound();
  if (checkout.status !== "PENDING") redirect("/portal/billing");

  return (
    <Column gap="20" maxWidth="xs">
      <Heading as="h1" variant="display-strong-xs">Checkout</Heading>
      <Feedback variant="warning" title="Test checkout" description="This is a stand-in for the secure card page. No card details are collected and nothing is charged." />
      <Column gap="8" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
        <Text variant="label-default-s" onBackground="neutral-medium">Paying</Text>
        <Text variant="heading-strong-xl" className="stat-value">{formatMoney(checkout.amountCents)}</Text>
        <Text variant="body-default-s" className="notranslate">For {checkout.invoices.join(", ")}</Text>
      </Column>
      <TestCheckout action={checkoutAction.bind(null, ref)} amountCents={checkout.amountCents} />
    </Column>
  );
}

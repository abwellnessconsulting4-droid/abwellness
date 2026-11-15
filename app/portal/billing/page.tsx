import { Column, Feedback, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { payAction } from "@/app/portal/billing/actions";
import { INVOICE_KIND_LABEL, INVOICE_STATUS_TAG } from "@/components/billing/status";
import { PayInvoices } from "@/components/portal/billing-forms";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { isTestMode } from "@/lib/payments";
import { portalBilling } from "@/lib/services/payments";
import { DEFAULT_TZ } from "@/lib/services/scheduling";
import { formatDate, formatDateTime, formatMoney } from "@/lib/time";

export const metadata = { title: "Billing" };

export default async function PortalBillingPage({ searchParams }: PageProps<"/portal/billing">) {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const query = await searchParams;
  if (!ctx.patientId) {
    return <Text variant="body-default-m">Your account isn&apos;t linked to a client record yet.</Text>;
  }
  const { open, payments, plans } = await portalBilling(ctx);
  const payable = open.filter((i) => i.status === "UNPAID" || i.status === "PARTIAL");
  const owed = open.reduce((n, i) => n + i.balanceCents, 0);

  return (
    <Column gap="32" fillWidth>
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">Billing</Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          {owed > 0 ? <>Your balance is <strong>{formatMoney(owed)}</strong>.</> : "You're all paid up. Thank you!"}
        </Text>
        {isTestMode() && <Feedback variant="info" description="Payments are in test mode: no card is charged." />}
      </Column>

      {typeof query.paid === "string" && <Feedback variant="success" title="Payment received" description={`Thank you. Your receipt number is ${query.paid}. You can download it below.`} />}
      {query.plan && <Feedback variant="success" title="Payment plan started" description="Your first payment went through. The rest will be charged automatically on the dates shown." />}
      {query.cancelled && <Feedback variant="info" description="Checkout cancelled. Nothing was charged." />}

      {open.length > 0 && (
        <Column gap="16">
          <Heading as="h2" variant="heading-strong-l">Open invoices</Heading>
          {open.map((inv) => {
            const tag = INVOICE_STATUS_TAG[inv.status] ?? INVOICE_STATUS_TAG.UNPAID;
            return (
              <Column key={inv.id} gap="8" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
                <Row horizontal="between" vertical="center" gap="8" wrap>
                  <Row gap="8" vertical="center" wrap>
                    <Text variant="label-strong-m" className="notranslate">{inv.invoiceNumber}</Text>
                    <Tag variant={tag.variant} label={tag.label} />
                    <Text variant="label-default-s" onBackground="neutral-weak">{INVOICE_KIND_LABEL[inv.kind] ?? inv.kind}</Text>
                  </Row>
                  <Text variant="heading-strong-s">{formatMoney(inv.balanceCents)}</Text>
                </Row>
                {inv.lineItems.map((li, i) => (
                  <Row key={i} horizontal="between" gap="12">
                    <Text variant="body-default-s">{li.description}</Text>
                    <Text variant="body-default-s">{formatMoney(li.amountCents)}</Text>
                  </Row>
                ))}
                <Text variant="body-default-xs" onBackground="neutral-weak">
                  {inv.issuedAt ? `Issued ${formatDate(inv.issuedAt, DEFAULT_TZ)}` : ""}
                  {inv.dueDate ? ` · due ${formatDate(inv.dueDate, DEFAULT_TZ)}` : ""}
                </Text>
                {inv.notes && <Text variant="body-default-xs" onBackground="neutral-medium">{inv.notes}</Text>}
                {inv.planEligible && (
                  <SmartLink href={`/portal/billing/plan/${inv.id}?n=3`}>Pay over time with a payment plan</SmartLink>
                )}
              </Column>
            );
          })}
          {payable.length > 0 && (
            <Column gap="8" padding="20" radius="l" border="brand-alpha-medium">
              <Heading as="h3" variant="heading-strong-s">Pay now</Heading>
              <PayInvoices action={payAction} invoices={payable.map((i) => ({ id: i.id, label: i.invoiceNumber, balanceCents: i.balanceCents }))} />
            </Column>
          )}
        </Column>
      )}

      {plans.length > 0 && (
        <Column gap="12">
          <Heading as="h2" variant="heading-strong-l">Payment plans</Heading>
          {plans.map((p) => (
            <Column key={p.id} gap="8" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
              <Row gap="8" vertical="center" wrap>
                <Text variant="label-strong-m">{formatMoney(p.totalCents)} for {p.invoices.join(", ")}</Text>
                <Tag variant={p.status === "COMPLETED" ? "success" : "info"} label={p.status === "COMPLETED" ? "Completed" : p.autopay ? "Active · autopay" : "Active"} />
              </Row>
              <ol className="plan-schedule">
                {p.schedule.map((s, i) => (
                  <li key={i}>
                    <span>{formatDate(s.dueDate, DEFAULT_TZ)}</span>
                    <span>{formatMoney(s.amountCents)}</span>
                    <Tag variant={s.status === "PAID" ? "success" : s.status === "FAILED" ? "danger" : "neutral"} label={s.status === "PAID" ? "Paid" : s.status === "FAILED" ? "Failed" : "Scheduled"} />
                  </li>
                ))}
              </ol>
            </Column>
          ))}
        </Column>
      )}

      <Column gap="12">
        <Heading as="h2" variant="heading-strong-l">Payment history</Heading>
        {payments.length === 0 ? (
          <Text variant="body-default-s" onBackground="neutral-weak">No payments yet.</Text>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">For</th>
                  <th scope="col">Paid with</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.createdAt ? formatDateTime(p.createdAt) : "—"}</td>
                    <td className="notranslate">{p.invoices.join(", ")}{p.plan ? " (plan)" : ""}</td>
                    <td>{p.card}</td>
                    <td className="num">{formatMoney(p.amountCents)}</td>
                    <td>
                      <a href={`/portal/billing/receipts/${p.id}`} download>
                        {p.receiptNumber ?? "Download"} (PDF)
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Column>
    </Column>
  );
}

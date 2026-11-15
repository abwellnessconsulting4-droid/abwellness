import Link from "next/link";
import { Column, Grid, Heading, SmartLink, Tag, Text } from "@once-ui-system/core";
import { INVOICE_KIND_LABEL, INVOICE_STATUS_TAG } from "@/components/billing/status";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { listInvoices } from "@/lib/services/rcm";
import { DEFAULT_TZ } from "@/lib/services/scheduling";
import { formatDate, formatMoney } from "@/lib/time";

export const metadata = { title: "Invoices" };

const FILTERS = { open: "Open", paid: "Paid", all: "All" } as const;

export default async function InvoicesPage({ searchParams }: PageProps<"/dashboard/billing/invoices">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const { status: s } = await searchParams;
  const status = typeof s === "string" && s in FILTERS ? (s as keyof typeof FILTERS) : "open";
  const { aging, totalOpenCents, invoices } = await orForbidden(listInvoices(ctx, { status }));

  return (
    <Column gap="24" fillWidth>
      <Column gap="8">
        <SmartLink href="/dashboard/billing">← Claims</SmartLink>
        <Heading as="h1" variant="display-strong-xs">Client invoices</Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          Open client balance: <strong>{formatMoney(totalOpenCents)}</strong>. Aging counts from the invoice date.
        </Text>
      </Column>

      <Grid columns="4" gap="12" m={{ columns: 2 }}>
        {aging.map((b) => (
          <Column key={b.key} gap="8" padding="16" radius="l" background="surface" border="neutral-alpha-weak">
            <Text variant="label-default-s" onBackground="neutral-medium">{b.label}</Text>
            <Text variant="heading-strong-l" className="stat-value">{formatMoney(b.cents)}</Text>
            <Text variant="body-default-xs" onBackground="neutral-weak">{b.count} {b.count === 1 ? "invoice" : "invoices"}</Text>
          </Column>
        ))}
      </Grid>

      <nav aria-label="Invoice filter" className="chart-tabs">
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((key) => (
          <Link key={key} href={`?status=${key}`} aria-current={key === status ? "page" : undefined}>
            {FILTERS[key]}
          </Link>
        ))}
      </nav>

      {invoices.length === 0 ? (
        <Text variant="body-default-m" onBackground="neutral-weak">No invoices.</Text>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Client</th>
                <th scope="col">Type</th>
                <th scope="col">Issued</th>
                <th scope="col">Due</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col" className="num">Balance</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const t = INVOICE_STATUS_TAG[i.status] ?? INVOICE_STATUS_TAG.UNPAID;
                return (
                  <tr key={i.id}>
                    <td className="notranslate">
                      {i.claimId ? <SmartLink href={`/dashboard/billing/claims/${i.claimId}`}>{i.invoiceNumber}</SmartLink> : i.invoiceNumber}
                    </td>
                    <td>
                      <SmartLink href={`/dashboard/patients/${i.patientId}?tab=billing`}>{i.patient}</SmartLink>
                    </td>
                    <td>{INVOICE_KIND_LABEL[i.kind] ?? i.kind}</td>
                    <td>{i.issuedAt ? formatDate(i.issuedAt, DEFAULT_TZ) : "—"}</td>
                    <td>{i.dueDate ? formatDate(i.dueDate, DEFAULT_TZ) : "—"}</td>
                    <td className="num">{formatMoney(i.amountDueCents)}</td>
                    <td className="num">{formatMoney(i.balanceCents)}</td>
                    <td>
                      <Tag variant={t.variant} label={t.label} />
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

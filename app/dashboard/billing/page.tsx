import Link from "next/link";
import { Column, Grid, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { can, STAFF_ROLES } from "@/lib/rbac";
import { CLAIM_QUEUES, listClaims, listInvoices, type ClaimQueue } from "@/lib/services/rcm";
import { formatDate, formatMoney } from "@/lib/time";
import { DEFAULT_TZ } from "@/lib/services/scheduling";
import { CLAIM_STATUS_TAG } from "@/components/billing/status";

export const metadata = { title: "Billing & claims" };

export default async function BillingPage({ searchParams }: PageProps<"/dashboard/billing">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const { queue: q } = await searchParams;
  const queue: ClaimQueue = typeof q === "string" && q in CLAIM_QUEUES ? (q as ClaimQueue) : "review";
  const { counts, claims } = await orForbidden(listClaims(ctx, queue));
  const ar = can(ctx.role, "invoice", "export") ? await listInvoices(ctx, { status: "open" }) : null;

  return (
    <Column gap="24" fillWidth>
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">Billing &amp; claims</Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          Claims are drafted automatically when a provider signs a visit note. Review them, submit, post the payer&apos;s response, and work denials.
        </Text>
      </Column>

      {ar && (
        <Grid columns="5" gap="12" m={{ columns: 3 }} s={{ columns: 2 }}>
          <Column gap="8" padding="16" radius="l" background="surface" border="neutral-alpha-weak">
            <Text variant="label-default-s" onBackground="neutral-medium">Patient A/R</Text>
            <Text variant="heading-strong-l" className="stat-value">{formatMoney(ar.totalOpenCents)}</Text>
            <SmartLink href="/dashboard/billing/invoices">Invoices</SmartLink>
          </Column>
          {ar.aging.map((b) => (
            <Column key={b.key} gap="8" padding="16" radius="l" background="surface" border={b.key === "d90" && b.cents > 0 ? "accent-alpha-medium" : "neutral-alpha-weak"}>
              <Text variant="label-default-s" onBackground="neutral-medium">{b.label}</Text>
              <Text variant="heading-strong-l" className="stat-value">{formatMoney(b.cents)}</Text>
              <Text variant="body-default-xs" onBackground="neutral-weak">{b.count} {b.count === 1 ? "invoice" : "invoices"}</Text>
            </Column>
          ))}
        </Grid>
      )}

      <nav aria-label="Claim queues" className="chart-tabs">
        {(Object.keys(CLAIM_QUEUES) as ClaimQueue[]).map((key) => (
          <Link key={key} href={`?queue=${key}`} aria-current={key === queue ? "page" : undefined}>
            {CLAIM_QUEUES[key].label} ({counts[key]})
          </Link>
        ))}
      </nav>

      {claims.length === 0 ? (
        <Text variant="body-default-m" onBackground="neutral-weak">No claims in this queue.</Text>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Claim</th>
                <th scope="col">Client</th>
                <th scope="col">Payer</th>
                <th scope="col">Service date</th>
                <th scope="col" className="num">Billed</th>
                <th scope="col" className="num">Paid</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => {
                const tag = CLAIM_STATUS_TAG[c.status];
                return (
                  <tr key={c.id}>
                    <td className="notranslate">
                      <SmartLink href={`/dashboard/billing/claims/${c.id}`}>{c.claimNumber}</SmartLink>
                    </td>
                    <td>{c.patient}</td>
                    <td>{c.payerName}</td>
                    <td>{c.serviceDate ? formatDate(c.serviceDate, DEFAULT_TZ) : "—"}</td>
                    <td className="num">{formatMoney(c.billedCents)}</td>
                    <td className="num">{c.paidCents ? formatMoney(c.paidCents) : "—"}</td>
                    <td>
                      <Row gap="8" vertical="center" wrap>
                        <Tag variant={tag.variant} label={tag.label} />
                        {c.denial && <Text variant="label-default-s" onBackground="danger-medium" className="notranslate">{c.denial}</Text>}
                        {c.resubmissions > 0 && <Text variant="label-default-s" onBackground="neutral-weak">resubmitted ×{c.resubmissions}</Text>}
                      </Row>
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

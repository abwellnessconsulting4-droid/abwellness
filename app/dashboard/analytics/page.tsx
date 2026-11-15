import Link from "next/link";
import { Column, Heading, Row, Text } from "@once-ui-system/core";
import { BarList, ColumnChart, StackedColumnChart, StatTile } from "@/components/analytics/charts";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { can, STAFF_ROLES } from "@/lib/rbac";
import { billingAnalytics, operationalAnalytics, patientAnalytics } from "@/lib/services/analytics";
import { formatMoney } from "@/lib/time";

export const metadata = { title: "Analytics" };

const TABS = { patients: "Patients", billing: "Billing & revenue", operations: "Operations" } as const;
type Tab = keyof typeof TABS;

const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);
const signedPct = (r: number | null) => (r == null ? "no prior month" : `${r >= 0 ? "+" : ""}${Math.round(r * 100)}% vs last month`);
const dollars = (cents: number) => formatMoney(cents).replace(/\.00$/, "");

export default async function AnalyticsPage({ searchParams }: PageProps<"/dashboard/analytics">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const { tab: t } = await searchParams;
  const tab: Tab = typeof t === "string" && t in TABS ? (t as Tab) : "patients";
  const canExport = can(ctx.role, "analytics", "export");

  let body: React.ReactNode;
  let scopeLabel = "";
  if (tab === "patients") {
    const p = await orForbidden(patientAnalytics(ctx));
    scopeLabel = p.scope;
    body = (
      <Column gap="20">
        <div className="viz-stats">
          <StatTile label="Registered clients" value={p.totals.registered.toLocaleString()} hint={`${p.totals.active} active · ${p.totals.inactive} inactive`} />
          <StatTile label="New this month" value={String(p.totals.newThisMonth)} hint={signedPct(p.totals.momChange)} />
          <StatTile label="No-show rate (90 days)" value={pct(p.rates.noShow)} hint={`${p.rates.noShowCounts.noShow} of ${p.rates.noShowCounts.noShow + p.rates.noShowCounts.completed} due visits`} attention={(p.rates.noShow ?? 0) > 0.1} />
          <StatTile label="Late cancellations (90 days)" value={pct(p.rates.lateCancel)} hint="Share of visits that were due" />
          <StatTile label="Retention" value={pct(p.rates.retention)} hint={p.rates.retentionCounts.cohort ? `${p.rates.retentionCounts.retained} of ${p.rates.retentionCounts.cohort} seen 3–6 months ago returned` : "Needs 6 months of visit history"} />
          <StatTile label="Portal engagement (30 days)" value={pct(p.rates.portalEngagement)} hint={`${p.rates.portalCounts.engaged} of ${p.rates.portalCounts.withAccount} clients with an account`} />
        </div>
        <div className="viz-grid-2">
          <ColumnChart narrow title="New registrations" caption="Clients registered per month" data={p.registrations} unit="Registrations" />
          <ColumnChart narrow title="Appointment volume" caption="Visits per month (excluding cancellations)" data={p.visits} unit="Visits" />
        </div>
        <div className="viz-grid-3">
          <BarList title="Age" data={p.demographics.age} />
          <BarList title="Gender" data={p.demographics.gender} />
          <BarList title="Primary payer" data={p.demographics.payer} />
        </div>
      </Column>
    );
  } else if (tab === "billing") {
    const b = await orForbidden(billingAnalytics(ctx));
    scopeLabel = b.scope;
    body = (
      <Column gap="20">
        <div className="viz-stats">
          <StatTile label="Claims submitted" value={String(b.claims.submitted)} hint={`${b.claims.draft} in draft or ready`} />
          <StatTile label="Paid rate" value={pct(b.claims.paidRate)} hint={`${b.claims.paid} paid · ${b.claims.pending} awaiting payer`} />
          <StatTile label="First-pass denial rate" value={pct(b.claims.firstPassDenialRate)} hint={`${b.claims.denied} currently denied`} attention={(b.claims.firstPassDenialRate ?? 0) > 0.1} />
          <StatTile label="A/R outstanding" value={dollars(b.ar.totalCents)} hint={`Insurance ${dollars(b.ar.insuranceCents)} · clients ${dollars(b.ar.patientCents)}`} />
          <StatTile label="Reimbursement" value={pct(b.reimbursement.rate)} hint={`${dollars(b.reimbursement.insurancePaidCents)} paid of ${dollars(b.reimbursement.billedCents)} billed`} />
        </div>
        <StackedColumnChart
          title="Revenue received"
          caption="Cash in by month: insurance payments (by adjudication date) and client payments, net of refunds"
          data={b.revenueByMonth.map((m) => ({ label: m.label, a: m.insurance, b: m.client }))}
          series={["Insurance", "Clients"]}
          format={dollars}
        />
        <div className="viz-grid-2">
          <BarList title="Claims by status" data={b.claims.statusBreakdown} />
          <BarList title="Insurance payments by provider" caption="Paid claims" data={b.byProvider.map((r) => ({ label: r.label, value: r.paid }))} format={dollars} />
        </div>
        <BarList title="Insurance payments by service (CPT)" caption="Paid claim lines" data={b.byCpt.map((r) => ({ label: r.label, value: r.paid }))} format={dollars} />
        <Column gap="8" padding="20" radius="l" border="neutral-alpha-weak">
          <Heading as="h2" variant="heading-strong-m">Annual revenue summary</Heading>
          <Text variant="body-default-xs" onBackground="neutral-weak">Revenue only. Expenses aren&apos;t tracked in this system, so this isn&apos;t a full P&amp;L.</Text>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Year</th>
                  <th scope="col" className="num">Charges billed</th>
                  <th scope="col" className="num">Contractual adj.</th>
                  <th scope="col" className="num">Insurance paid</th>
                  <th scope="col" className="num">Client payments</th>
                  <th scope="col" className="num">Total received</th>
                </tr>
              </thead>
              <tbody>
                {b.annual.map((y) => (
                  <tr key={y.year}>
                    <td>{y.year}</td>
                    <td className="num">{formatMoney(y.billedCents)}</td>
                    <td className="num">{formatMoney(y.contractualCents)}</td>
                    <td className="num">{formatMoney(y.insuranceCents)}</td>
                    <td className="num">{formatMoney(y.clientCents)}</td>
                    <td className="num"><strong>{formatMoney(y.insuranceCents + y.clientCents)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Column>
      </Column>
    );
  } else {
    const o = await orForbidden(operationalAnalytics(ctx));
    scopeLabel = o.scope;
    body = (
      <Column gap="20">
        <div className="viz-stats">
          <StatTile label={`Documentation on time (${o.days} days)`} value={pct(o.documentation.rate)} hint={`${o.documentation.signedWithin48h} of ${o.documentation.completedVisits} visits signed within 48 h`} />
          <StatTile label="Unsigned notes > 48 h" value={String(o.documentation.overdueCount)} hint={o.documentation.overdueCount ? o.documentation.overdueByProvider.map((r) => `${r.label}: ${r.value}`).join(" · ") : "All caught up"} attention={o.documentation.overdueCount > 0} />
          <StatTile label="Referral conversion (12 months)" value={pct(o.referrals.rate)} hint={`${o.referrals.converted} of ${o.referrals.total} new clients completed a first visit`} />
          <StatTile label="Satisfaction" value={o.satisfaction.average == null ? "—" : `${o.satisfaction.average.toFixed(1)} / 5`} hint={`${o.satisfaction.responses} ${o.satisfaction.responses === 1 ? "rating" : "ratings"} · ${pct(o.satisfaction.responseRate)} response rate`} />
        </div>
        <div className="viz-grid-2">
          <BarList title={`Provider utilization (${o.days} days)`} caption="Booked hours as a share of scheduled availability" data={o.providers.map((p) => ({ label: p.label, value: Math.round((p.utilization ?? 0) * 100) }))} format={(n) => `${n}%`} max={100} />
          <BarList title={`Encounters (${o.days} days)`} caption="Completed visits" data={o.providers.map((p) => ({ label: p.label, value: p.encounters }))} />
        </div>
        <Column gap="8" padding="20" radius="l" border="neutral-alpha-weak">
          <Heading as="h2" variant="heading-strong-m">Provider productivity ({o.days} days)</Heading>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col" className="num">Available h</th>
                  <th scope="col" className="num">Booked h</th>
                  <th scope="col" className="num">Billable h</th>
                  <th scope="col" className="num">Encounters</th>
                  <th scope="col" className="num">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {o.providers.map((p) => (
                  <tr key={p.label}>
                    <td>{p.label}</td>
                    <td className="num">{p.availableHours}</td>
                    <td className="num">{p.bookedHours}</td>
                    <td className="num">{p.billableHours}</td>
                    <td className="num">{p.encounters}</td>
                    <td className="num">{pct(p.utilization)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Column>
        <div className="viz-grid-2">
          <BarList title="Referral conversion by source" caption="New clients in the last 12 months who completed a first visit" data={o.referrals.bySource.map((r) => ({ label: `${r.label} (${r.converted}/${r.referred})`, value: Math.round((r.rate ?? 0) * 100) }))} format={(n) => `${n}%`} max={100} />
          <BarList title="Satisfaction ratings" caption="Post-visit survey, last 12 months" data={o.satisfaction.distribution} />
        </div>
      </Column>
    );
  }

  return (
    <Column gap="24" fillWidth>
      <Row horizontal="between" vertical="end" gap="12" wrap>
        <Column gap="8">
          <Heading as="h1" variant="display-strong-xs">Analytics</Heading>
          <Text variant="body-default-m" onBackground="neutral-medium">{scopeLabel}. Figures update live from the system of record.</Text>
        </Column>
        {canExport && (
          <Row gap="12" wrap>
            <a className="export-link" href={`/dashboard/analytics/export?tab=${tab}&format=csv`}>Export CSV</a>
            <a className="export-link" href={`/dashboard/analytics/export?tab=${tab}&format=pdf`}>Export PDF</a>
          </Row>
        )}
      </Row>
      <nav aria-label="Analytics sections" className="chart-tabs">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <Link key={key} href={`?tab=${key}`} aria-current={key === tab ? "page" : undefined}>
            {TABS[key]}
          </Link>
        ))}
      </nav>
      {body}
    </Column>
  );
}

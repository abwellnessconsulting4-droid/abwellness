import { Column, Heading, Row, Tag, Text } from "@once-ui-system/core";
import { complianceAction } from "@/app/dashboard/compliance/actions";
import { StatTile } from "@/components/analytics/charts";
import { BaaFields, ComplianceForm, DrillFields, NotesField } from "@/components/compliance/forms";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { complianceOverview, REVIEW_INTERVAL_DAYS, type CheckStatus } from "@/lib/services/compliance";
import { formatDate, formatDateTime } from "@/lib/time";

export const metadata = { title: "Compliance" };

const CHECK: Record<CheckStatus, { label: string; variant: "success" | "warning" | "danger"; icon: string }> = {
  PASS: { label: "OK", variant: "success", icon: "✓" },
  WARN: { label: "Attention", variant: "warning", icon: "!" },
  FAIL: { label: "Action needed", variant: "danger", icon: "✕" },
};
const BAA_TAG: Record<string, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  ACTIVE: { label: "Active", variant: "success" },
  PENDING: { label: "Pending", variant: "warning" },
  EXPIRED: { label: "Expired", variant: "danger" },
  TERMINATED: { label: "Terminated", variant: "neutral" },
  NOT_APPLICABLE: { label: "Not applicable", variant: "neutral" },
};
const isoDay = (d?: Date) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);
const ROLE: Record<string, string> = { SUPER_ADMIN: "Admin", PROVIDER: "Provider", BILLING_STAFF: "Billing", FRONT_DESK: "Front desk" };

export default async function CompliancePage() {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const o = await orForbidden(complianceOverview(ctx));

  return (
    <Column gap="32" fillWidth>
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">Compliance</Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          HIPAA administrative safeguards: vendor agreements, backups, access reviews, and incidents. Every change here is recorded in the audit trail.
        </Text>
      </Column>

      <div className="viz-stats">
        <StatTile label="BAA gaps" value={String(o.summary.baaGaps)} hint={o.summary.baaGaps ? "Pending, expired, or renewing within 60 days" : "All vendor agreements in place"} attention={o.summary.baaGaps > 0} />
        <StatTile label="Automated checks" value={`${o.checks.length - o.summary.failing - o.summary.warnings}/${o.checks.length} OK`} hint={`${o.summary.failing} need action · ${o.summary.warnings} need attention`} attention={o.summary.failing > 0} />
        <StatTile label="Last restore drill" value={o.lastPassingDrill ? formatDate(o.lastPassingDrill) : "None"} hint={o.backupDue ? `Due: drills are quarterly (every ${REVIEW_INTERVAL_DAYS} days)` : "Within the quarterly window"} attention={o.backupDue} />
        <StatTile label="Access review" value={o.reviews[0] ? formatDate(o.reviews[0].at) : "Never"} hint={o.accessReviewDue ? "Due: review staff access quarterly" : "Within the quarterly window"} attention={o.accessReviewDue} />
      </div>

      <Column gap="12">
        <Heading as="h2" variant="heading-strong-l">Automated checks</Heading>
        <ul className="check-list">
          {o.checks.map((c) => {
            const s = CHECK[c.status];
            return (
              <li key={c.id} className={`check-${c.status.toLowerCase()}`}>
                <span className="check-icon" aria-hidden="true">{s.icon}</span>
                <Column gap="2">
                  <Row gap="8" vertical="center" wrap>
                    <Text variant="label-strong-m">{c.label}</Text>
                    <Tag variant={s.variant} label={s.label} />
                  </Row>
                  <Text variant="body-default-s" onBackground="neutral-medium">{c.detail}</Text>
                </Column>
              </li>
            );
          })}
        </ul>
      </Column>

      <Column gap="12">
        <Heading as="h2" variant="heading-strong-l">Business associate agreements</Heading>
        <Text variant="body-default-s" onBackground="neutral-medium">Every vendor that stores or processes PHI needs a signed BAA before real client data goes in.</Text>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Vendor</th>
                <th scope="col">Service</th>
                <th scope="col">Status</th>
                <th scope="col">Signed</th>
                <th scope="col">Renewal</th>
                <th scope="col">Notes</th>
                <th scope="col"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody>
              {o.baas.map((b) => {
                const t = BAA_TAG[b.status] ?? BAA_TAG.PENDING;
                return (
                  <tr key={b.id}>
                    <td><strong>{b.vendor}</strong></td>
                    <td>{b.service}</td>
                    <td>
                      <Row gap="8" wrap>
                        <Tag variant={t.variant} label={t.label} />
                        {b.renewalSoon && b.status === "ACTIVE" && <Tag variant="warning" label="Renew soon" />}
                      </Row>
                    </td>
                    <td>{b.signedDate ? formatDate(b.signedDate) : "—"}</td>
                    <td>{b.renewalDate ? formatDate(b.renewalDate) : "—"}</td>
                    <td className="cell-notes">{b.notes ?? ""}</td>
                    <td>
                      <details className="action-panel inline-panel">
                        <summary><Text variant="label-strong-s">Edit</Text></summary>
                        <ComplianceForm action={complianceAction} intent="baa" submitLabel="Save" hidden={{ id: b.id }}>
                          <BaaFields prefix={`baa-${b.id}`} initial={{ vendor: b.vendor, service: b.service, status: b.status, signedDate: isoDay(b.signedDate), renewalDate: isoDay(b.renewalDate), notes: b.notes }} />
                        </ComplianceForm>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <details className="action-panel">
          <summary><Text variant="label-strong-m">Add a vendor</Text></summary>
          <ComplianceForm action={complianceAction} intent="baa" submitLabel="Add vendor">
            <BaaFields prefix="baa-new" />
          </ComplianceForm>
        </details>
      </Column>

      <div className="viz-grid-2">
        <Column gap="12">
          <Heading as="h2" variant="heading-strong-l">Backup restore drills</Heading>
          <Text variant="body-default-s" onBackground="neutral-medium">Restore a snapshot into a non-production database each quarter and record the result.</Text>
          {o.backups.length === 0 ? (
            <Text variant="body-default-s" onBackground="neutral-weak">No drills recorded.</Text>
          ) : (
            <ul className="evidence-list">
              {o.backups.slice(0, 6).map((b) => (
                <li key={b.id}>
                  <Row gap="8" vertical="center" wrap>
                    <Tag variant={b.result === "PASSED" ? "success" : "danger"} label={b.result === "PASSED" ? "Passed" : "Failed"} />
                    <Text variant="label-strong-s">{b.restoreTestedAt ? formatDateTime(b.restoreTestedAt) : "—"}</Text>
                  </Row>
                  <Text variant="body-default-xs" onBackground="neutral-weak">
                    {b.vendor} snapshot {b.snapshotAt ? formatDateTime(b.snapshotAt) : ""} → {b.restoredTo}
                    {b.durationMinutes ? ` · ${b.durationMinutes} min` : ""}
                    {b.notes ? ` · ${b.notes}` : ""}
                  </Text>
                </li>
              ))}
            </ul>
          )}
          <details className="action-panel">
            <summary><Text variant="label-strong-m">Record a drill</Text></summary>
            <ComplianceForm action={complianceAction} intent="drill" submitLabel="Record drill">
              <DrillFields />
            </ComplianceForm>
          </details>
        </Column>

        <Column gap="12">
          <Heading as="h2" variant="heading-strong-l">Incidents and risk assessments</Heading>
          <Text variant="body-default-s" onBackground="neutral-medium">Log security incidents and risk-assessment work. Refer to clients by MRN, never by name.</Text>
          {o.log.length === 0 ? (
            <Text variant="body-default-s" onBackground="neutral-weak">Nothing logged.</Text>
          ) : (
            <ul className="evidence-list">
              {o.log.slice(0, 8).map((l) => (
                <li key={l.id}>
                  <Row gap="8" vertical="center" wrap>
                    <Tag variant={l.kind === "INCIDENT" ? "danger" : "info"} label={l.kind === "INCIDENT" ? "Incident" : "Risk assessment"} />
                    <Text variant="label-strong-s">{formatDateTime(l.at)}</Text>
                  </Row>
                  <Text variant="body-default-s" style={{ whiteSpace: "pre-wrap" }}>{l.notes}</Text>
                </li>
              ))}
            </ul>
          )}
          <details className="action-panel">
            <summary><Text variant="label-strong-m">Add an entry</Text></summary>
            <ComplianceForm action={complianceAction} intent="log" submitLabel="Add entry">
              <NotesField id="log-notes" label="What happened or what was assessed" kinds={[{ value: "INCIDENT", label: "Security incident" }, { value: "RISK_ASSESSMENT", label: "Risk assessment" }]} />
            </ComplianceForm>
          </details>
        </Column>
      </div>

      <Column gap="12">
        <Row horizontal="between" vertical="center" gap="12" wrap>
          <Heading as="h2" variant="heading-strong-l">Access review</Heading>
          <a className="export-link" href="/dashboard/compliance/access-review">Export staff list (CSV)</a>
        </Row>
        <Text variant="body-default-s" onBackground="neutral-medium">
          Each quarter, confirm every staff account still needs its role, then sign off below. Change roles or deactivate accounts on the Users page.
        </Text>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Two-step</th>
                <th scope="col">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {o.staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}<br /><Text variant="body-default-xs" onBackground="neutral-weak">{s.email}</Text></td>
                  <td>{ROLE[s.role] ?? s.role}</td>
                  <td>{s.status.toLowerCase()}</td>
                  <td>{s.twoFactorEnabled ? "✓ On" : "✕ Not set up"}</td>
                  <td>{s.lastLoginAt ? formatDateTime(s.lastLoginAt) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {o.reviews.length > 0 && (
          <Text variant="body-default-xs" onBackground="neutral-weak">Past reviews: {o.reviews.slice(0, 4).map((r) => formatDate(r.at)).join(", ")}</Text>
        )}
        <details className="action-panel">
          <summary><Text variant="label-strong-m">Sign off this quarter&apos;s review</Text></summary>
          <ComplianceForm action={complianceAction} intent="review" submitLabel="Sign review">
            <NotesField id="review-notes" label="What you reviewed and any changes made" />
          </ComplianceForm>
        </details>
      </Column>
    </Column>
  );
}

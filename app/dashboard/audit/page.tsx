import { Button, Column, Feedback, Heading, Input, Row, Tag, Text } from "@once-ui-system/core";
import { recordAudit, verifyAuditChain } from "@/lib/audit";
import { buildAuditFilter, findAuditRows, parseAuditFilters } from "@/lib/audit-query";
import { authorize } from "@/lib/authz";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { formatDateTime } from "@/lib/time";
import { AUDIT_ACTIONS } from "@/models";

export const metadata = { title: "Audit trail" };

const PAGE_SIZE = 100;
const OUTCOME_TONE = { SUCCESS: "neutral", DENIED: "danger", ERROR: "warning" } as const;

export default async function AuditTrailPage({ searchParams }: PageProps<"/dashboard/audit">) {
  const ctx = await requireSession({ roles: ["SUPER_ADMIN"] });
  await connectToDatabase();
  await authorize(ctx, "auditLog", "read");

  const params = await searchParams;
  const filters = parseAuditFilters(params);
  const filter = await buildAuditFilter(filters);
  const [rows, chain] = await Promise.all([filter ? findAuditRows(filter, PAGE_SIZE) : [], verifyAuditChain()]);

  // Viewing the audit trail is itself audited.
  await recordAudit(ctx, { action: "VIEW", resourceType: "AuditLog", metadata: { filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) } });

  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <Column gap="24">
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">
          Audit trail
        </Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          Every view, change, signature, export, sign-in, and blocked access attempt involving protected health information.
        </Text>
      </Column>

      <Feedback
        variant={chain.ok ? "success" : "danger"}
        title={chain.ok ? "Integrity verified" : "Integrity problem detected"}
        description={
          chain.ok
            ? `All ${chain.checked.toLocaleString()} entries are intact and in order.`
            : `The chain breaks at entry #${chain.brokenAtSeq} (${chain.problem}). Entries may have been altered or removed outside the application.`
        }
      />

      <form method="get" className="fill-width">
        <Column gap="12" padding="20" radius="l" border="neutral-alpha-weak" background="surface">
          <Row gap="12" wrap s={{ direction: "column" }}>
            <Input id="mrn" name="mrn" label="Client MRN" placeholder="ABW-2026-0001" defaultValue={filters.mrn} />
            <Input id="actor" name="actor" label="Staff or client email" defaultValue={filters.actor} />
          </Row>
          <Row gap="12" wrap s={{ direction: "column" }}>
            <label className="native-field">
              <span>Action</span>
              <select name="action" defaultValue={filters.action ?? ""}>
                <option value="">Any action</option>
                {AUDIT_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a.replaceAll("_", " ").toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="native-field">
              <span>Outcome</span>
              <select name="outcome" defaultValue={filters.outcome ?? ""}>
                <option value="">Any outcome</option>
                <option value="SUCCESS">Success</option>
                <option value="DENIED">Denied</option>
                <option value="ERROR">Error</option>
              </select>
            </label>
            <label className="native-field">
              <span>From</span>
              <input type="date" name="from" defaultValue={filters.from} />
            </label>
            <label className="native-field">
              <span>To</span>
              <input type="date" name="to" defaultValue={filters.to} />
            </label>
          </Row>
          <Row gap="8">
            <Button type="submit" variant="primary" size="s" label="Apply filters" />
            <Button href="/dashboard/audit" variant="tertiary" size="s" label="Clear" />
          </Row>
        </Column>
      </form>

      <form method="get" action="/dashboard/audit/export" className="fill-width">
        {Object.entries(filters)
          .filter(([, v]) => v)
          .map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        <Row gap="12" vertical="end" wrap s={{ direction: "column" }}>
          <Input id="reason" name="reason" label="Reason for export (required)" placeholder="e.g. Accounting of disclosures request" required minLength={5} />
          <Button type="submit" variant="secondary" size="m" label="Export CSV" prefixIcon="download" />
        </Row>
      </form>

      <Text variant="label-default-s" onBackground="neutral-weak">
        {filter === null
          ? "No client or user matches that filter."
          : `Showing the latest ${rows.length.toLocaleString()} matching entries${rows.length === PAGE_SIZE ? ` (narrow the filters to see older ones)` : ""}.`}
        {query && " Filters applied."}
      </Text>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">When (ET)</th>
              <th scope="col">Action</th>
              <th scope="col">Actor</th>
              <th scope="col">Resource</th>
              <th scope="col">Client</th>
              <th scope="col">IP</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.seq}>
                <td>{row.seq}</td>
                <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(row.timestamp)}</td>
                <td>
                  <Row gap="4" vertical="center" wrap>
                    <Text variant="label-default-s">{row.action.replaceAll("_", " ").toLowerCase()}</Text>
                    {row.outcome !== "SUCCESS" && <Tag size="s" variant={OUTCOME_TONE[row.outcome as keyof typeof OUTCOME_TONE]} label={row.outcome.toLowerCase()} />}
                  </Row>
                </td>
                <td>
                  {row.actor}
                  <br />
                  <Text variant="label-default-xs" onBackground="neutral-weak">
                    {row.actorRole}
                  </Text>
                </td>
                <td>{row.resource}</td>
                <td className="notranslate">{row.patientMrn}</td>
                <td>{row.ipAddress}</td>
                <td>
                  <Text variant="body-default-xs" onBackground="neutral-medium">
                    {row.details}
                  </Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Column>
  );
}

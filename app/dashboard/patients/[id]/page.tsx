import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Button, Column, Feedback, Grid, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import {
  AddAllergyForm,
  AddDiagnosisForm,
  AddMedicationForm,
  DiscontinueMedicationButton,
  ResolveDiagnosisButton,
} from "@/components/chart/clinical-forms";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { can, STAFF_ROLES } from "@/lib/rbac";
import { getChart, type Chart } from "@/lib/services/patients";
import { ageOn, formatDate, formatDateTime, formatMoney } from "@/lib/time";

export const metadata = { title: "Client chart" };

const TABS = [
  { key: "overview", label: "Overview", show: () => true },
  { key: "notes", label: "Notes", show: (c: Chart) => c.notes !== null },
  { key: "problems", label: "Problems & medications", show: (c: Chart) => c.diagnoses !== null || c.medications !== null },
  { key: "visits", label: "Visits", show: (c: Chart) => c.appointments !== null },
  { key: "billing", label: "Billing", show: (c: Chart) => c.claims !== null || c.invoices !== null },
  { key: "records", label: "Consents & documents", show: (c: Chart) => c.consents !== null || c.documents !== null },
] as const;

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Column gap="12" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
      <Row horizontal="between" vertical="center" gap="8">
        <Heading as="h2" variant="heading-strong-m">
          {title}
        </Heading>
        {action}
      </Row>
      {children}
    </Column>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <Text variant="body-default-s" onBackground="neutral-weak">
    {children}
  </Text>
);
const pretty = (value: string) => value.replaceAll("_", " ").toLowerCase();
/** Mongoose timestamps exist at runtime but aren't in the inferred lean types. */
const created = (doc: unknown) => (doc as { createdAt: Date }).createdAt;

export default async function ChartPage({ params, searchParams }: PageProps<"/dashboard/patients/[id]">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const { id } = await params;
  const chart = await orForbidden(getChart(ctx, id));
  if (!chart) notFound();
  const query = await searchParams;
  const tabs = TABS.filter((t) => t.show(chart));
  const tab = tabs.find((t) => t.key === query.tab)?.key ?? "overview";
  const p = chart.patient;
  const canNote = can(ctx.role, "clinicalNote", "create");
  const canClinical = can(ctx.role, "diagnosis", "create");

  return (
    <Column gap="24">
      <Column gap="8">
        <SmartLink href="/dashboard/patients">← Clients</SmartLink>
        <Row gap="12" vertical="center" wrap horizontal="between">
          <Column gap="4">
            <Heading as="h1" variant="display-strong-xs">
              {p.preferredName ?? p.firstName} {p.lastName}
              {p.pronouns && (
                <Text as="span" variant="body-default-m" onBackground="neutral-weak">
                  {" "}
                  ({p.pronouns})
                </Text>
              )}
            </Heading>
            <Text variant="body-default-s" onBackground="neutral-medium" className="notranslate">
              {p.mrn} · {formatDate(p.dob)} ({ageOn(p.dob)} y) · {p.assignedProvider ?? "No provider assigned"}
              {p.preferredLanguage && p.preferredLanguage !== "en" ? ` · Prefers ${p.preferredLanguage === "es" ? "Spanish" : p.preferredLanguage}` : ""}
            </Text>
          </Column>
          {canNote && tab === "notes" && <Button href={`/dashboard/patients/${id}/notes/new`} variant="primary" size="s" label="New note" prefixIcon="plus" />}
        </Row>
        {chart.allergies && chart.allergies.length > 0 && (
          <Feedback variant="warning" title="Allergies" description={chart.allergies.map((a) => `${a.allergen}${a.reaction ? ` (${a.reaction})` : ""}`).join(" · ")} />
        )}
      </Column>

      <nav aria-label="Chart sections" className="chart-tabs">
        {tabs.map((t) => (
          <Link key={t.key} href={`?tab=${t.key}`} aria-current={t.key === tab ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <Grid columns="2" gap="16" m={{ columns: 1 }}>
          <Card title="Contact">
            <dl className="fact-list">
              <div><dt>Phone</dt><dd>{p.phone ?? "—"}</dd></div>
              <div><dt>Email</dt><dd>{p.email ?? "—"}</dd></div>
              <div><dt>Address</dt><dd>{p.address ? [p.address.street, p.address.street2, `${p.address.city ?? ""}, ${p.address.state ?? ""} ${p.address.zip ?? ""}`].filter(Boolean).join(", ") : "—"}</dd></div>
              <div><dt>SSN</dt><dd>{p.ssnLast4 ? `•••-••-${p.ssnLast4}` : "Not on file"}</dd></div>
            </dl>
          </Card>
          <Card title="Emergency contacts">
            {p.emergencyContacts.length === 0 ? <Empty>None on file.</Empty> : p.emergencyContacts.map((c) => (
              <Text key={String(c._id)} variant="body-default-s">
                {c.name} ({c.relationship}) · {c.phone}
                {c.isNextOfKin ? " · next of kin" : ""}
              </Text>
            ))}
          </Card>
          {chart.insurance && (
            <Card title="Insurance">
              {chart.insurance.length === 0 ? <Empty>Self-pay (no active policy).</Empty> : chart.insurance.map((i) => (
                <Column key={String(i._id)} gap="4">
                  <Text variant="label-strong-m">{i.payerName} · {i.planName} ({pretty(i.priority)})</Text>
                  <Text variant="body-default-s" onBackground="neutral-medium" className="notranslate">
                    Member ID ••••{i.memberIdLast4} · Group {i.groupNumber} · Copay {formatMoney(i.copayCents ?? 0)} · Deductible {formatMoney(i.deductibleMetCents ?? 0)} of {formatMoney(i.deductibleTotalCents ?? 0)} met
                  </Text>
                  <Text variant="body-default-xs" onBackground={i.eligibility?.status === "VERIFIED" ? "success-medium" : "warning-medium"}>
                    Eligibility: {pretty(i.eligibility?.status ?? "UNVERIFIED")}
                    {i.eligibility?.verifiedAt ? ` on ${formatDateTime(i.eligibility.verifiedAt)}` : ""}
                  </Text>
                </Column>
              ))}
            </Card>
          )}
          {chart.assessments && (
            <Card title="Assessments">
              {chart.assessments.filter((a) => a.type !== "INTAKE_HISTORY").length === 0 ? <Empty>None yet.</Empty> : chart.assessments.filter((a) => a.type !== "INTAKE_HISTORY").map((a) => (
                <Text key={String(a._id)} variant="body-default-s">
                  {a.type === "PHQ9" ? "PHQ-9" : a.type === "GAD7" ? "GAD-7" : pretty(a.type)}: <strong>{a.score}</strong> ({pretty(a.severity ?? "")}) · {formatDate(a.completedAt)}
                </Text>
              ))}
            </Card>
          )}
        </Grid>
      )}

      {tab === "notes" && chart.notes && (
        <Card title="Clinical notes">
          {chart.notes.length === 0 ? <Empty>No notes yet.</Empty> : (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th scope="col">Date (ET)</th><th scope="col">Type</th><th scope="col">Author</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {chart.notes.map((n) => (
                    <tr key={String(n._id)}>
                      <td><Link className="table-link" href={`/dashboard/patients/${id}/notes/${n._id}`}>{formatDateTime(created(n))}</Link></td>
                      <td>{n.noteType}</td>
                      <td>{n.provider}</td>
                      <td>
                        <Tag size="s" variant={n.status === "SIGNED_LOCKED" ? "success" : "warning"} label={n.status === "SIGNED_LOCKED" ? "Signed" : "Draft"} />
                        {n.addenda?.length ? <Text as="span" variant="label-default-xs" onBackground="neutral-weak"> +{n.addenda.length} addenda</Text> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {chart.psychNotes && chart.psychNotes.length > 0 && (
            <Column gap="8" paddingTop="12">
              <Text variant="label-strong-s" onBackground="accent-medium">Psychotherapy notes (visible only to the author)</Text>
              {chart.psychNotes.map((n) => (
                <Link key={String(n._id)} className="table-link" href={`/dashboard/patients/${id}/notes/${n._id}`}>
                  {formatDateTime(created(n))} · {n.status === "SIGNED_LOCKED" ? "Signed" : "Draft"}
                </Link>
              ))}
            </Column>
          )}
        </Card>
      )}

      {tab === "problems" && (
        <Grid columns="1" gap="16">
          {chart.diagnoses && (
            <Card title="Problem list">
              {chart.diagnoses.length === 0 ? <Empty>No diagnoses.</Empty> : chart.diagnoses.map((d) => (
                <Row key={String(d._id)} gap="12" vertical="center" horizontal="between" wrap>
                  <Text variant="body-default-s" onBackground={d.status === "ACTIVE" ? "neutral-strong" : "neutral-weak"}>
                    <span className="notranslate"><strong>{d.icd10Code}</strong></span> {d.description}
                    {d.isPrimary ? " · primary" : ""} · {pretty(d.status)}
                  </Text>
                  {canClinical && d.status === "ACTIVE" && <ResolveDiagnosisButton patientId={id} id={String(d._id)} />}
                </Row>
              ))}
              {canClinical && <AddDiagnosisForm patientId={id} />}
            </Card>
          )}
          {chart.medications && (
            <Card title="Medications">
              {chart.medications.length === 0 ? <Empty>None recorded.</Empty> : chart.medications.map((m) => (
                <Row key={String(m._id)} gap="12" vertical="center" horizontal="between" wrap>
                  <Text variant="body-default-s" onBackground={m.status === "ACTIVE" ? "neutral-strong" : "neutral-weak"}>
                    <strong>{m.name}</strong> {[m.dosage, m.frequency].filter(Boolean).join(", ")} · {pretty(m.status)} · reported by {pretty(m.reportedBy)}
                  </Text>
                  {can(ctx.role, "medication", "update") && m.status === "ACTIVE" && <DiscontinueMedicationButton patientId={id} id={String(m._id)} />}
                </Row>
              ))}
              {can(ctx.role, "medication", "create") && <AddMedicationForm patientId={id} />}
            </Card>
          )}
          {can(ctx.role, "allergy", "create") && (
            <Card title="Add an allergy">
              <AddAllergyForm patientId={id} />
            </Card>
          )}
        </Grid>
      )}

      {tab === "visits" && chart.appointments && (
        <Card title="Visits">
          {chart.appointments.length === 0 ? <Empty>No visits.</Empty> : chart.appointments.map((a) => (
            <Text key={String(a._id)} variant="body-default-s">
              {formatDateTime(a.scheduledStart)} · {a.mode === "VIRTUAL" ? "Video" : "In person"} · {a.visitType} · {a.provider} · <strong>{pretty(a.status)}</strong>
            </Text>
          ))}
        </Card>
      )}

      {tab === "billing" && (
        <Grid columns="2" gap="16" m={{ columns: 1 }}>
          {chart.claims && (
            <Card title="Claims">
              {chart.claims.length === 0 ? <Empty>No claims.</Empty> : chart.claims.map((c) => (
                <Text key={String(c._id)} variant="body-default-s" className="notranslate">
                  {can(ctx.role, "claim", "update") ? <Link className="table-link" href={`/dashboard/billing/claims/${c._id}`}>{c.claimNumber}</Link> : c.claimNumber} · {pretty(c.status)} · billed {formatMoney(c.totalBilledCents ?? 0)}
                  {c.denial?.carc ? ` · ${c.denial.carc}` : ""}
                </Text>
              ))}
            </Card>
          )}
          {chart.invoices && (
            <Card title="Invoices">
              {chart.invoices.length === 0 ? <Empty>No invoices.</Empty> : chart.invoices.map((i) => (
                <Text key={String(i._id)} variant="body-default-s" className="notranslate">
                  {i.invoiceNumber} · {pretty(i.kind)} · {formatMoney(i.amountDueCents - (i.amountPaidCents ?? 0))} due · {pretty(i.status)}
                </Text>
              ))}
            </Card>
          )}
        </Grid>
      )}

      {tab === "records" && (
        <Grid columns="2" gap="16" m={{ columns: 1 }}>
          {chart.consents && (
            <Card title="Signed consents">
              {chart.consents.length === 0 ? <Empty>None signed.</Empty> : chart.consents.map((c) => (
                <Text key={String(c._id)} variant="body-default-s">
                  {pretty(c.consentType)} ({c.version}) · signed {formatDate(c.signature.signedAt)}
                  {c.revokedAt ? " · revoked" : c.expiresAt && c.expiresAt < new Date() ? " · expired" : ""}
                </Text>
              ))}
            </Card>
          )}
          {chart.documents && (
            <Card title="Documents">
              {chart.documents.length === 0 ? <Empty>None uploaded.</Empty> : chart.documents.map((d) => (
                <Text key={String(d._id)} variant="body-default-s">
                  {pretty(d.category)} · {formatDate(created(d))} · uploaded by {pretty(d.uploadedByRole)}
                </Text>
              ))}
              <Text variant="body-default-xs" onBackground="neutral-weak">Secure preview and download arrive with the document vault (Phase 4).</Text>
            </Card>
          )}
        </Grid>
      )}
    </Column>
  );
}

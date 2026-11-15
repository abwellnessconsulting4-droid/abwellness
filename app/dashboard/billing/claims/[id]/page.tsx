import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Column, Feedback, Grid, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { claimAction } from "@/app/dashboard/billing/actions";
import { RemittancePanel, ResubmitPanel, ReviewPanel, SubmitPanel, type EditableLine } from "@/components/billing/claim-actions";
import { CLAIM_STATUS_TAG, INVOICE_STATUS_TAG } from "@/components/billing/status";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { can, STAFF_ROLES } from "@/lib/rbac";
import { getClaim, RcmError } from "@/lib/services/rcm";
import { DEFAULT_TZ } from "@/lib/services/scheduling";
import { timeBasedCodeWarning } from "@/lib/telehealth";
import { formatDate, formatDateTime, formatMoney } from "@/lib/time";

export const metadata = { title: "Claim" };

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Column gap="12" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
      <Heading as="h2" variant="heading-strong-m">{title}</Heading>
      {children}
    </Column>
  );
}

const DONE: Record<string, string> = {
  "mark-ready": "Claim checks passed. It's ready to submit.",
  "to-draft": "Returned to draft.",
  submit: "Submitted to the clearinghouse.",
  resubmit: "Corrected claim resubmitted.",
  "post-denial": "Denial posted. The claim is in the denials queue.",
  "post-payment": "Payment posted.",
};

export default async function ClaimPage({ params, searchParams }: PageProps<"/dashboard/billing/claims/[id]">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const { id } = await params;
  const { done } = await searchParams;
  const claim = await orForbidden(
    getClaim(ctx, id).catch((error) => {
      if (error instanceof RcmError) notFound();
      throw error;
    }),
  );
  const canWork = can(ctx.role, "claim", "update");
  const action = claimAction.bind(null, id);
  const lines: EditableLine[] = claim.lines.map((l) => ({ id: l.id, cptCode: l.cptCode, modifiers: l.modifiers, icdPointers: l.icdPointers, placeOfService: l.placeOfService, totalCents: l.totalCents }));
  const tag = CLAIM_STATUS_TAG[claim.status];
  const adjudicated = claim.status === "PAID" || claim.status === "PARTIAL";
  const doneMessage =
    typeof done === "string" && DONE[done]
      ? done === "post-payment" && claim.patientResponsibilityCents > 0
        ? `Payment posted. A ${formatMoney(claim.patientResponsibilityCents)} invoice was created and published to the client's portal.`
        : DONE[done]
      : null;
  const timeWarnings = claim.lines.map((l) => timeBasedCodeWarning(l.cptCode, claim.sessionMinutes)).filter((w): w is string => Boolean(w));

  return (
    <Column gap="24" fillWidth>
      <Column gap="8">
        <SmartLink href="/dashboard/billing">← Claims</SmartLink>
        <Row gap="12" vertical="center" wrap>
          <Heading as="h1" variant="display-strong-xs" className="notranslate">{claim.claimNumber}</Heading>
          <Tag variant={tag.variant} label={tag.label} />
          {claim.resubmissionCount > 0 && <Tag variant="neutral" label={`Resubmitted ×${claim.resubmissionCount}`} />}
        </Row>
        <Text variant="body-default-s" onBackground="neutral-medium">
          {claim.patient?.name} · {claim.payerName} · billed {formatMoney(claim.totalBilledCents)}
          {claim.clearinghouseReference ? ` · clearinghouse ref ${claim.clearinghouseReference}` : ""}
        </Text>
      </Column>

      {doneMessage && <Feedback variant="success" description={doneMessage} />}
      {claim.denial && ["DENIED", "REJECTED"].includes(claim.status) && (
        <Feedback variant="danger" title={`Denied: ${claim.denial.carc}${claim.denial.rarc.length ? ` (${claim.denial.rarc.join(", ")})` : ""}`} description={claim.denial.description} />
      )}
      {timeWarnings.map((w) => (
        <Feedback key={w} variant="warning" title="Session length doesn't match the code" description={w} />
      ))}

      <Grid columns="3" gap="16" m={{ columns: 1 }}>
        <Card title="Client">
          <dl className="fact-list">
            <div><dt>Name</dt><dd>{claim.patient?.name}</dd></div>
            <div><dt>MRN</dt><dd className="notranslate">{claim.patient?.mrn}</dd></div>
            <div><dt>Date of birth</dt><dd>{claim.patient ? formatDate(claim.patient.dob) : "—"}</dd></div>
          </dl>
        </Card>
        <Card title="Coverage">
          {claim.policy ? (
            <dl className="fact-list">
              <div><dt>Plan</dt><dd>{claim.payerName}{claim.policy.planName ? ` · ${claim.policy.planName}` : ""}</dd></div>
              <div><dt>Member ID</dt><dd className="notranslate">••••{claim.policy.memberIdLast4}</dd></div>
              <div><dt>Copay</dt><dd>{formatMoney(claim.policy.copayCents)}</dd></div>
              <div><dt>Deductible</dt><dd>{formatMoney(claim.policy.deductibleMetCents)} of {formatMoney(claim.policy.deductibleTotalCents)} met</dd></div>
              <div><dt>Coinsurance</dt><dd>{claim.policy.coinsurancePercent}%</dd></div>
              <div><dt>Eligibility</dt><dd>{claim.policy.eligibility.toLowerCase()}</dd></div>
            </dl>
          ) : (
            <Text variant="body-default-s" onBackground="neutral-weak">No policy attached.</Text>
          )}
        </Card>
        <Card title="Adjudication">
          <dl className="fact-list">
            <div><dt>Billed</dt><dd>{formatMoney(claim.totalBilledCents)}</dd></div>
            <div><dt>Insurance paid</dt><dd>{adjudicated ? formatMoney(claim.insurancePaidCents) : "—"}</dd></div>
            <div><dt>Contractual adj.</dt><dd>{adjudicated ? formatMoney(claim.contractualAdjustmentCents) : "—"}</dd></div>
            <div><dt>Client owes</dt><dd>{adjudicated ? formatMoney(claim.patientResponsibilityCents) : "—"}</dd></div>
          </dl>
        </Card>
      </Grid>

      <Card title="Service lines">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">CPT</th>
                <th scope="col">Modifiers</th>
                <th scope="col">Units</th>
                <th scope="col">Diagnoses</th>
                <th scope="col">POS</th>
                <th scope="col" className="num">Charge</th>
                <th scope="col" className="num">Allowed</th>
                <th scope="col" className="num">Paid</th>
              </tr>
            </thead>
            <tbody>
              {claim.lines.map((l) => (
                <tr key={l.id} className="notranslate">
                  <td>{formatDate(l.serviceDate, DEFAULT_TZ)}</td>
                  <td>{l.cptCode}</td>
                  <td>{l.modifiers.join(" ") || "—"}</td>
                  <td>{l.units}</td>
                  <td>{l.icdPointers.join(", ")}</td>
                  <td>{l.placeOfService}</td>
                  <td className="num">{formatMoney(l.totalCents)}</td>
                  <td className="num">{adjudicated && l.allowedCents != null ? formatMoney(l.allowedCents) : "—"}</td>
                  <td className="num">{adjudicated && l.paidCents != null ? formatMoney(l.paidCents) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {claim.sessionMinutes != null && <Text variant="body-default-xs" onBackground="neutral-weak">Recorded session length: {claim.sessionMinutes} {claim.sessionMinutes === 1 ? "minute" : "minutes"}.</Text>}
      </Card>

      {canWork && claim.status === "DRAFT" && (
        <Card title="Review">
          <ReviewPanel action={action} lines={lines} />
        </Card>
      )}
      {canWork && claim.status === "READY_TO_SUBMIT" && (
        <Card title="Submit">
          <Text variant="body-default-s" onBackground="neutral-medium">This claim passed the checks. Submitting sends it to the payer through the clearinghouse.</Text>
          <SubmitPanel action={action} />
        </Card>
      )}
      {canWork && ["SUBMITTED", "ACCEPTED"].includes(claim.status) && (
        <Card title="Payer response">
          <RemittancePanel action={action} lines={lines} />
        </Card>
      )}
      {canWork && ["DENIED", "REJECTED"].includes(claim.status) && (
        <Card title="Correct and resubmit">
          <Text variant="body-default-s" onBackground="neutral-medium">Fix what the payer flagged, explain the correction, and resubmit. It goes out as a corrected claim (frequency code 7).</Text>
          <ResubmitPanel action={action} lines={lines} />
        </Card>
      )}

      <Grid columns="2" gap="16" m={{ columns: 1 }}>
        <Card title="History">
          <ol className="timeline">
            {claim.history.map((h, i) => (
              <li key={i}>
                <Text variant="label-strong-s">{CLAIM_STATUS_TAG[h.status as keyof typeof CLAIM_STATUS_TAG]?.label ?? h.status}</Text>
                <Text variant="body-default-xs" onBackground="neutral-weak">{formatDateTime(h.at)}</Text>
                {h.note && <Text variant="body-default-s">{h.note}</Text>}
              </li>
            ))}
          </ol>
          {claim.appealNotes.length > 0 && (
            <Column gap="8">
              <Text variant="label-strong-s">Correction and appeal notes</Text>
              {claim.appealNotes.map((n, i) => (
                <Text key={i} variant="body-default-s">
                  {formatDateTime(n.at)}: {n.text}
                </Text>
              ))}
            </Column>
          )}
        </Card>
        <Card title="Remittances and invoices">
          {claim.remittances.length === 0 && claim.invoices.length === 0 && <Text variant="body-default-s" onBackground="neutral-weak">Nothing posted yet.</Text>}
          {claim.remittances.map((r) => (
            <Column key={r.id} gap="4" padding="12" radius="m" border="neutral-alpha-weak">
              <Text variant="label-strong-s" className="notranslate">{r.kind} {r.eraReference}</Text>
              {r.denial ? (
                <Text variant="body-default-s" onBackground="danger-medium">{r.denial}</Text>
              ) : (
                <Text variant="body-default-s">
                  Paid {formatMoney(r.totalPaidCents)} · contractual {formatMoney(r.totalContractualCents)} · copay {formatMoney(r.patientResponsibility.copayCents)} · deductible {formatMoney(r.patientResponsibility.deductibleCents)}
                  {r.patientResponsibility.coinsuranceCents ? ` · coinsurance ${formatMoney(r.patientResponsibility.coinsuranceCents)}` : ""}
                </Text>
              )}
              {r.postedAt && <Text variant="body-default-xs" onBackground="neutral-weak">Posted {formatDateTime(r.postedAt)}</Text>}
            </Column>
          ))}
          {claim.invoices.map((inv) => {
            const t = INVOICE_STATUS_TAG[inv.status] ?? INVOICE_STATUS_TAG.UNPAID;
            return (
              <Column key={inv.id} gap="4" padding="12" radius="m" border="neutral-alpha-weak">
                <Row gap="8" vertical="center" wrap>
                  <Text variant="label-strong-s" className="notranslate">Invoice {inv.invoiceNumber}</Text>
                  <Tag variant={t.variant} label={t.label} />
                  {inv.publishedToPortal && <Text variant="label-default-s" onBackground="neutral-weak">on client portal</Text>}
                </Row>
                {inv.lineItems.map((li, i) => (
                  <Text key={i} variant="body-default-s">{li.description}: {formatMoney(li.amountCents)}</Text>
                ))}
                <Text variant="body-default-s">Total {formatMoney(inv.amountDueCents)}</Text>
              </Column>
            );
          })}
        </Card>
      </Grid>
    </Column>
  );
}

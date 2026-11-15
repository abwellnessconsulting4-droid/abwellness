import { Column, Grid, Heading, Icon, Row, SmartLink, Text } from "@once-ui-system/core";
import { reviewSafetyAction } from "@/app/dashboard/safety-actions";
import { openSafetyFlags } from "@/lib/services/assessments";
import { verifyAuditChain } from "@/lib/audit";
import { authzToken, withScope, type AuthContext } from "@/lib/authz";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { can, type Resource } from "@/lib/rbac";
import { dayRange, formatDateTime, formatMoney } from "@/lib/time";
import type { IconName } from "@/resources/icons";
import { Appointment, Claim, ClinicalNote, InsurancePolicy, Invoice, Patient, WaitlistEntry } from "@/models";

export const metadata = { title: "Overview" };

interface Stat {
  label: string;
  value: string;
  hint: string;
  icon: IconName;
  tone?: "attention";
}

const ACTIVE = ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_SESSION", "COMPLETED"];

async function count(ctx: AuthContext, resource: Resource, model: { countDocuments: (f: object) => { setOptions: (o: object) => Promise<number> } }, filter: object) {
  return model.countDocuments(await withScope(ctx, resource, filter as Record<string, unknown>)).setOptions({ authz: authzToken(ctx) });
}

async function statsFor(ctx: AuthContext): Promise<Stat[]> {
  const stats: Stat[] = [];
  const today = dayRange();
  const add = (stat: Stat) => stats.push(stat);

  if (can(ctx.role, "appointment", "read")) {
    const n = await count(ctx, "appointment", Appointment, { scheduledStart: { $gte: today.start, $lt: today.end }, status: { $in: ACTIVE } });
    add({ label: "Appointments today", value: String(n), hint: ctx.role === "PROVIDER" ? "Your schedule" : "All providers", icon: "calendar" });
  }
  if (ctx.role === "PROVIDER" && ctx.staffProfileId) {
    const n = await count(ctx, "clinicalNote", ClinicalNote, { providerId: ctx.staffProfileId, status: { $ne: "SIGNED_LOCKED" } });
    add({ label: "Notes to sign", value: String(n), hint: "Drafts awaiting your signature", icon: "checkCircle", tone: n > 0 ? "attention" : undefined });
  }
  if (ctx.role === "SUPER_ADMIN") {
    const n = await count(ctx, "clinicalNote", ClinicalNote, { status: { $ne: "SIGNED_LOCKED" }, createdAt: { $lt: new Date(Date.now() - 48 * 3_600_000) } });
    add({ label: "Notes unsigned > 48 h", value: String(n), hint: "Documentation compliance", icon: "checkCircle", tone: n > 0 ? "attention" : undefined });
  }
  if (can(ctx.role, "patient", "read") && ctx.role !== "BILLING_STAFF") {
    const n = await count(ctx, "patient", Patient, { status: "ACTIVE" });
    add({ label: ctx.role === "PROVIDER" ? "My active clients" : "Active clients", value: String(n), hint: "Status: active", icon: "users" });
  }
  if (can(ctx.role, "waitlist", "read") && ctx.role !== "PROVIDER") {
    const n = await count(ctx, "waitlist", WaitlistEntry, { status: "WAITING" });
    add({ label: "On the waitlist", value: String(n), hint: "Waiting for an opening", icon: "clock" });
  }
  if (can(ctx.role, "insurance", "update")) {
    const n = await count(ctx, "insurance", InsurancePolicy, { active: true, "eligibility.status": { $ne: "VERIFIED" } });
    add({ label: "Eligibility to verify", value: String(n), hint: "Active policies not yet verified", icon: "shield", tone: n > 0 ? "attention" : undefined });
  }
  if (can(ctx.role, "claim", "update")) {
    const [ready, denied] = await Promise.all([
      count(ctx, "claim", Claim, { status: "READY_TO_SUBMIT" }),
      count(ctx, "claim", Claim, { status: { $in: ["DENIED", "REJECTED"] } }),
    ]);
    add({ label: "Claims ready to submit", value: String(ready), hint: "Reviewed drafts", icon: "send" });
    add({ label: "Denials to work", value: String(denied), hint: "Denied or rejected claims", icon: "lifebuoy", tone: denied > 0 ? "attention" : undefined });
  }
  if (can(ctx.role, "invoice", "read") && ctx.role !== "PROVIDER") {
    const [row] = await Invoice.aggregate<{ total: number }>([
      { $match: await withScope(ctx, "invoice", { status: { $in: ["UNPAID", "PARTIAL"] } }) },
      { $group: { _id: null, total: { $sum: { $subtract: ["$amountDueCents", "$amountPaidCents"] } } } },
    ]).option({ authz: authzToken(ctx) });
    add({ label: "Patient balances open", value: formatMoney(row?.total ?? 0), hint: "Unpaid and partially paid invoices", icon: "building" });
  }
  return stats;
}

export default async function DashboardHome() {
  const ctx = await requireSession();
  await connectToDatabase();
  const [stats, chain, flags] = await Promise.all([statsFor(ctx), ctx.role === "SUPER_ADMIN" ? verifyAuditChain() : null, ctx.role === "PROVIDER" ? openSafetyFlags(ctx) : Promise.resolve([])]);
  const firstName = ctx.displayName?.replace(/^Dr\.\s*/, "").split(" ")[0];

  return (
    <Column gap="32">
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">
          Welcome back{firstName ? `, ${firstName}` : ""}
        </Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          Here&apos;s what needs attention today.
        </Text>
      </Column>
      {flags.length > 0 && (
        <div role="alert" className="crisis-notice">
          <Heading as="h2" variant="heading-strong-m">Safety responses to review</Heading>
          <Text variant="body-default-s">These clients answered the PHQ-9 self-harm question above &quot;not at all&quot;. Reach out per your safety protocol, document it in the chart, then mark it reviewed.</Text>
          <ul>
            {flags.map((f) => (
              <li key={f.id}>
                <SmartLink href={`/dashboard/patients/${f.patientId}?tab=problems`}>{f.patient}</SmartLink> · PHQ-9 score {f.score} · {formatDateTime(f.completedAt)}
                <form action={reviewSafetyAction.bind(null, f.id)} className="inline-form">
                  <button type="submit" className="link-button">Mark reviewed</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Grid columns="3" gap="16" m={{ columns: 2 }} s={{ columns: 1 }}>
        {stats.map((stat) => (
          <Column
            key={stat.label}
            gap="12"
            padding="20"
            radius="l"
            background="surface"
            border={stat.tone === "attention" ? "accent-alpha-medium" : "neutral-alpha-weak"}
          >
            <Row gap="8" vertical="center">
              <Icon name={stat.icon} size="s" onBackground={stat.tone === "attention" ? "accent-medium" : "brand-medium"} decorative />
              <Text variant="label-default-s" onBackground="neutral-medium">
                {stat.label}
              </Text>
            </Row>
            <Text variant="heading-strong-xl" className="stat-value">{stat.value}</Text>
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {stat.hint}
            </Text>
          </Column>
        ))}
      </Grid>

      {chain && (
        <Row gap="12" vertical="center" padding="16" radius="l" border={chain.ok ? "neutral-alpha-weak" : "danger-alpha-medium"}>
          <Icon name={chain.ok ? "shield" : "lifebuoy"} onBackground={chain.ok ? "brand-medium" : "danger-medium"} decorative />
          <Text variant="body-default-s">
            {chain.ok
              ? `Audit trail verified: ${chain.checked.toLocaleString()} entries, no tampering detected.`
              : `Audit trail integrity problem at entry #${chain.brokenAtSeq} (${chain.problem}). Investigate immediately.`}
          </Text>
        </Row>
      )}

      <Text variant="body-default-s" onBackground="neutral-weak">
        Patients, scheduling, telehealth, billing, and messaging are being built next. They&apos;ll appear in the menu as each one is ready.
      </Text>
    </Column>
  );
}

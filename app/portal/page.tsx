import { Column, Grid, Heading, Icon, Row, Text } from "@once-ui-system/core";
import { recordAudit } from "@/lib/audit";
import { authzToken, withScope } from "@/lib/authz";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { formatDateTime, formatMoney } from "@/lib/time";
import type { IconName } from "@/resources/icons";
import { Appointment, ConsentTemplate, Invoice, MANDATORY_CONSENTS, SignedConsent } from "@/models";

export const metadata = { title: "Overview" };

/** Consent types signed and not yet expired. */
function currentConsentTypes(signed: { consentType: string; expiresAt?: Date | null }[], at = new Date()) {
  return new Set(signed.filter((c) => !c.expiresAt || new Date(c.expiresAt) > at).map((c) => c.consentType));
}

export default async function PortalHome() {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  const authz = { authz: authzToken(ctx) };

  if (!ctx.patientId) {
    return (
      <Column gap="12">
        <Heading as="h1" variant="display-strong-xs">
          Welcome
        </Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          Your account isn&apos;t linked to a client record yet. Our team will finish setting it up and email you when it&apos;s ready.
        </Text>
      </Column>
    );
  }

  const [nextVisit, balances, signed, published] = await Promise.all([
    Appointment.findOne(await withScope(ctx, "appointment", { scheduledStart: { $gte: new Date() }, status: { $in: ["SCHEDULED", "CONFIRMED"] } }))
      .sort({ scheduledStart: 1 })
      .setOptions(authz)
      .lean(),
    Invoice.find(await withScope(ctx, "invoice", { status: { $in: ["UNPAID", "PARTIAL", "IN_PAYMENT_PLAN"] }, publishedToPortal: true }), { amountDueCents: 1, amountPaidCents: 1 })
      .setOptions(authz)
      .lean(),
    SignedConsent.find(await withScope(ctx, "signedConsent", { revokedAt: null }), { consentType: 1, expiresAt: 1 }).setOptions(authz).lean(),
    ConsentTemplate.find({ status: "PUBLISHED", type: { $in: MANDATORY_CONSENTS } }, { type: 1 }).lean(),
  ]);

  await recordAudit(ctx, { action: "VIEW", resourceType: "PortalOverview", patientId: ctx.patientId });

  const current = currentConsentTypes(signed);
  const missing = published.filter((t) => !current.has(t.type)).length;
  const owed = balances.reduce((sum, inv) => sum + inv.amountDueCents - (inv.amountPaidCents ?? 0), 0);
  const firstName = ctx.displayName?.split(" ")[0];

  const cards: { label: string; value: string; hint: string; icon: IconName; attention?: boolean }[] = [
    {
      label: "Next appointment",
      value: nextVisit ? formatDateTime(nextVisit.scheduledStart) : "None scheduled",
      hint: nextVisit ? (nextVisit.mode === "VIRTUAL" ? "Video visit: the join link appears here 15 minutes before" : "In person") : "Book a visit from the Appointments page",
      icon: "calendar",
    },
    {
      label: "Balance due",
      value: formatMoney(owed),
      hint: balances.length ? `${balances.length} open ${balances.length === 1 ? "invoice" : "invoices"}` : "You're all paid up",
      icon: "building",
      attention: owed > 0,
    },
    {
      label: "Forms to sign",
      value: String(missing),
      hint: missing ? "Required agreements are waiting" : "All required agreements are signed",
      icon: "shield",
      attention: missing > 0,
    },
  ];

  return (
    <Column gap="32">
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">
          Hello{firstName ? `, ${firstName}` : ""}
        </Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          Your appointments, forms, documents, and bills in one secure place.
        </Text>
      </Column>
      <Grid columns="3" gap="16" m={{ columns: 1 }}>
        {cards.map((card) => (
          <Column key={card.label} gap="12" padding="20" radius="l" background="surface" border={card.attention ? "accent-alpha-medium" : "neutral-alpha-weak"}>
            <Row gap="8" vertical="center">
              <Icon name={card.icon} size="s" onBackground={card.attention ? "accent-medium" : "brand-medium"} decorative />
              <Text variant="label-default-s" onBackground="neutral-medium">
                {card.label}
              </Text>
            </Row>
            <Text variant="heading-strong-l" className="stat-value">{card.value}</Text>
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {card.hint}
            </Text>
          </Column>
        ))}
      </Grid>
      <Text variant="body-default-s" onBackground="neutral-weak">
        Paying bills, signing forms, uploading documents, and messaging your care team are coming next.
      </Text>
    </Column>
  );
}

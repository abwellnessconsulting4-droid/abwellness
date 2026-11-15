import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { SITE_NAME } from "@/lib/constants";
import type { BillingAnalytics, OperationalAnalytics, PatientAnalytics } from "@/lib/services/analytics";

/** A tab's analytics as a neutral report, rendered to CSV or PDF. Aggregates only, no PHI. */
export interface Report {
  title: string;
  scope: string;
  generatedAt: Date;
  sections: ({ heading: string; facts: [string, string][] } | { heading: string; columns: string[]; rows: string[][] })[];
}

const pct = (r: number | null) => (r == null ? "n/a" : `${Math.round(r * 100)}%`);
const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function patientReport(p: PatientAnalytics, generatedAt = new Date()): Report {
  return {
    title: "Patient analytics",
    scope: p.scope,
    generatedAt,
    sections: [
      {
        heading: "Summary",
        facts: [
          ["Registered clients", String(p.totals.registered)],
          ["Active / inactive", `${p.totals.active} / ${p.totals.inactive}`],
          ["New this month", String(p.totals.newThisMonth)],
          ["New last month", String(p.totals.newLastMonth)],
          ["Month-over-month change", pct(p.totals.momChange)],
          ["No-show rate (90 days)", pct(p.rates.noShow)],
          ["Late-cancellation rate (90 days)", pct(p.rates.lateCancel)],
          ["Retention (seen 3-6 months ago and again in the last 3)", pct(p.rates.retention)],
          ["Portal engagement (30 days)", pct(p.rates.portalEngagement)],
        ],
      },
      { heading: "By month", columns: ["Month", "New registrations", "Visits"], rows: p.registrations.map((r, i) => [r.key, String(r.value), String(p.visits[i].value)]) },
      { heading: "Age", columns: ["Band", "Clients"], rows: p.demographics.age.map((a) => [a.label, String(a.value)]) },
      { heading: "Gender", columns: ["Gender", "Clients"], rows: p.demographics.gender.map((a) => [a.label, String(a.value)]) },
      { heading: "Primary payer", columns: ["Payer", "Clients"], rows: p.demographics.payer.map((a) => [a.label, String(a.value)]) },
    ],
  };
}

export function billingReport(b: BillingAnalytics, generatedAt = new Date()): Report {
  return {
    title: "Billing & revenue analytics",
    scope: b.scope,
    generatedAt,
    sections: [
      {
        heading: "Claims",
        facts: [
          ["Submitted", String(b.claims.submitted)],
          ["Paid", `${b.claims.paid} (${pct(b.claims.paidRate)})`],
          ["Awaiting payer", String(b.claims.pending)],
          ["Currently denied", String(b.claims.denied)],
          ["First-pass denial rate", pct(b.claims.firstPassDenialRate)],
          ["Draft or ready", String(b.claims.draft)],
        ],
      },
      {
        heading: "A/R and reimbursement",
        facts: [
          ["A/R outstanding", money(b.ar.totalCents)],
          ["  Insurance (submitted claims)", money(b.ar.insuranceCents)],
          ["  Clients (open invoices)", money(b.ar.patientCents)],
          ["Billed (paid claims)", money(b.reimbursement.billedCents)],
          ["Allowed", money(b.reimbursement.allowedCents)],
          ["Insurance paid", money(b.reimbursement.insurancePaidCents)],
          ["Client responsibility", money(b.reimbursement.patientResponsibilityCents)],
          ["Reimbursement rate (paid / billed)", pct(b.reimbursement.rate)],
        ],
      },
      { heading: "Revenue received by month", columns: ["Month", "Insurance", "Clients", "Total"], rows: b.revenueByMonth.map((m) => [m.key, money(m.insurance), money(m.client), money(m.insurance + m.client)]) },
      { heading: "Insurance payments by provider", columns: ["Provider", "Claims", "Billed", "Paid"], rows: b.byProvider.map((r) => [r.label, String(r.claims), money(r.billed), money(r.paid)]) },
      { heading: "Insurance payments by service", columns: ["CPT", "Units", "Billed", "Paid"], rows: b.byCpt.map((r) => [r.label, String(r.units), money(r.billed), money(r.paid)]) },
      {
        heading: "Annual revenue summary (revenue only; expenses aren't tracked)",
        columns: ["Year", "Charges", "Contractual adj.", "Insurance paid", "Client payments", "Total received"],
        rows: b.annual.map((y) => [String(y.year), money(y.billedCents), money(y.contractualCents), money(y.insuranceCents), money(y.clientCents), money(y.insuranceCents + y.clientCents)]),
      },
    ],
  };
}

export function operationsReport(o: OperationalAnalytics, generatedAt = new Date()): Report {
  return {
    title: "Operational analytics",
    scope: o.scope,
    generatedAt,
    sections: [
      {
        heading: "Summary",
        facts: [
          [`Documentation signed within 48 h (${o.days} days)`, `${pct(o.documentation.rate)} (${o.documentation.signedWithin48h}/${o.documentation.completedVisits})`],
          ["Unsigned notes older than 48 h", String(o.documentation.overdueCount)],
          ["Referral conversion (12 months)", `${pct(o.referrals.rate)} (${o.referrals.converted}/${o.referrals.total})`],
          ["Average satisfaction", o.satisfaction.average == null ? "n/a" : `${o.satisfaction.average.toFixed(2)} / 5`],
          ["Survey responses / response rate", `${o.satisfaction.responses} / ${pct(o.satisfaction.responseRate)}`],
        ],
      },
      {
        heading: `Provider productivity (${o.days} days)`,
        columns: ["Provider", "Available h", "Booked h", "Billable h", "Encounters", "Utilization"],
        rows: o.providers.map((p) => [p.label, String(p.availableHours), String(p.bookedHours), String(p.billableHours), String(p.encounters), pct(p.utilization)]),
      },
      { heading: "Referral conversion by source", columns: ["Source", "New clients", "Completed first visit", "Rate"], rows: o.referrals.bySource.map((r) => [r.label, String(r.referred), String(r.converted), pct(r.rate)]) },
      { heading: "Satisfaction by provider", columns: ["Provider", "Responses", "Average"], rows: o.satisfaction.byProvider.map((r) => [r.label, String(r.responses), r.average.toFixed(2)]) },
    ],
  };
}

const csvCell = (v: string) => {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; // neutralize spreadsheet formulas
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportCsv(r: Report) {
  const lines: string[][] = [[`${SITE_NAME}: ${r.title}`], [`Scope: ${r.scope}`], [`Generated: ${r.generatedAt.toISOString()}`], []];
  for (const section of r.sections) {
    lines.push([section.heading]);
    if ("facts" in section) section.facts.forEach(([k, v]) => lines.push([k.trim(), v]));
    else {
      lines.push(section.columns);
      section.rows.forEach((row) => lines.push(row));
    }
    lines.push([]);
  }
  return lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
}

export async function reportPdf(r: Report): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${r.title} (${r.generatedAt.toISOString().slice(0, 10)})`);
  pdf.setAuthor(SITE_NAME);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.42, 0.45, 0.5);
  const left = 48;
  const right = 564;
  let page: PDFPage = pdf.addPage([612, 792]);
  let y = 744;
  const ensure = (needed: number) => {
    if (y - needed < 56) {
      page = pdf.addPage([612, 792]);
      y = 744;
    }
  };
  const draw = (text: string, x: number, size: number, font: PDFFont, color = ink) => page.drawText(text, { x, y, size, font, color });
  const fit = (text: string, width: number, size: number, font: PDFFont) => {
    let t = text;
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > width) t = t.slice(0, -2);
    return t === text ? t : `${t}…`;
  };

  draw(SITE_NAME, left, 16, bold);
  y -= 20;
  draw(r.title, left, 12, bold);
  y -= 15;
  draw(`${r.scope} · generated ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "long", timeStyle: "short" }).format(r.generatedAt)}`, left, 9, regular, muted);
  y -= 26;

  for (const section of r.sections) {
    ensure(40);
    draw(section.heading, left, 11, bold);
    y -= 6;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: muted });
    y -= 14;
    if ("facts" in section) {
      for (const [k, v] of section.facts) {
        ensure(14);
        draw(fit(k, 330, 9, regular), left, 9, regular, k.startsWith("  ") ? muted : ink);
        draw(fit(v, 170, 9, bold), left + 340, 9, bold);
        y -= 14;
      }
    } else {
      // First column (names, labels) gets more room; the rest share the remainder.
      const total = right - left;
      const firstW = section.columns.length > 2 ? total * 0.3 : total / section.columns.length;
      const restW = (total - firstW) / Math.max(1, section.columns.length - 1);
      const colX = (i: number) => left + (i === 0 ? 0 : firstW + (i - 1) * restW);
      const colW = (i: number) => (i === 0 ? firstW : restW);
      ensure(28);
      section.columns.forEach((c, i) => draw(fit(c, colW(i) - 6, 8, bold), colX(i), 8, bold, muted));
      y -= 13;
      if (section.rows.length === 0) {
        draw("No data yet.", left, 9, regular, muted);
        y -= 13;
      }
      for (const row of section.rows) {
        ensure(13);
        row.forEach((cell, i) => draw(fit(cell, colW(i) - 6, 9, regular), colX(i), 9, regular));
        y -= 13;
      }
    }
    y -= 14;
  }
  ensure(20);
  draw("Aggregate figures only; contains no client-identifying information. Definitions are listed on the Analytics page.", left, 8, regular, muted);
  return pdf.save();
}

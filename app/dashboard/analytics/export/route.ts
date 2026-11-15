import { NextResponse, type NextRequest } from "next/server";
import { AuditedDenial, recordAudit } from "@/lib/audit";
import { billingReport, operationsReport, patientReport, reportCsv, reportPdf } from "@/lib/analytics-report";
import { authorize } from "@/lib/authz";
import { getAuthContext, SessionError } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { billingAnalytics, operationalAnalytics, patientAnalytics } from "@/lib/services/analytics";

/** CSV/PDF export of an analytics tab (aggregates only). The export is audited. */
export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof SessionError) return NextResponse.redirect(new URL("/login", request.url));
    throw error;
  }
  await connectToDatabase();
  const tab = request.nextUrl.searchParams.get("tab") ?? "patients";
  const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  try {
    await authorize(ctx, "analytics", "export");
    const now = new Date();
    const report =
      tab === "billing" ? billingReport(await billingAnalytics(ctx, now), now) : tab === "operations" ? operationsReport(await operationalAnalytics(ctx, now), now) : patientReport(await patientAnalytics(ctx, now), now);
    await recordAudit(ctx, { action: "EXPORT", resourceType: "AnalyticsReport", metadata: { tab, format } });
    const name = `abwellness-${tab}-analytics-${now.toISOString().slice(0, 10)}.${format}`;
    const headers = { "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" };
    if (format === "pdf") return new NextResponse(Buffer.from(await reportPdf(report)), { headers: { ...headers, "Content-Type": "application/pdf" } });
    return new NextResponse(`﻿${reportCsv(report)}`, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  } catch (error) {
    if (error instanceof AuditedDenial) return new NextResponse("Forbidden", { status: 403 });
    throw error;
  }
}

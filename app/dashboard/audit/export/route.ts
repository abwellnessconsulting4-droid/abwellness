import { NextResponse, type NextRequest } from "next/server";
import { AuditedDenial, recordAudit } from "@/lib/audit";
import { buildAuditFilter, findAuditRows, parseAuditFilters, toCsv } from "@/lib/audit-query";
import { authorize } from "@/lib/authz";
import { getAuthContext, SessionError } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";

const EXPORT_LIMIT = 10_000;

/** CSV export of the audit trail (Use Case 6). Requires a reason; the export itself is audited. */
export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof SessionError) return NextResponse.redirect(new URL("/login", request.url));
    throw error;
  }

  await connectToDatabase();
  try {
    await authorize(ctx, "auditLog", "export");
  } catch (error) {
    if (error instanceof AuditedDenial) return new NextResponse("Forbidden", { status: 403 });
    throw error;
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const reason = params.reason?.trim();
  if (!reason || reason.length < 5) return new NextResponse("A reason (at least 5 characters) is required to export.", { status: 400 });

  const filters = parseAuditFilters(params);
  const filter = await buildAuditFilter(filters);
  const rows = filter ? await findAuditRows(filter, EXPORT_LIMIT) : [];

  await recordAudit(ctx, {
    action: "EXPORT",
    resourceType: "AuditLog",
    reason: reason.slice(0, 500),
    metadata: { rows: rows.length, filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-trail-${filters.mrn ?? "all"}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

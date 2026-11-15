import { NextResponse, type NextRequest } from "next/server";
import { AuditedDenial } from "@/lib/audit";
import { getAuthContext, SessionError } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { accessReviewCsv } from "@/lib/services/compliance";

/** Staff accounts × roles × MFA × last sign-in, for quarterly access-review evidence. */
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
    const { csv, filename } = await accessReviewCsv(ctx);
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuditedDenial) return new NextResponse("Forbidden", { status: 403 });
    throw error;
  }
}

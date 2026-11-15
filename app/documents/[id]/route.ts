import { NextResponse, type NextRequest } from "next/server";
import { AuditedDenial } from "@/lib/audit";
import { getAuthContext, SessionError } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { DocumentError, downloadDocument } from "@/lib/services/documents";

/** Authorized, audited, decrypted document download (staff and clients). */
export async function GET(request: NextRequest, { params }: RouteContext<"/documents/[id]">) {
  let ctx;
  try {
    ctx = await getAuthContext();
  } catch (error) {
    if (error instanceof SessionError) return NextResponse.redirect(new URL("/login", request.url));
    throw error;
  }
  await connectToDatabase();
  const { id } = await params;
  try {
    const file = await downloadDocument(ctx, id);
    const inline = request.nextUrl.searchParams.get("view") === "1" && file.mimeType !== "image/svg+xml";
    const safeName = file.fileName.replace(/[^\w.\- ]+/g, "_");
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof DocumentError) return new NextResponse(error.message, { status: 404 });
    if (error instanceof AuditedDenial) return new NextResponse("Forbidden", { status: 403 });
    throw error;
  }
}

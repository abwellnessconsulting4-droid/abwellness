"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditedDenial } from "@/lib/audit";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { AssessmentError, submitScreener, type ScreenerType } from "@/lib/services/assessments";
import { ConsentError, signConsent } from "@/lib/services/consents";
import { DocumentError, MAX_UPLOAD_BYTES, uploadDocument } from "@/lib/services/documents";

export interface RecordsState {
  error?: string;
  success?: string;
}

async function patient() {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  return ctx;
}

async function evidence() {
  const h = await headers();
  return { ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown", userAgent: h.get("user-agent") ?? undefined };
}

function friendly(error: unknown): RecordsState {
  if (error instanceof DocumentError || error instanceof ConsentError || error instanceof AssessmentError) return { error: error.message };
  if (error instanceof AuditedDenial) return { error: "You don't have permission to do that." };
  throw error;
}

export async function uploadAction(_prev: RecordsState, form: FormData): Promise<RecordsState> {
  const ctx = await patient();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Files can be up to 4 MB. Try a smaller photo or a PDF scan." };
  try {
    await uploadDocument(ctx, { category: String(form.get("category") ?? ""), fileName: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/portal/documents");
  return { success: "Uploaded. Your care team can see it now." };
}

export async function signConsentAction(type: string, _prev: RecordsState, form: FormData): Promise<RecordsState> {
  const ctx = await patient();
  if (form.get("agree") !== "on") return { error: "Check the box to confirm you've read the form." };
  try {
    await signConsent(ctx, { type, contentHash: String(form.get("contentHash") ?? ""), signatureName: String(form.get("signatureName") ?? ""), ...(await evidence()) });
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/portal", "layout");
  redirect("/portal/consents?signed=1");
}

export async function screenerAction(type: ScreenerType, count: number, _prev: RecordsState, form: FormData): Promise<RecordsState> {
  const ctx = await patient();
  const answers = Array.from({ length: count }, (_, i) => {
    const v = form.get(`q${i}`);
    return v === null ? -1 : Number(v);
  });
  let id: string;
  try {
    ({ id } = await submitScreener(ctx, type, answers));
  } catch (error) {
    return friendly(error);
  }
  revalidatePath("/portal/intake");
  redirect(`/portal/intake?done=${id}`);
}

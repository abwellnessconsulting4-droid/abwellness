"use server";

import { revalidatePath } from "next/cache";
import { AuditedDenial } from "@/lib/audit";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { ComplianceError, logEntry, recordBackupDrill, signAccessReview, updateBaa } from "@/lib/services/compliance";

export interface ComplianceState {
  error?: string;
  success?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function complianceAction(_prev: ComplianceState, form: FormData): Promise<ComplianceState> {
  const ctx = await requireSession({ roles: ["SUPER_ADMIN"] });
  await connectToDatabase();
  let success: string;
  try {
    switch (text(form, "intent")) {
      case "baa":
        await updateBaa(ctx, { id: text(form, "id") || undefined, vendor: text(form, "vendor"), service: text(form, "service"), status: text(form, "status"), signedDate: text(form, "signedDate") || undefined, renewalDate: text(form, "renewalDate") || undefined, notes: text(form, "notes") });
        success = "BAA record saved.";
        break;
      case "drill":
        await recordBackupDrill(ctx, { vendor: text(form, "vendor"), snapshotAt: text(form, "snapshotAt"), restoreTestedAt: text(form, "restoreTestedAt"), restoredTo: text(form, "restoredTo"), result: text(form, "result"), durationMinutes: Number(text(form, "durationMinutes")) || undefined, notes: text(form, "notes") });
        success = "Restore drill recorded.";
        break;
      case "review":
        await signAccessReview(ctx, text(form, "notes"));
        success = "Access review signed.";
        break;
      case "log":
        await logEntry(ctx, text(form, "kind"), text(form, "notes"));
        success = "Entry added.";
        break;
      default:
        return { error: "Unknown action." };
    }
  } catch (error) {
    if (error instanceof ComplianceError) return { error: error.message };
    if (error instanceof AuditedDenial) return { error: "Only the super admin can record compliance evidence." };
    throw error;
  }
  revalidatePath("/dashboard/compliance");
  return { success };
}

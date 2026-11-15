"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditedDenial } from "@/lib/audit";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { addAppealNote, markReady, postRemittance, RcmError, returnToDraft, submitClaim, updateLines, type LineEdit, type RemitLine } from "@/lib/services/rcm";

export interface ClaimState {
  error?: string;
  success?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const list = (value: string) => value.split(/[\s,]+/).map((v) => v.trim().toUpperCase()).filter(Boolean);

/** "$1,234.50" / "1234.5" → 123450 cents. Blank is 0. */
function cents(value: string): number {
  const clean = value.replace(/[$,\s]/g, "");
  if (!clean) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) throw new RcmError(`"${value}" isn't a dollar amount.`);
  return Math.round(Number(clean) * 100);
}

function lineEdits(form: FormData): LineEdit[] {
  return form.getAll("lineId").map((v) => {
    const id = String(v);
    return { lineId: id, modifiers: list(text(form, `mod-${id}`)), icdPointers: list(text(form, `icd-${id}`)) };
  });
}

function remitLines(form: FormData): RemitLine[] {
  return form.getAll("lineId").map((v) => {
    const id = String(v);
    return {
      lineId: id,
      paidCents: cents(text(form, `paid-${id}`)),
      contractualCents: cents(text(form, `contractual-${id}`)),
      copayCents: cents(text(form, `copay-${id}`)),
      deductibleCents: cents(text(form, `deductible-${id}`)),
      coinsuranceCents: cents(text(form, `coinsurance-${id}`)),
    };
  });
}

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

export async function claimAction(claimId: string, _prev: ClaimState, form: FormData): Promise<ClaimState> {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  let success: string;
  try {
    switch (text(form, "intent")) {
      case "save-lines":
        await updateLines(ctx, claimId, lineEdits(form));
        success = "Claim lines saved.";
        break;
      case "mark-ready":
        await updateLines(ctx, claimId, lineEdits(form));
        await markReady(ctx, claimId);
        success = "Claim checks passed. Ready to submit.";
        break;
      case "to-draft":
        await returnToDraft(ctx, claimId);
        success = "Returned to draft.";
        break;
      case "submit": {
        const r = await submitClaim(ctx, claimId);
        success = r.status === "SUBMITTED" ? `Submitted to the clearinghouse (reference ${r.reference}).` : `The clearinghouse rejected the claim (reference ${r.reference}).`;
        break;
      }
      case "resubmit": {
        const r = await submitClaim(ctx, claimId, { note: text(form, "correctionNote"), lines: lineEdits(form) });
        success = r.status === "SUBMITTED" ? `Corrected claim resubmitted (reference ${r.reference}).` : `The clearinghouse rejected the corrected claim (reference ${r.reference}).`;
        break;
      }
      case "appeal-note":
        await addAppealNote(ctx, claimId, text(form, "note"));
        success = "Note added.";
        break;
      case "post-payment": {
        const r = await postRemittance(ctx, claimId, {
          outcome: "PAID",
          eraReference: text(form, "eraReference"),
          checkOrEftNumber: text(form, "checkOrEftNumber"),
          lines: remitLines(form),
        });
        const owed = r.patientCents ?? 0;
        success = owed > 0 ? `Payment posted. A ${dollars(owed)} invoice was created and published to the client's portal.` : "Payment posted. The client owes nothing for this visit.";
        break;
      }
      case "post-denial":
        await postRemittance(ctx, claimId, {
          outcome: "DENIED",
          eraReference: text(form, "eraReference"),
          carc: text(form, "carc"),
          description: text(form, "description"),
          rarc: list(text(form, "rarc")),
        });
        success = "Denial posted. The claim is in the denials queue.";
        break;
      default:
        return { error: "Unknown action." };
    }
  } catch (error) {
    if (error instanceof RcmError) return { error: error.message };
    if (error instanceof AuditedDenial) return { error: "You don't have permission to do that. The attempt was recorded." };
    throw error;
  }
  revalidatePath("/dashboard/billing", "layout");
  // Status changes swap the action panel, so confirm on the page itself.
  const intent = text(form, "intent");
  if (intent === "save-lines" || intent === "appeal-note") return { success };
  redirect(`/dashboard/billing/claims/${claimId}?done=${intent}`);
}

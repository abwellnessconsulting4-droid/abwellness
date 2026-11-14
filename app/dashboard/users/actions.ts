"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AdminActionError,
  AuditedDenial,
  changeRole,
  inviteStaff,
  resetTwoFactor,
  sendPasswordLink,
  setStatus,
  signOutEverywhere,
} from "@/lib/admin/users";
import { requireSession } from "@/lib/dal";

export interface ActionState {
  error?: string;
  success?: string;
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

async function run(action: () => Promise<void>, success: string): Promise<ActionState> {
  try {
    await action();
    return { success };
  } catch (error) {
    if (error instanceof AdminActionError) return { error: error.message };
    if (error instanceof AuditedDenial) return { error: "You don't have permission to do that." };
    throw error;
  }
}

export async function inviteStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireSession({ roles: ["SUPER_ADMIN"] });
  let id: string | undefined;
  const result = await run(async () => {
    id = await inviteStaff(ctx, {
      name: field(form, "name"),
      email: field(form, "email"),
      role: field(form, "role"),
      credentials: field(form, "credentials"),
      npi: field(form, "npi"),
      specialty: field(form, "specialty"),
      reason: field(form, "reason"),
    });
  }, "Invitation sent.");
  if (result.error || !id) return result;
  redirect(`/dashboard/users/${id}?invited=1`);
}

/** One action for the detail page's forms; `intent` picks the operation. */
export async function userAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireSession({ roles: ["SUPER_ADMIN"] });
  const id = field(form, "userId");
  const reason = field(form, "reason");
  const intent = field(form, "intent");

  const result = await run(async () => {
    switch (intent) {
      case "role":
        return changeRole(ctx, id, field(form, "role"), reason);
      case "deactivate":
        return setStatus(ctx, id, "DEACTIVATED", reason);
      case "reactivate":
        return setStatus(ctx, id, "ACTIVE", reason);
      case "reset-2fa":
        return resetTwoFactor(ctx, id, reason);
      case "sign-out":
        return signOutEverywhere(ctx, id, reason);
      case "password-link":
        if (reason.trim().length < 5) throw new AdminActionError("Please give a reason (at least 5 characters).");
        return sendPasswordLink(ctx, field(form, "email"), "reset");
      default:
        throw new AdminActionError("Unknown action.");
    }
  }, SUCCESS[intent] ?? "Done.");

  revalidatePath(`/dashboard/users/${id}`);
  revalidatePath("/dashboard/users");
  return result;
}

const SUCCESS: Record<string, string> = {
  role: "Role updated. They'll be signed out so the new permissions apply.",
  deactivate: "Account deactivated and signed out everywhere.",
  reactivate: "Account reactivated.",
  "reset-2fa": "Two-step verification reset. They'll set it up again at next sign-in.",
  "sign-out": "Signed out of every device.",
  "password-link": "Password reset link sent.",
};

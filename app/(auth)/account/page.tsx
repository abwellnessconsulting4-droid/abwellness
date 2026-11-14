import { redirect } from "next/navigation";
import { requireSession } from "@/lib/dal";
import { isStaff } from "@/lib/rbac";

/** Post-sign-in landing: send each role to its home. */
export default async function AccountHome() {
  const ctx = await requireSession();
  redirect(isStaff(ctx.role) ? "/dashboard" : "/portal");
}

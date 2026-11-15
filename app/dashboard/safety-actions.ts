"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { reviewSafetyFlag } from "@/lib/services/assessments";

/** Provider marks a PHQ-9 safety flag as reviewed (follow-up documented in the chart). */
export async function reviewSafetyAction(assessmentId: string) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  await reviewSafetyFlag(ctx, assessmentId);
  revalidatePath("/dashboard", "layout");
}

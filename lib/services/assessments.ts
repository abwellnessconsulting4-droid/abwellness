import "server-only";

import { Types } from "mongoose";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { authorize, authorizeAny, authzToken, withScope, type AuthContext } from "@/lib/authz";
import { authorizeDoc, createScoped, systemToken } from "@/lib/db/phi-guard";
import { encryptJson } from "@/lib/crypto";
import { sendSafetyAlert } from "@/lib/email/clinical";
import { HealthAssessment, Patient, StaffProfile } from "@/models";

/**
 * Standardized screeners clients complete from the portal. Scores and
 * severity follow the published scoring (PHQ-9: Kroenke et al. 2001; GAD-7:
 * Spitzer et al. 2006). Item-level answers are stored encrypted.
 *
 * Safety: any PHQ-9 item 9 answer above 0 (thoughts of self-harm) raises a
 * flag for the assigned provider and shows crisis resources to the client
 * right away. This supports, and never replaces, clinical follow-up.
 */

const LOOKUP = systemToken("assessments");
export class AssessmentError extends Error {}

export const ANSWER_CHOICES = ["Not at all", "Several days", "More than half the days", "Nearly every day"] as const;

export const SCREENERS = {
  PHQ9: {
    title: "PHQ-9: mood over the last 2 weeks",
    intro: "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
    items: [
      "Little interest or pleasure in doing things",
      "Feeling down, depressed, or hopeless",
      "Trouble falling or staying asleep, or sleeping too much",
      "Feeling tired or having little energy",
      "Poor appetite or overeating",
      "Feeling bad about yourself, or that you are a failure or have let yourself or your family down",
      "Trouble concentrating on things, such as reading the newspaper or watching television",
      "Moving or speaking so slowly that other people could have noticed, or the opposite: being so fidgety or restless that you have been moving around a lot more than usual",
      "Thoughts that you would be better off dead, or of hurting yourself in some way",
    ],
    bands: [
      { max: 4, severity: "MINIMAL", label: "Minimal" },
      { max: 9, severity: "MILD", label: "Mild" },
      { max: 14, severity: "MODERATE", label: "Moderate" },
      { max: 19, severity: "MODERATELY_SEVERE", label: "Moderately severe" },
      { max: 27, severity: "SEVERE", label: "Severe" },
    ],
  },
  GAD7: {
    title: "GAD-7: worry and anxiety over the last 2 weeks",
    intro: "Over the last 2 weeks, how often have you been bothered by the following problems?",
    items: [
      "Feeling nervous, anxious, or on edge",
      "Not being able to stop or control worrying",
      "Worrying too much about different things",
      "Trouble relaxing",
      "Being so restless that it's hard to sit still",
      "Becoming easily annoyed or irritable",
      "Feeling afraid, as if something awful might happen",
    ],
    bands: [
      { max: 4, severity: "MINIMAL", label: "Minimal" },
      { max: 9, severity: "MILD", label: "Mild" },
      { max: 14, severity: "MODERATE", label: "Moderate" },
      { max: 21, severity: "SEVERE", label: "Severe" },
    ],
  },
} as const;
export type ScreenerType = keyof typeof SCREENERS;

export function scoreScreener(type: ScreenerType, answers: number[]) {
  const screener = SCREENERS[type];
  if (answers.length !== screener.items.length || answers.some((a) => !Number.isInteger(a) || a < 0 || a > 3)) {
    throw new AssessmentError("Please answer every question.");
  }
  const score = answers.reduce((n, a) => n + a, 0);
  const band = screener.bands.find((b) => score <= b.max)!;
  const safetyFlag = type === "PHQ9" && answers[8] > 0;
  return { score, severity: band.severity, label: band.label, safetyFlag };
}

export async function submitScreener(ctx: AuthContext, type: ScreenerType, answers: number[], now = new Date()) {
  if (ctx.role !== "PATIENT" || !ctx.patientId) throw new AssessmentError("Your account isn't linked to a client record yet.");
  if (!SCREENERS[type]) throw new AssessmentError("Unknown questionnaire.");
  await authorizeAny(ctx, "healthAssessment", "create");
  const result = scoreScreener(type, answers);
  const doc = await createScoped(HealthAssessment, authzToken(ctx), {
    patientId: ctx.patientId,
    type,
    responsesEnc: encryptJson({ answers, version: "standard" }, "HealthAssessment.responses"),
    score: result.score,
    severity: result.severity,
    safetyFlag: { raised: result.safetyFlag },
    completedBy: ctx.userId,
    completedByRole: "PATIENT",
    completedAt: now,
  });
  await recordAudit(ctx, { action: "CREATE", resourceType: "HealthAssessment", resourceId: String(doc._id), patientId: ctx.patientId, metadata: { type, score: result.score, severity: result.severity, safetyFlag: result.safetyFlag } });

  if (result.safetyFlag) {
    // Tell the assigned provider to sign in; the email itself carries no health information.
    const patient = await Patient.findById(ctx.patientId, { assignedProviderId: 1 }).setOptions({ authz: LOOKUP }).lean();
    const provider = patient?.assignedProviderId ? await StaffProfile.findById(patient.assignedProviderId, { userId: 1 }).lean() : null;
    const { getAuth } = await import("@/lib/auth");
    const user = provider?.userId ? await (await getAuth().$context).internalAdapter.findUserById(String(provider.userId)) : null;
    if (user?.email) await sendSafetyAlert(user.email).catch((error) => console.error("Safety alert email failed", error));
    const system: AuditActor = { actorRole: "SYSTEM" };
    await recordAudit(system, { action: "CREATE", resourceType: "SafetyAlert", resourceId: String(doc._id), patientId: ctx.patientId, metadata: { notified: Boolean(user?.email) } });
  }
  return { id: String(doc._id), ...result };
}

/** The client's own screener history. */
export async function myScreeners(ctx: AuthContext) {
  if (ctx.role !== "PATIENT" || !ctx.patientId) throw new AssessmentError("Your account isn't linked to a client record yet.");
  const rows = await HealthAssessment.find(await withScope(ctx, "healthAssessment", { type: { $in: Object.keys(SCREENERS) } }), { type: 1, score: 1, severity: 1, completedAt: 1, "safetyFlag.raised": 1 })
    .sort({ completedAt: -1 })
    .limit(30)
    .setOptions({ authz: authzToken(ctx) })
    .lean();
  return rows.map((r) => ({ id: String(r._id), type: r.type as ScreenerType, score: r.score ?? 0, severity: r.severity ?? undefined, completedAt: r.completedAt, safetyFlag: Boolean(r.safetyFlag?.raised) }));
}

/** Unreviewed safety flags for the viewer's clients (provider dashboard). */
export async function openSafetyFlags(ctx: AuthContext) {
  const rows = await HealthAssessment.find(await withScope(ctx, "healthAssessment", { "safetyFlag.raised": true, "safetyFlag.reviewedAt": null }), { patientId: 1, type: 1, score: 1, completedAt: 1 })
    .sort({ completedAt: -1 })
    .setOptions({ authz: authzToken(ctx) })
    .lean();
  const patients = await Patient.find({ _id: { $in: rows.map((r) => r.patientId) } }, { firstName: 1, lastName: 1 }).setOptions({ authz: LOOKUP }).lean();
  const name = new Map(patients.map((p) => [String(p._id), `${p.firstName} ${p.lastName}`]));
  return rows.map((r) => ({ id: String(r._id), patientId: String(r.patientId), patient: name.get(String(r.patientId)) ?? "Client", type: r.type, score: r.score ?? 0, completedAt: r.completedAt }));
}

export async function reviewSafetyFlag(ctx: AuthContext, assessmentId: string) {
  if (!Types.ObjectId.isValid(assessmentId)) throw new AssessmentError("Not found.");
  const doc = await HealthAssessment.findById(assessmentId).setOptions({ authz: LOOKUP });
  if (!doc?.safetyFlag?.raised) throw new AssessmentError("Not found.");
  const patient = await Patient.findById(doc.patientId, { assignedProviderId: 1 }).setOptions({ authz: LOOKUP }).lean();
  await authorize(ctx, "healthAssessment", "update", { resourceId: assessmentId, patientId: doc.patientId, assignedProviderId: patient?.assignedProviderId ?? null });
  doc.safetyFlag.reviewedAt = new Date();
  doc.safetyFlag.reviewedBy = new Types.ObjectId(ctx.userId);
  await authorizeDoc(doc, authzToken(ctx)).save();
  await recordAudit(ctx, { action: "UPDATE", resourceType: "HealthAssessment", resourceId: assessmentId, patientId: String(doc.patientId), changedFields: ["safetyFlag"] });
}

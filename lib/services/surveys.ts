import "server-only";

import { Types } from "mongoose";
import { recordAudit } from "@/lib/audit";
import { authzToken, type AuthContext } from "@/lib/authz";
import { createScoped, systemToken } from "@/lib/db/phi-guard";
import { ENC, encrypt } from "@/lib/crypto";
import { Appointment, VisitSurvey } from "@/models";

/** Post-visit satisfaction: one rating per completed visit, within 30 days. */

const LOOKUP = systemToken("surveys");
export class SurveyError extends Error {}
const WINDOW_DAYS = 30;

/** Completed visits (last 30 days) the client hasn't rated yet. */
export async function visitsToRate(ctx: AuthContext, now = new Date()) {
  if (ctx.role !== "PATIENT" || !ctx.patientId) return [];
  const visits = await Appointment.find(
    { patientId: ctx.patientId, status: "COMPLETED", scheduledStart: { $gte: new Date(now.getTime() - WINDOW_DAYS * 86_400_000), $lte: now } },
    { _id: 1 },
  )
    .setOptions({ authz: authzToken(ctx) })
    .lean();
  const rated = new Set((await VisitSurvey.find({ appointmentId: { $in: visits.map((v) => v._id) } }, { appointmentId: 1 }).setOptions({ authz: LOOKUP }).lean()).map((s) => String(s.appointmentId)));
  return visits.map((v) => String(v._id)).filter((id) => !rated.has(id));
}

export async function submitSurvey(ctx: AuthContext, input: { appointmentId: string; rating: number; comment?: string }, now = new Date()) {
  if (ctx.role !== "PATIENT" || !ctx.patientId) throw new SurveyError("Only clients can rate visits.");
  if (!Types.ObjectId.isValid(input.appointmentId)) throw new SurveyError("Visit not found.");
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new SurveyError("Choose a rating from 1 to 5 stars.");
  const appointment = await Appointment.findOne({ _id: input.appointmentId, patientId: ctx.patientId }, { status: 1, providerId: 1, scheduledStart: 1 }).setOptions({ authz: authzToken(ctx) }).lean();
  if (!appointment) throw new SurveyError("Visit not found.");
  if (appointment.status !== "COMPLETED") throw new SurveyError("You can rate a visit after it's completed.");
  if (now.getTime() - appointment.scheduledStart.getTime() > WINDOW_DAYS * 86_400_000) throw new SurveyError("Ratings are open for 30 days after a visit.");
  if (await VisitSurvey.exists({ appointmentId: appointment._id }).setOptions({ authz: LOOKUP })) throw new SurveyError("You've already rated this visit. Thank you!");
  const comment = input.comment?.trim().slice(0, 1000);
  const survey = await createScoped(VisitSurvey, authzToken(ctx), {
    patientId: ctx.patientId,
    appointmentId: appointment._id,
    providerId: appointment.providerId,
    rating: input.rating,
    commentEnc: comment ? encrypt(comment, ENC.surveyComment) : undefined,
    submittedAt: now,
  });
  await recordAudit(ctx, { action: "CREATE", resourceType: "VisitSurvey", resourceId: String(survey._id), patientId: ctx.patientId, metadata: { rating: input.rating } });
  return String(survey._id);
}

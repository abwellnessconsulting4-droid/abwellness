/**
 * Clearinghouse adapter (837P out, 999/277CA acknowledgements back).
 *
 * SIMULATED (default) accepts every scrubbed claim and returns a reference,
 * so the submit → remittance → denial/resubmission cycle works end to end.
 * Payer responses (835 ERAs) are posted by billing staff on the claim screen.
 *
 * A real adapter (e.g. Availity, Office Ally, Claim.MD) needs a signed BAA,
 * enrollment with each payer, and credentials in CLEARINGHOUSE_* env vars.
 */

export interface SubmissionResult {
  accepted: boolean;
  reference: string;
  message?: string;
}

export interface ClearinghouseAdapter {
  readonly id: "SIMULATED";
  submit(claim: { claimNumber: string; resubmissionCount: number; frequencyCode: "1" | "7" }): Promise<SubmissionResult>;
}

const simulated: ClearinghouseAdapter = {
  id: "SIMULATED",
  async submit(claim) {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return { accepted: true, reference: `SIM-${claim.claimNumber}-${claim.resubmissionCount}-${suffix}`, message: "Accepted by the simulated clearinghouse (999 accepted)." };
  },
};

export function clearinghouse(): ClearinghouseAdapter {
  if (process.env.CLEARINGHOUSE_PROVIDER && process.env.CLEARINGHOUSE_PROVIDER !== "simulated") {
    throw new Error(`Clearinghouse "${process.env.CLEARINGHOUSE_PROVIDER}" isn't implemented yet (needs a BAA and payer enrollment). See lib/clearinghouse.ts.`);
  }
  return simulated;
}

/** Common CARC codes for the denial form (group code + reason). */
export const COMMON_DENIALS = [
  { carc: "CO-4", description: "Procedure code inconsistent with the modifier used." },
  { carc: "CO-16", description: "Claim lacks information needed for adjudication." },
  { carc: "CO-11", description: "Diagnosis inconsistent with the procedure." },
  { carc: "CO-29", description: "The time limit for filing has expired." },
  { carc: "CO-97", description: "Payment included in another service already adjudicated." },
  { carc: "CO-197", description: "Precertification/authorization absent." },
  { carc: "PR-27", description: "Expenses incurred after coverage terminated." },
] as const;

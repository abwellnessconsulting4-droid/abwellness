import type { ClaimStatus } from "@/models";

type TagVariant = "neutral" | "warning" | "success" | "brand" | "danger" | "info";

export const CLAIM_STATUS_TAG: Record<ClaimStatus, { label: string; variant: TagVariant }> = {
  DRAFT: { label: "Draft", variant: "neutral" },
  READY_TO_SUBMIT: { label: "Ready to submit", variant: "info" },
  SUBMITTED: { label: "Submitted", variant: "brand" },
  ACCEPTED: { label: "Accepted", variant: "brand" },
  REJECTED: { label: "Rejected", variant: "danger" },
  DENIED: { label: "Denied", variant: "danger" },
  PAID: { label: "Paid", variant: "success" },
  PARTIAL: { label: "Partially paid", variant: "warning" },
  VOID: { label: "Void", variant: "neutral" },
};

export const INVOICE_STATUS_TAG: Record<string, { label: string; variant: TagVariant }> = {
  DRAFT: { label: "Draft", variant: "neutral" },
  UNPAID: { label: "Unpaid", variant: "warning" },
  PARTIAL: { label: "Partially paid", variant: "warning" },
  PAID: { label: "Paid", variant: "success" },
  IN_PAYMENT_PLAN: { label: "Payment plan", variant: "info" },
  VOID: { label: "Void", variant: "neutral" },
};

export const INVOICE_KIND_LABEL: Record<string, string> = {
  CLAIM_PATIENT_RESPONSIBILITY: "Insurance balance",
  LATE_CANCELLATION: "Late cancellation",
  NO_SHOW: "Missed appointment",
  SELF_PAY: "Self-pay visit",
  PACKAGE: "Package",
};

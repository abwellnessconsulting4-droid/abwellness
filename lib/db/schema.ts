import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";
import { isEncrypted } from "@/lib/crypto";

/** ObjectId reference to another model. */
export const ref = (target: string, required = true) => ({ type: Schema.Types.ObjectId, ref: target, required });

/**
 * A field holding lib/crypto ciphertext. Never selected by default, and the
 * validator rejects plaintext, so a missed encrypt() call fails loudly
 * instead of storing PHI in the clear.
 */
export const encrypted = (required = false) => ({
  type: String,
  required,
  select: false,
  validate: {
    validator: (value: unknown) => value == null || isEncrypted(value),
    message: "{PATH} must be encrypted with lib/crypto before saving",
  },
});

/** Money as integer cents (never floating-point dollars). */
export const cents = (required = false) => ({
  type: Number,
  required,
  min: 0,
  default: required ? undefined : 0,
  validate: { validator: Number.isInteger, message: "{PATH} must be whole cents" },
});

/** Signed integer cents (adjustments and refunds may be negative). */
export const signedCents = () => ({
  type: Number,
  default: 0,
  validate: { validator: Number.isInteger, message: "{PATH} must be whole cents" },
});

export const E164 = { type: String, match: /^\+[1-9]\d{6,14}$/ };

export const AddressSchema = new Schema(
  {
    street: String,
    street2: String,
    city: String,
    state: { type: String, maxlength: 2 },
    zip: { type: String, match: /^\d{5}(-\d{4})?$/ },
    country: { type: String, default: "US", maxlength: 2 },
  },
  { _id: false },
);

/** Electronic signature evidence shared by notes, plans, and consents. */
export const SignatureSchema = new Schema(
  {
    signerId: { type: Schema.Types.ObjectId, required: true },
    signerName: { type: String, required: true },
    signerRole: { type: String, required: true },
    method: { type: String, enum: ["DRAWN", "TYPED", "CLICK"], required: true },
    signatureSvg: { type: String, maxlength: 200_000 }, // canvas/typed signature rendering
    contentHash: { type: String, required: true }, // sha256 of the exact content signed
    signatureHash: { type: String, required: true }, // sha256(contentHash|signerId|ip|timestamp)
    ipAddress: { type: String, required: true },
    userAgent: String,
    signedAt: { type: Date, required: true },
  },
  { _id: false },
);

export const baseOptions = { timestamps: true, strict: "throw" as const };

/** Register a model once (safe across hot reloads), keeping inferred types. */
export function defineModel<S extends Schema>(name: string, schema: S) {
  type Doc = InferSchemaType<S>;
  return (models[name] as Model<Doc> | undefined) ?? model<Doc>(name, schema as unknown as Schema<Doc>);
}

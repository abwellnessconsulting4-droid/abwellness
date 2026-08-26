import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const EmailSubscriberSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    source: {
      type: String,
      default: "waitlist",
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

EmailSubscriberSchema.index({ email: 1 }, { unique: true });

export type EmailSubscriberDocument = InferSchemaType<typeof EmailSubscriberSchema>;

export const EmailSubscriber: Model<EmailSubscriberDocument> =
  (models.EmailSubscriber as Model<EmailSubscriberDocument>) ||
  model<EmailSubscriberDocument>("EmailSubscriber", EmailSubscriberSchema);

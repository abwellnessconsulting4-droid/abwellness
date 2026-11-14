import { Schema } from "mongoose";
import { phiGuard } from "@/lib/db/phi-guard";
import { AddressSchema, baseOptions, defineModel, E164, encrypted, ref } from "@/lib/db/schema";

/**
 * Login identities live in Better Auth's `user` collection (see lib/auth.ts),
 * which carries `role`. These models hold the profile data for each side.
 */

export const StaffProfileSchema = new Schema(
  {
    userId: ref("User"),
    displayName: { type: String, required: true }, // "Dr. Aris Thorne, PsyD"
    credentials: String, // "PsyD", "CPC", "MSW"
    npi: { type: String, match: /^\d{10}$/ },
    specialty: String,
    licenses: [
      {
        _id: false,
        type: { type: String, required: true }, // e.g. "Psychologist"
        number: { type: String, required: true },
        state: { type: String, maxlength: 2, required: true },
        expiresOn: Date,
      },
    ],
    acceptingPatients: { type: Boolean, default: true },
    timezone: { type: String, default: "America/New_York" },
    active: { type: Boolean, default: true },
  },
  baseOptions,
);
StaffProfileSchema.index({ userId: 1 }, { unique: true });
StaffProfileSchema.index({ npi: 1 }, { unique: true, partialFilterExpression: { npi: { $type: "string" } } });

export const StaffProfile = defineModel("StaffProfile", StaffProfileSchema);

const EmergencyContactSchema = new Schema(
  {
    name: { type: String, required: true },
    relationship: { type: String, required: true },
    phone: { ...E164, required: true },
    email: { type: String, lowercase: true },
    isNextOfKin: { type: Boolean, default: false },
    mayDisclosePhi: { type: Boolean, default: false },
  },
  { _id: true },
);

export const PatientSchema = new Schema(
  {
    userId: ref("User", false), // portal account, once invited
    mrn: { type: String, required: true }, // ABW-2026-0001
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    preferredName: String,
    // Lowercased copies for case-insensitive, index-backed name search.
    firstNameLower: { type: String, required: true },
    lastNameLower: { type: String, required: true },
    dob: { type: Date, required: true },
    gender: String,
    sexAtBirth: { type: String, enum: ["FEMALE", "MALE", "INTERSEX", "UNKNOWN", "DECLINED"] },
    pronouns: String,
    preferredLanguage: { type: String, default: "en" },
    interpreterNeeded: { type: Boolean, default: false },
    email: { type: String, lowercase: true, trim: true },
    phone: E164,
    address: AddressSchema,
    emergencyContacts: [EmergencyContactSchema],
    assignedProviderId: ref("StaffProfile", false),
    status: { type: String, enum: ["ACTIVE", "INACTIVE", "DISCHARGED", "DECEASED"], default: "ACTIVE" },
    // SSN: ciphertext + last four for display + blind index for exact-match lookup.
    ssnEnc: encrypted(),
    ssnLast4: { type: String, match: /^\d{4}$/ },
    ssnHash: { type: String, select: false },
    portalInvitedAt: Date,
    registeredAt: { type: Date, default: Date.now },
    legalHold: { type: Boolean, default: false },
  },
  baseOptions,
);
PatientSchema.pre("validate", function () {
  this.firstNameLower = this.firstName?.toLowerCase();
  this.lastNameLower = this.lastName?.toLowerCase();
});
PatientSchema.index({ mrn: 1 }, { unique: true });
PatientSchema.index({ lastNameLower: 1, firstNameLower: 1, dob: 1 });
PatientSchema.index({ dob: 1 });
PatientSchema.index({ assignedProviderId: 1, status: 1 });
PatientSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } });
PatientSchema.index({ ssnHash: 1 }, { unique: true, partialFilterExpression: { ssnHash: { $type: "string" } } });
PatientSchema.index({ status: 1, registeredAt: -1 });
PatientSchema.plugin(phiGuard);

export const Patient = defineModel("Patient", PatientSchema);

# EMR Phase 1: Core Utilities, Security Layer & Data Models

Status: **Built and tested** · Branch: `feature/emr-core` · Date: 2026-11-14

This phase adds the foundation for the EMR/EHR, billing, telehealth, and patient portal: no screens yet. It supersedes two choices in [phase-1-architecture.md](./phase-1-architecture.md):

- **Roles:** five roles (`SUPER_ADMIN`, `PROVIDER`, `BILLING_STAFF`, `FRONT_DESK`, `PATIENT`) replace the earlier seven.
- **Encryption:** application-level AES-256-GCM (`lib/crypto.ts`) replaces MongoDB client-side field-level encryption.

## What's here

| Area | Files | Notes |
|---|---|---|
| Field encryption | `lib/crypto.ts` | AES-256-GCM, versioned keys for rotation, ciphertext bound to its field (AAD), HMAC blind indexes for exact-match search |
| Permissions | `lib/rbac.ts` | Typed matrix: role × resource × action → scope (`all`, `assigned`, `own`, `author`); session timeouts per role |
| Authorization | `lib/authz.ts` | `authorize()` for one record, `scopeFilter()` for lists, psychotherapy-note grants, document/message category rules; every denial is audited |
| Session gate | `lib/dal.ts` | `requireSession()` for pages: status, MFA enrollment, 15/30-minute inactivity, 10/12-hour absolute lifetime |
| Auth | `lib/auth.ts`, `lib/auth-client.ts`, `app/api/auth/[...all]` | Better Auth 1.7.14: email + password (12+ chars), required email verification, TOTP / email code / backup codes, database sessions, rate limits |
| Route gating | `proxy.ts` | Cookie check for `/dashboard`, `/portal`, `/account`; `no-store` and no-framing headers; these areas work in every site mode |
| Audit trail | `lib/audit.ts`, `models/system.ts` | Append-only, hash-chained log; `withAudit()` wrapper; `verifyAuditChain()`; field names only, never values |
| Database guard | `lib/db/phi-guard.ts`, `lib/db/schema.ts` | Unscoped queries and saves on PHI models throw; encrypted fields reject plaintext |
| Inactivity warning | `components/session/session-timeout.tsx` | Countdown dialog, keep-alive while active, synced across tabs |
| Models | `models/*.ts` (28) | See below |

## Models

| Domain | Models |
|---|---|
| People | `Patient`, `StaffProfile` (login accounts live in Better Auth's `user` collection) |
| Clinical | `HealthAssessment`, `ClinicalNote`, `Diagnosis`, `TreatmentPlan`, `Medication`, `Allergy`, `ClinicalDocument` |
| Billing | `MedicalCode`, `InsurancePolicy`, `Claim`, `RemittanceAdvice`, `Invoice`, `PaymentTransaction`, `PaymentPlan` |
| Compliance | `ConsentTemplate`, `SignedConsent`, `ComplianceRecord` |
| Scheduling | `ProviderSchedule`, `Appointment`, `AppointmentSlot`, `WaitlistEntry` |
| Communication | `MessageThread`, `SecureMessage`, `TelehealthSession` |
| System | `AuditLog`, `Counter` (MRN, claim, invoice, and receipt numbers) |

Rules enforced in the models themselves:

- Signed notes are locked; changes go in addenda. Query-level updates are refused so the lock can't be bypassed.
- Signed consents can be revoked but never edited; published templates are immutable. A release of information requires a recipient, scope, and expiry.
- Claims follow the lifecycle (`DRAFT → READY_TO_SUBMIT → SUBMITTED → ACCEPTED/REJECTED/DENIED → PAID/PARTIAL`, plus resubmission) with history; totals are computed from lines.
- Invoice amounts and status derive from line items and payments; payment-plan installments must add up.
- A provider can't be double-booked (unique 15-minute slot records).
- Telehealth join tokens are stored only as hashes.
- Money is stored as integer cents.

## Using it (for Phase 3+)

```ts
// In a Server Component, Server Action, or Route Handler
const ctx = await requireSession({ roles: ["PROVIDER"] });

// One record: load, authorize (audits denials, throws 403), then audit the read
const note = await ClinicalNote.findById(id).setOptions({ authz: authzToken(ctx) }).orFail();
await authorize(ctx, "clinicalNote", "read", { resourceId: id, patientId: note.patientId, noteType: note.noteType, noteStatus: note.status });
await recordAudit(ctx, { action: "VIEW", resourceType: "ClinicalNote", resourceId: id, patientId: String(note.patientId) });

// Lists: always merge the scope filter
const claims = await Claim.find({ status: "DENIED", ...(await scopeFilter(ctx, "claim")) }).setOptions({ authz: authzToken(ctx) });
```

Psychotherapy notes use the `psychotherapyNote` resource, never `clinicalNote`.

## Tests

`npm test` runs 56 tests against a throwaway MongoDB replica set (local `mongod` if installed, otherwise downloaded):

- Encryption: round-trip, tamper detection, wrong-field rejection, key rotation, blind indexes
- Permission matrix: Use Case 6 rules, psychotherapy-note isolation, patient/provider scoping, timeouts
- Authorization against real data: assigned-only access, audited 403 for billing staff, grants and expiry, list filters
- Audit chain: 30 concurrent writers, detection of edited and deleted entries
- Models: every index builds; locks, immutability, lifecycle, totals, double-booking
- Better Auth: patients can't self-assign roles, unverified emails can't sign in, sign-ins are audited

## Before real patient data

- MongoDB Atlas dedicated cluster (M10+) with a signed BAA; Vercel and AWS BAAs
- `ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `BETTER_AUTH_SECRET` set as Sensitive variables in Vercel (production values never in `.env.local`)
- CPT license from the AMA before loading CPT codes beyond the seed set
- Clearinghouse, video (Daily), and SMS vendors under BAA (Phases 3–4 build these behind adapters with simulated providers)
- Decide clinical scope: licensed providers and the public site's "no therapy" copy must agree

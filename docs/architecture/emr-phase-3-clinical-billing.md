# EMR Phase 3 (slices 3–6): Chart, Scheduling, Telehealth, Billing

Companion to `emr-phase-3-signin.md` (sign-in, MFA, admin). All services live in `lib/services/*`, take an `AuthContext`, authorize through `lib/authz.ts`, and audit through `lib/audit.ts`. Pages call `orForbidden()` so an `AuditedDenial` becomes a real 403.

## Chart and notes (slice 3): `patients.ts`, `notes.ts`, `clinical.ts`

- `/dashboard/patients` lists clients by role scope; `/dashboard/patients/[id]` shows the chart, with each tab gated by RBAC (`getChart` only loads sections the role can read).
- Notes start as DRAFT, can be edited only by their author, and lock on signing (`signNote` stores a content hash and the signer's evidence). After signing, changes are addenda only.
- Signing a note with service lines calls `createClaimFromNote` (`billing.ts`), which creates a DRAFT claim. Video visits get modifier 95 and place of service 10 automatically.
- Psychotherapy notes are only visible to their author. They never produce a claim and are left out of the regular notes list.
- Always combine scope filters with `withScope()` (`$and`). Never spread them into the filter, because a spread can overwrite `patientId`.

## Scheduling (slice 4): `scheduling.ts`

- Booking runs in a transaction that writes the appointment, one `AppointmentSlot` per 15 minutes, and a `TelehealthSession` for video visits. The unique index on slots blocks double-booking.
- Cancellations with less than 24 hours' notice, and no-shows, are invoiced according to the client's signed Financial Responsibility Agreement. Staff can waive the fee and must give a reason.
- When a slot frees up, matching waitlist entries are offered for one-click booking.
- Checking in a video visit moves its telehealth session to IN_WAITING_ROOM.

## Telehealth (slice 5): `telehealth.ts`, `lib/telehealth.ts`

- `/dashboard/telehealth?date=YYYY-MM-DD` is the waiting room. Providers see their own visits; front desk and admins see everyone's. The page refreshes every 15 seconds.
- `/dashboard/telehealth/[id]` is a split screen: video tile and chart summary on the left, the visit's SOAP note on the right.
- Only the visit's provider can admit or end a visit.
  - Ending a visit records the duration, marks the appointment COMPLETED, and writes `sessionMinutes` to the draft note and its service lines.
- Time-based psychotherapy codes are checked against the visit length (90832: 16–37 min, 90834: 38–52, 90837: 53+). A mismatch shows a warning on the visit screen and on the claim.
- Video is mocked for now. `TELEHEALTH_PROVIDER=daily` throws until the Daily integration is written and a BAA is signed.

## Billing / RCM (slice 6): `rcm.ts`, `lib/clearinghouse.ts`

Claim lifecycle (transitions are enforced in `models/billing.ts`):

```
DRAFT ─mark ready (scrubber)→ READY_TO_SUBMIT ─submit→ SUBMITTED ─ERA→ PAID
                                                          └─denial→ DENIED ─correct + note→ SUBMITTED (resubmissionCount+1)
```

- **Queues** at `/dashboard/billing`: To review, Awaiting payer, Denials, Paid, All. Billing and admin roles also see patient A/R aging.
- **Scrubber** (`scrubIssues`) blocks a claim when:
  - no policy is attached,
  - a line has no diagnosis codes,
  - a line's charge is $0, or
  - a telehealth place of service has no telehealth modifier.

  Diagnosis codes are validated against the ICD-10 table.
- **Submission** goes through the clearinghouse adapter. Only the simulated adapter exists so far; it accepts every claim and returns a `SIM-…` reference. A resubmission requires a correction note, goes on the appeal record, and is sent as frequency code 7.
- **Remittance posting** (`postRemittance`): billing staff enter the 835/EOB response.
  - A payment must balance on every line: billed = paid + CO-45 + PR-3 copay + PR-1 deductible + PR-2 coinsurance.
  - One transaction updates the claim, writes the `RemittanceAdvice`, creates an itemized CLAIM_PATIENT_RESPONSIBILITY invoice published to the portal, and adds the deductible to the policy (capped at the plan total).
  - A denial records the CARC/RARC codes and moves the claim to the Denials queue.
- **Invoices** at `/dashboard/billing/invoices`: open, paid, or all, with 0–30 / 31–60 / 61–90 / 90+ day aging counted from the issue date.
- **Access:** providers can read claims for their assigned clients only. Front desk has no access to claims.

## Use cases covered

| Use case | Where it's verified |
|---|---|
| 2. Note → claim | `tests/db/chart-notes.test.ts`, browser |
| 3. Submit → CO-4 → GT resubmission → ERA → $50 invoice | `tests/db/billing-rcm.test.ts`, browser (CLM-2026-10043) |
| 5. Late cancellation and waitlist | `tests/db/scheduling.test.ts`, browser |
| 6. Psychotherapy note → 403 for billing | `tests/db/chart-notes.test.ts`, browser |
| Telehealth visit timing | `tests/db/telehealth.test.ts`, browser |

UC4 (portal payment and payment plan) is Phase 4.

## Seed data note

Both seeded claims now reference their insurance policy, and their service dates use the real visit times. Before this fix, a seeded claim couldn't be resubmitted and its date showed a day early in Eastern time.

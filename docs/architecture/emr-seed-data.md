# EMR Development Seed Data (Phase 2)

`npm run seed:emr` fills a **development** database with one connected story covering all six end-to-end use cases. Everything is fictitious.

```bash
npm run seed:emr                    # local MongoDB from .env.local
npm run seed:emr -- --reset         # drop EMR data + seeded accounts, then seed again
npm run seed:emr -- --allow-remote  # remote database whose name marks it as dev (e.g. abwellness_dev)
npm run import:icd10 -- ./icd10cm-codes-2027.txt   # optional: full ICD-10-CM code set from CMS
```

**Safety:** the script refuses production environments, refuses remote databases unless `--allow-remote` is passed *and* the database name says dev/test/staging/sandbox/demo (and nothing says "prod"), and refuses to seed twice without `--reset`. MongoDB must run as a replica set (Atlas always does; locally, start `mongod --replSet rs0` and run `rs.initiate()` once).

Needs `MONGODB_URI`, `ENCRYPTION_KEY`, and `BETTER_AUTH_SECRET`. All accounts share one password (`SEED_PASSWORD` from `.env.local`, or a new random one each run) and must enroll in MFA at first sign-in.

**Sign-in details** are written to `seed-accounts.local.md` in the project root after every seed. The file is git-ignored (`*.local.md`) and readable only by your user; never commit or share it.

## Accounts

| Role | Email | Person |
|---|---|---|
| SUPER_ADMIN | admin@example.com | Camila Reyes |
| PROVIDER | aris.thorne@example.com | Dr. Aris Thorne, PsyD (NPI 1234567893, CMS's example) |
| PROVIDER | jordan.ellis@example.com | Jordan Ellis, LCSW (for testing "assigned patients only") |
| BILLING_STAFF | billing@example.com | Marcus Bell, CPC |
| FRONT_DESK | frontdesk@example.com | Priya Shah |
| PATIENT | elena.vance@example.com | Elena Vance (Dr. Thorne) |
| PATIENT | david.morales@example.com | David Morales (Dr. Thorne; prefers Spanish) |
| PATIENT | sofia.lin@example.com | Sofia Lin (Jordan Ellis) |

## What each use case starts from

| Use case | Seeded state |
|---|---|
| 1. Onboarding & consents | Elena's encrypted SSN and member ID, PHQ-9 (8) and GAD-7 (13), sertraline, penicillin allergy, ID / insurance card / referral documents, all four mandatory consents signed with verifiable hashes |
| 2. Visit & SOAP note | BCBS verified ($30 copay, $500 deductible); completed 11/11 virtual initial evaluation with telehealth session (50 min); signed, locked SOAP note (F41.1, Z73.0); treatment plan signed by provider and patient; 11/25 follow-up booked with slots reserved |
| 3. Denial & resubmission | Elena's claim shows the full path: submitted with modifier 95 → denied CO-4 → corrected to GT → paid via ERA ($125 paid + $35 contractual + $50 patient = $210). David's claim (90834, F32.1) sits in the denial queue with CO-16 |
| 4. Payment & plan | Elena owes INV-2026-5001 ($50, from the claim) and INV-2026-5003 ($240 workshop package): ready to pay and to put on a 3 × $80 plan |
| 5. Late cancel & waitlist | David cancelled his 11/13 Friday in-person visit with 6 hours' notice; $75 fee invoice linked, per the signed policy (24 h / $75). Sofia waits for Dr. Thorne, in person, Fridays |
| 6. RBAC & audit | Billing, front desk, and both providers have accounts to test access rules; the audit chain starts clean with one seed entry |

Also seeded: 29 billing codes (ICD-10-CM, CPT, HCPCS with fees), 5 published consent templates (marked as drafts for legal review), Dr. Thorne's weekly schedule and visit types, secure messages, and the BAA / backup compliance registry.

## Corrections to the original brief's data

| Brief | Seed | Why |
|---|---|---|
| CPT 99204 for a PsyD's initial visit | 90791 | 99204 is an E/M code for physicians, NPs, and PAs; psychologists bill 90791 for a diagnostic evaluation |
| ERA paid $145 | $125 | $145 + $35 + $50 = $230, more than the $210 billed |
| NPI 1487920341 | 1234567893 | The brief's number could belong to a real clinician |
| Staff emails @abwellnessconsulting.com | @example.com | Test emails must never reach a real inbox |
| Private IPs in signatures | 203.0.113.x / 198.51.100.x | RFC 5737 documentation ranges |
| SSNs | 900-series | Never issued by the SSA |

CPT descriptions are short descriptors written for this project; the official CPT code set requires an AMA license.

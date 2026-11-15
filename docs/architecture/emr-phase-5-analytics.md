# EMR Phase 5: Executive Analytics and Compliance

## Slice 1: Analytics dashboard (`/dashboard/analytics`)

The service code is in `lib/services/analytics.ts`, the charts in `components/analytics/charts.tsx`, and the exports in `lib/analytics-report.ts` and `app/dashboard/analytics/export/route.ts`.

### Access

| Role | Sees | Export |
|---|---|---|
| Super admin, billing | Whole practice | CSV and PDF |
| Provider | Their own caseload (assigned clients, their claims, their schedule) | No |
| Front desk, clients | 403 | |

Every tab view is audited as a VIEW of `Analytics`, and every export as an EXPORT of `AnalyticsReport`. Results are aggregates only: counts, rates, dollar totals, and provider names. No client names or identifiers.

### Metrics and definitions

**Patients**

- **Registered:** all clients except deceased. Active = ACTIVE; inactive = INACTIVE or DISCHARGED.
- **New registrations:** count per calendar month in the practice time zone, with the month-over-month change.
- **Demographics:** age band (from date of birth), gender as recorded, and primary active payer (self-pay when there's none).
- **Appointment volume:** visits per month, excluding cancellations.
- **No-show rate (90 days):** no-shows ÷ (completed + no-shows).
- **Late cancellations (90 days):** late cancels ÷ visits that were due.
- **Retention:** clients with a completed visit 91–180 days ago who also completed one in the last 90 days.
- **Portal engagement (30 days):** clients with any audited portal activity ÷ clients with a portal account.

**Billing and revenue**

- **Claims:** submitted, paid, awaiting payer, denied. Paid rate = paid ÷ submitted.
- **First-pass denial rate:** submitted claims that were ever denied or rejected ÷ submitted.
- **A/R:** insurance A/R is the billed amount on submitted or accepted claims. Client A/R is the open invoice balances.
- **Reimbursement:** insurance paid ÷ billed, on paid claims. Allowed = billed − contractual adjustment.
- **Revenue received by month:** insurance payments by adjudication date, plus client payments net of refunds.
- **Revenue by provider and by CPT:** from paid claims and paid claim lines.
- **Annual summary:** charges, contractual adjustments, insurance paid, client payments, and total received for this year and last. **This is revenue only, not a P&L. Expenses aren't tracked in this system.**

**Operations**

- **Provider utilization (30 days):** booked visit hours ÷ hours of scheduled weekly availability (schedule exceptions aren't subtracted yet).
- **Productivity:** encounters (completed visits) and billable hours (completed visit durations).
- **Documentation completion:** completed visits with a note signed within 48 hours of the visit's end, plus the count of unsigned notes older than 48 hours, by provider.
- **Referral conversion (12 months):** new clients by `Patient.referralSource` who completed a first visit. `referralSource` is new and seeded for the demo clients; it needs a field in the registration flow.
- **Satisfaction:** the new post-visit survey (`VisitSurvey`, `lib/services/surveys.ts`).
  - Clients rate a completed visit 1–5 within 30 days, from the portal's appointment list. Comments are encrypted.
  - One rating per visit.
  - Reported as the average, response rate (ratings ÷ completed visits in the last 12 months), rating distribution, and average by provider.

### Charts

- Server-rendered SVG with no client JavaScript.
- **Palette** validated with the dataviz skill's validator in both modes, including against the app's navy dark surface: blue `#2a78d6` / `#3987e5` for single series, plus orange `#eb6834` / `#d95926` for the second series. Colors are defined as `--viz-series-*` tokens on `.viz-root` and switch with Once UI's `data-theme` and an OS-preference fallback.
- **Marks:** thin bars with 4 px rounded ends anchored to the baseline, a 2 px gap between stacked segments, and a recessive grid. Direct labels appear only on the latest value and the peak. Count axes use whole numbers.
- **Accessibility:** a legend only for the two-series chart. Every mark has a tooltip (`<title>`) and is keyboard-focusable. Every chart has a "Show data table" view. Half-width charts use a narrower `viewBox` so their text stays readable.

### Exports

- Each tab becomes a neutral `Report` that renders to:
  - **CSV:** UTF-8 with BOM for Excel. Cells that start with `=`, `+`, `-`, or `@` are prefixed so they aren't evaluated as spreadsheet formulas.
  - **PDF:** pdf-lib, Letter size, paginated.
- Both formats carry the same figures and are marked aggregate-only.

### Tests

`tests/db/analytics.test.ts` checks every headline number against the seeded data, role scoping, and survey rules (own visit, completed, once, within 30 days).

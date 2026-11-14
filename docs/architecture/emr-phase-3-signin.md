# EMR Phase 3 (slice 1): Sign-in, Two-Step Verification, App Shell

Status: **Built and tested end to end** · Branch: `feature/emr-core`

## Flows

```mermaid
flowchart TD
  A[/dashboard or /portal/] -->|no session cookie| L[/login]
  L -->|password OK, 2FA not set up| S[/account/security/setup]
  L -->|password OK, 2FA on| V[/login/verify]
  S -->|code confirmed + backup codes saved| H[/account]
  V -->|authenticator, emailed, or backup code| H
  H -->|staff| D[/dashboard]
  H -->|client| P[/portal]
```

| Page | What it does |
|---|---|
| `/login` | Email + password. Messages for wrong credentials, unverified email, rate limit, timeout, sign-out. Works in every site mode (coming-soon included). |
| `/account/security/setup` | Required for everyone. **Authenticator app** (QR + manual key) or **email codes**; a code must be confirmed before continuing; 10 single-use backup codes to download or copy. |
| `/login/verify` | Authenticator code, emailed code, or backup code; remembers the last method in that browser. |
| `/account` | Sends staff to `/dashboard`, clients to `/portal`. |
| `/dashboard` | Staff shell: menu filtered by role permissions ("Soon" for modules still to come), role-specific counts (appointments, notes to sign, denials, open balances, waitlist, eligibility), audit-chain status for the admin. |
| `/dashboard/audit` | Admin only: filter by client MRN, action, outcome, user email, dates; integrity check; CSV export that requires a reason. Viewing and exporting are themselves audited. |
| `/portal` | Client shell: next appointment, balance due, required forms still to sign. |

Signed-in pages carry the inactivity timeout (15 min staff, 30 min clients), `no-store` caching, and no analytics.

## What gets audited

| Event | Action |
|---|---|
| Password and (if enrolled) second step both passed | `LOGIN` |
| Password right, code still needed | `MFA_CHALLENGE` |
| Wrong password or code | `LOGIN_FAILED` (user id when the email matches an account; the email itself is never stored) |
| Sign-out | `LOGOUT` |
| Opening a page the role can't use | `UNAUTHORIZED_ACCESS_ATTEMPT` |
| Viewing the portal overview or the audit trail | `VIEW` |
| Audit CSV export | `EXPORT` with the reason |

## Notes

- **Email codes and backup codes.** Better Auth stores backup codes on the authenticator record, which email-only users don't have; setup creates that record (without finishing an app registration) so email users also get backup codes. Email-code enrollment relies on the account email being verified at sign-up.
- **Development email.** Codes for `@example.com` accounts print to the dev-server console. `EMAIL_TRANSPORT=console` does the same for local production builds and is refused on Vercel production.
- **Failed second-step attempts** are recorded as `ANONYMOUS` because the request carries only Better Auth's two-factor cookie, not the email. The preceding `MFA_CHALLENGE` entry identifies the account.

## Testing

`npm test` (77 tests) covers the audit rules. The browser flows were run against a production build on a separate database for: admin (authenticator), billing and front desk (email codes), provider, and client, including wrong codes, backup-code reuse, blocked pages, CSV export, sign-out, and a 390 px phone layout.

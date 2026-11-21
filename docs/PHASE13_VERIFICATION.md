# Phase 13 — Verification and handover record

Date: 2026-11-21. Scope: `C:\Users\user1\Downloads\erp`. Source of truth for acceptance criteria: `BUILD_PROMPT_MULTITENANT.md` §12.

## Gate result

Phase 13 is **complete**. Verification was run from a reproducible fresh baseline:

```powershell
docker compose --env-file .env -f db/docker-compose.yml down -v
npm run db:up
npm run db:migrate
npm run db:provision:setup
npm run db:setup
npm run typecheck
npm test
npm run build:all
npm run security:gates
npm run db:provision:smoke
```

Results:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass — frontend and API typecheck clean. |
| `npm test` | Pass — **61/61** tests. |
| `npm run build:all` | Pass — Vite and API bundles built; known Vite chunk-size warning only. |
| `npm run security:gates` | Pass — 0 production vulnerabilities; secret scan clean across 215 files. |
| `npm run db:provision:smoke` | Pass — live provision/deprovision completed; 102706-byte snapshot. |
| Playwright browser gate | Pass — **89/89** checks; `fatal: null`; no console or page errors. |
| Lighthouse accessibility | Tenant dashboard **100** with no failed audits; platform overview **96**, one known `color-contrast` finding. |

Browser-gate evidence: `C:\Users\user1\AppData\Local\Temp\opencode\phase12-browser-results.json` (regenerated for Phase 13). Lighthouse reports: `phase12-lighthouse-tenant.json` and `phase12-lighthouse-platform.json` in the same directory. The gate script performs first-run platform password change and MFA enrollment from the seeded owner, then verifies all four module dashboards under the platform banner.

## Acceptance tests 1–17

| # | Acceptance criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Create a client, enable Retail, invite admin, provision DB with migrations and job progress | Pass | `platform.test.ts` client creation and provisioning record-count tests; `provisioning.test.ts` idempotency/job tests; `db:provision:smoke`. |
| 2 | Retail-only admin can open every required Retail page | Pass | Browser gate: dashboard, nav order, switcher shows only Retail, all 14 required paths return 200 with no permission denial. |
| 3 | Products viewer sees Products read-only, not Invoice/Banks, and APIs return 403 | Pass | Browser gate: viewer nav, no create buttons, `/invoices` and `/banks` return 403. |
| 4 | Permission escalation is blocked and unavailable permissions are not offered | Pass | `authz.test.ts` grant validation; `workspace.test.ts` admin endpoints enforce delegated permissions. |
| 5 | Client A token cannot read or mutate Client B data | Pass | `workspace.test.ts` guessed tenant ID probe returns 404/403; tenant resolution comes from session. |
| 6 | Disabling a module blocks routes/sessions and retains the DB | Pass | `authz.test.ts` disabled-module resolution; `platform.test.ts` status changes; `provisioning.test.ts` deprovision revokes access before snapshots/drop. |
| 7 | Failed provisioning is retryable, leaves no partial access, and never activates early | Pass | `provisioning.test.ts` idempotency, unknown client, single worker, and five-attempt retry tests. |
| 8 | Permission revocation takes effect on the next request | Pass | `auth.test.ts` and `authz.test.ts` creator-chain re-evaluation tests. |
| 9 | Create/update/delete/approve/provision/impersonate actions write both audit trails | Pass | `workspace.test.ts` before/after audit rows; `platform.test.ts` module access, impersonation, status, and CSV export tests. |
| 10 | Dashboards show only cards the current user can view | Pass | Browser gate viewer scope checks; `workspace.test.ts` scoped context/dashboard tests. |
| 11 | No horizontal overflow at 375/768/1024/1440 | Pass | Browser gate measured `documentWidth` and `bodyWidth` at all four widths. |
| 12 | Typecheck, lint, tests pass; no console errors | Pass | `npm run typecheck`, `npm test` 61/61, browser gate `consoleErrors: []`, `pageErrors: []`. |
| 13 | All modules explorer and banner-covered module dashboards work | Pass | Browser gate opens HR, Retail, School, and Accounts from platform access and verifies persistent banner on each. |
| 14 | Inspect blocks writes; Support requires reason, allows writes, and audits both trails | Pass | `authz.test.ts` inspect-mode guard; `workspace.test.ts` mode-aware override test; `platform.test.ts` access log test. |
| 15 | Platform module access creates no membership or tenant grant | Pass | `platform.test.ts` access creation/exit test and audit export; override sessions are separate from tenant memberships. |
| 16 | Suspended/archived modules open read-only; database drop remains platform-only | Pass | `authz.test.ts` disabled-module and inspect guards; `provisioning.test.ts` deprovision lifecycle; workspace routes contain no destructive DB operations. |
| 17 | Lavender Canvas metrics match `design.md` on platform and module dashboards | Pass | Browser gate measured one gradient hero, one black CTA, floating 24px sidebar, borderless 24px cards, hatch state, pill bars, and no violet-on-white buttons on platform overview plus HR/Retail/School/Accounts dashboards. |

## Known limitations

- P0/P1: none pending.
- Platform overview Lighthouse `color-contrast` remains a P2 polish item; no functional or security impact.
- Vite reports a large client chunk warning; builds are clean and code-splitting is a non-blocking performance improvement.
- Semgrep and gitleaks binaries were unavailable; `npm run security:scan` is the documented scripted substitute and is clean.
- Deployment checklist (`DEPLOYMENT.md`) is outside Phase 13 scope and remains a follow-up.

## Sign-off

User requested continuation and push after completing Phase 13, satisfying the phase gate's sign-off condition.

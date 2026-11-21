# Lilac Office — Phased Build Plan

Execution rule: **one phase at a time**. Each phase ends with a verification gate, a short report,
and an explicit request to proceed to the next phase. No phase starts until approved.

Legend: `[ ]` pending · `[~]` in progress · `[x]` done

---

## Phase 0 — Recon and decisions `[x]`

- [x] Read `design.md`, `BUILD_PROMPT_MULTITENANT.md`, existing app.
- [x] Confirm stack: React 19 + Vite + Tailwind 4 (existing), Node 24 + Express + PostgreSQL 16.
- [x] Confirm tenancy: database-per-client-per-module.
- [x] Confirm security mapping (Flask/Supabase checklist → Node/Postgres equivalents).

**Gate:** decisions recorded, dependencies installed, no code changes to the existing UI.

---

## Phase 1 — System design and architecture `[x]`

Deliverables in `docs/`:

- [x] `ARCHITECTURE.md` — planes, request lifecycle, tenancy, provisioning, scaling, decisions.
- [x] `DATA_MODEL.md` — control plane, shared tenant tables, all four module schemas, seed shape.
- [x] `PERMISSIONS.md` — grammar, catalog, presets, delegation algorithm, platform override, test matrix.
- [x] `ROUTES.md` — platform routes, workspace routes, API surface, error codes, UI route map.
- [x] `SECURITY.md` — threat model, control matrix, 19-item checklist mapping, secrets policy.
- [x] `BUILD_PLAN.md` — this file, finalized.

**Gate:** passed — docs cross-checked (module tables, permission keys, aliases and routes agree);
four module schemas defined, two checklist items documented as N/A; approval to proceed recorded.

---

## Phase 2 — Control plane database `[x]`

Folder: `db/migrations/platform/`

- [x] `0001_extensions_and_helpers.sql` — `pgcrypto`, `citext`, `set_updated_at()`, append-only trigger.
- [x] `0002_identity.sql` — `platform_users`, `users`, `sessions`, `invite_tokens`.
- [x] `0003_tenancy.sql` — `plans`, `clients`, `modules`, `client_modules`, `memberships`,
      `roles`, `permissions`, `role_grants`.
- [x] `0004_operations.sql` — `provisioning_jobs`, `db_registry`, `usage_counters`,
      `audit_events`, `platform_events`, `rate_limit_buckets`, `platform_module_access`,
      `impersonation_sessions`.
- [x] `0005_rls_and_privileges.sql` — roles `lilac_platform_app`, `lilac_migrator`; revoke `PUBLIC`;
      RLS policies; append-only enforcement; grants. No plaintext secrets anywhere.
- [x] `db/docker-compose.yml` — PostgreSQL 16 with healthcheck and named volume.
- [x] `server/src/scripts/migrate-platform.ts` — checksummed, idempotent runner.

**Gate:** passed — `npm run db:up && npm run db:migrate` applied 5 migrations, second run skipped 5 with
no drift; `psql \dt` shows 21 tables matching `DATA_MODEL.md`; append-only UPDATE/DELETE/TRUNCATE are
rejected by trigger and privilege; `lilac_platform_app` is not superuser/createdb/createrole.

---

## Phase 3 — Tenant module databases `[x]`

Folder: `db/migrations/{_shared,hr,retail,school,accounts}/`

- [x] `_shared/0001_tenant_common.sql` — meta, module users, settings, audit, migrations,
      branches/warehouses/tax/numbering, updated-at + append-only triggers, RLS policy helper.
- [x] `hr/0001_schema.sql` + `0002_seed_defaults.sql` (leave types, departments, numbering).
- [x] `retail/0001_schema.sql` + `0002_seed_defaults.sql` (categories, numbering, banks, warehouses).
- [x] `school/0001_schema.sql` + `0002_seed_defaults.sql` (classes/fee heads).
- [x] `accounts/0001_schema.sql` + `0002_seed_defaults.sql` (chart of accounts, fiscal period).
- [x] `server/src/provisioning/migrate.ts` — per-tenant runner with advisory lock + checksums.

**Gate:** passed — all four sets applied to scratch databases and re-ran with zero applied and no
checksum drift; a tenant role saw 0 rows under a foreign `app.client_id` and cross-tenant inserts were
rejected; `__migrations` checksums match; no cross-database FKs or FDW extensions exist.

---

## Phase 4 — Backend foundation `[x]`

Folder: `server/src/{config,http,db,kms}/`

- [x] `config.ts` — zod-validated env, production guards (no dev secrets, secure cookies).
- [x] `http/errors.ts` — stable error codes, no stack/SQL leakage, request-id correlation.
- [x] `http/middleware.ts` — helmet/CSP, body limits, request id, logging with redaction.
- [x] `db/platform.ts` — service pool, query helper, transaction helper.
- [x] `db/registry.ts` — encrypted `db_registry` cache, lazy tenant pools, caps, idle eviction, health.
- [x] `db/tenant.ts` — `withTenantTx` sets `app.client_id` / `app.module_key` per transaction.
- [x] `kms/local.ts` — AES-256-GCM provider behind a `KmsProvider` interface (KMS/Vault seam).
- [x] `app.ts` / `index.ts` — composition, `/api/health`, graceful shutdown.
- [x] `scripts/dev.mjs`, `scripts/clean.mjs` — cross-platform dev runner.

**Gate:** passed — with Postgres up, the API boots and `/api/health` returns 200 with no secrets; with
an unreachable database and `BOOT_STRICT=false` it still boots and health returns `503 degraded`;
strict boot with the same failure exits 1. Production config rejects insecure cookies. KMS round-trip
and tamper rejection pass; the registry decrypted a real entry and `withTenantTx` returned 1 own row and
0 foreign rows; boot logs contain no secrets; typecheck passes.

---

## Phase 5 — Authentication and security controls `[x]`

Folder: `server/src/auth/`, `server/src/security/`

- [x] Argon2id hashing + rehash-on-login; password policy; breach-list seam.
- [x] TOTP (RFC 6238) enroll/verify; mandatory MFA for Super Admin; encrypted secret.
- [x] Access JWT (15 min) + rotating refresh session (30 days), revocation, session list/revoke.
- [x] httpOnly/Secure/SameSite cookies, signed double-submit CSRF, strict CORS.
- [x] Login/invite rate limits backed by `rate_limit_buckets`. Provisioning rate limits are part of
      Phase 7, when provisioning endpoints are introduced.
- [x] Account lockout, invite expiry, forced password change.
- [x] Security headers (CSP, HSTS, frame-ancestors, referrer-policy), upload validation
      (2 MB, magic bytes, EXIF strip, UUID names, malware-scan hook).
- [x] Separate platform/tenant realms with cross-realm rejection.
- [x] Impersonation start/stop service with reason, time box, audit. Platform API routes are in Phase 8.

**Gate:** passed — all 17 server tests pass; login/logout/refresh/CSRF/MFA/lockout and realm separation
are exercised; production cookie flags and fake-image rejection are verified; typecheck and `build:all`
pass. The Vite build emits a large-chunk warning.

**Known limitation:** password reset email delivery is not implemented. `/password/forgot` returns a
uniform `202`, and `/password/reset` currently uses invitation tokens. Add a mail adapter and dedicated
expiring reset tokens before relying on account recovery.

---

## Phase 6 — Tenancy and permission engine `[x]`

Folder: `server/src/{tenancy,authz}/`

- [x] `authz/catalog.ts` — full catalog, presets, wildcard expansion, validation.
- [x] `authz/resolver.ts` — creator-chain intersection, entitlement filter, cycle/depth guard, hash.
- [x] `authz/guard.ts` — route guard, inspect-mode write block, `PERMISSION_ESCALATION`.
- [x] `tenancy/resolve.ts` — token → membership → entitlement → registry → `TenantContext`.
- [x] `tenancy/context.ts` — typed request-scoped context; no globals.
- [x] `audit/` — platform + module audit writers, before/after diffs, redaction.
- [x] Unit tests for resolution, delegation, revocation propagation, wildcards and audit redaction.

**Gate:** passed — all 27 server tests pass, including database-backed creator-chain revocation,
cross-client denial, disabled-module denial, wildcard/preset expansion, inspect write blocking, and
audit redaction. Platform migration 0007 applied; `npm run typecheck`, `npm test`, `npm run db:migrate`,
and `npm run build:all` pass. Vite reports its existing large-chunk warning.

---

## Phase 7 — Provisioning service `[x]`

Folder: `server/src/provisioning/`

- [x] Idempotent job creation, advisory lock, step timeline in `provisioning_jobs.steps`.
- [x] Create database + least-privilege role + encrypted registry entry.
- [x] Run tenant migrations, create client admin membership/grants, and activate transactionally.
- [x] Failure handling: safe error code, retry with exponential backoff (max 5), no partial access.
- [x] Deprovisioning job (revoke → disable → snapshot → drop) out of request path.
- [x] Database-backed service tests cover idempotency, concurrent claims, retry limits, failed
      activation, deprovision ordering, and unknown-client rejection.
- [x] Local live smoke test provisions a temporary tenant, applies migrations, activates it,
      snapshots with `pg_dump`, deprovisions it, and removes its temporary records.

**Gate:** service tests and a live local provisioning/snapshot smoke test pass. The seed-client
provisioning path was exercised with real demo clients and modules in Phase 10.

---

## Phase 8 — Platform API `[x]`

Folder: `server/src/routes/platform.ts`

- [x] Auth: login/MFA/refresh/logout/sessions; `/api/platform/me`.
- [x] Overview metrics, clients CRUD, module enable/disable/archive, grants.
- [x] Client admins: invite, suspend, reset password, revoke sessions.
- [x] All-modules explorer (`/instances`) with status, health, version, record counts, users, activity.
- [x] Access enter/exit/log; impersonation; provisioning jobs list/retry.
- [x] Plans, usage, platform audit with filters/export, system health.
- [x] Route-level permission guard + audit on every mutation.

`0008_provisioning_grants.sql` persists requested initial module grants across asynchronous jobs.
Module access tokens are short-lived signed JWTs scoped to one client + module (`lilac_module_access`),
and `/access/enter` returns the token alongside the access record. Client archive is a soft delete that
archives the client and revokes tenant sessions and memberships.

**Gate:** passed at the API level — `server/tests/platform.test.ts` adds 10 database-backed route tests
covering login/MFA, client create/list/archive, invite + capacity, provisioning job execution and
record counts, module disable/reactivate/deprovision, access enter/exit/log, impersonation client
inference, platform-user lifecycle, and audit filters/CSV export. Full suite: 42 tests pass;
`npm run typecheck`, `npm run lint`, `npm run db:migrate` pass. Workspace-facing halves of acceptance
tests 5 and 13–16 (tenant resolver read-only/archived behavior, explorer banner) are re-exercised in
Phase 9.

---

## Phase 9 — Workspace API and retail flows `[x]`

Folder: `server/src/routes/workspace.ts`, `server/src/modules/*`, `server/src/workspace/*`

- [x] `/api/workspace/me` — client, enabled modules, effective permissions, mode.
- [x] Per-module dashboards with permission-filtered cards (hr, retail, school, accounts).
- [x] Retail: products, customers, vendors, stock, expenses, invoices + lines, sales view,
      duplicate bill, itemwise refund, banks, purchase returns, salesmen, purchases.
- [x] Transactional invoice → stock movement; refund approval → restock + balance; audit both.
- [x] HR: employees, attendance, leave approve; school: students/fees; accounts: journals/post.
- [x] Admin API: users invite (subset check), roles, company/branches/tax, audit.
- [x] Critical-flow tests (invoice → stock → refund, duplicate bill re-prices).

**Gate:** passed — acceptance tests 2, 3, 4, 6, 8, 10 pass; posting a journal with unbalanced lines
fails. `server/tests/workspace.test.ts` adds six database-backed route/flow tests covering tenant
scope, platform Inspect/Support overrides, generic CRUD/CSV, admin endpoints, and audited workflows.
Full suite: 48 tests pass; `npm run typecheck` passes.

---

## Phase 10 — Seed and demo data `[x]`

Folder: `server/src/scripts/seed*.ts`

- [x] Super Admin `owner@lilacoffice.app` (forced change + MFA enrollment), 3 plans.
- [x] Northwind (hr + retail), Beacon (school), Meridian (retail + accounts) provisioned end to end.
- [x] Client admins, scoped sub-admins, products-only viewer; consistent IDs/emails.
- [x] Volumes from `DATA_MODEL.md` §8; 12 months of history; deterministic (seeded PRNG).
- [x] Idempotent: re-running does not duplicate demo rows.

**Gate:** passed — fresh `db:down && db:up && db:setup` produces a complete demo. Removing the Docker
volume with `down -v` also removes the cluster-level provisioner role, so a truly clean volume reset
requires `npm run db:provision:setup` after `db:up` and before `db:setup`. Seeder verification checks
the owner flags, plan/client/module/user counts, products-only viewer grant, seeded volumes, and
12-month history. Full suite remains 48/48 and `npm run typecheck` passes.

---

## Phase 11 — Tests and security compliance `[x]`

- [x] Integration suite: permission escalation, cross-tenant isolation (guessed IDs), provisioning
      idempotency, Inspect/Support override, audit completeness, rate limits, CSRF.
- [x] `SECURITY.md` matrix signed off against every checklist item; N/A items justified.
- [x] Dependency audit (`npm audit`), secret scan of repo + `dist/`, bundle scan for keys/tokens.
- [x] Verify no secrets in logs; no stack traces in responses; DB roles least privilege.
- [x] CI workflow: typecheck, tests against a Postgres service, secret scan.

**Gate:** passed — `npm test` is 56/56. `npm run typecheck`, `npm run build:all`, and
`npm run security:gates` are clean. `npm audit --omit=dev` reports 0 vulnerabilities after upgrading
`sharp` to `^0.35.5`; `scripts/secret-scan.mjs` scans the repository and built bundles with no findings.
`SECURITY.md` records 17 implemented + 2 documented N/A. `semgrep` and `gitleaks` binaries were not
available, so their checks were replaced with the scripted scanner and documented explicitly.

---

## Phase 12 — Multi-tenant frontend wiring `[x]`

Folder: `src/` (existing design system kept)

- [x] API client, auth/tenant context, login + MFA screens, session expiry handling.
- [x] Platform console shell + overview, clients, client detail modules/users, all-modules explorer,
      provisioning jobs, plans, audit, access log.
- [x] Workspace shell: module switcher, permission-filtered nav, platform access banner,
      Inspect/Support mode switch with reason.
- [x] Retail nav exactly as specified + all screens; HR screens carried over from the prototype;
      school and accounts dashboards.
- [x] Admin screens (users, roles matrix, company, branches, tax, audit).
- [x] Wire real data for dashboard/approvals/invoices/refunds; keep Lavender Canvas tokens.
- [x] Responsive 375/768/1024/1440, keyboard/focus, loading/empty/error/permission-denied states.

**Gate:** passed — Playwright browser gate 85/85 checks, acceptance tests 2, 3, 11, 17 pass, no
console/page errors, Lighthouse accessibility 100 (tenant dashboard) and 96 (platform overview),
`npm run typecheck` clean, `npm test` 61/61, `npm run build:all` clean. Evidence:
`C:\Users\user1\AppData\Local\Temp\opencode\phase12-browser-results.json` and
`C:\Users\user1\AppData\Local\Temp\opencode\phase12-lighthouse-*.json`.

---

## Phase 13 — Verification and handover `[x]`

- [x] `npm run typecheck`, `npm test`, `npm run build:all` clean.
- [x] Run acceptance tests 1–17 end to end; record results in `docs/PHASE13_VERIFICATION.md`.
- [x] Update `README.md` with architecture, setup, demo accounts, provisioning, adding a module.
- [x] Final security checklist sign-off and known-limitations list.

**Gate:** passed — reproducible fresh setup from README, 61/61 tests, 89/89 browser checks, live
provisioning smoke, clean security gates, no pending P0/P1 items, user sign-off. Evidence:
`docs/PHASE13_VERIFICATION.md` and `docs/SECURITY.md` §7.

---

## Dependency graph

```text
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13
                         └──────┘   └──┘   └──────┘
                        (5/6 parallelizable, 8/9 need 6/7)
```

## Stop conditions

Stop and ask when:

- A phase changes the data model in a way that invalidates an earlier phase.
- A security checklist item cannot be met with the current stack (document the N/A instead of faking it).
- A design decision in `design.md` conflicts with the tenancy/permission requirements.
- A phase would modify the existing UI in a destructive way.

# Lilac Office — All Phases (Execution Tracker)

Single-file view of the build. Detailed gates and acceptance criteria live in
[`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md); design lives in [`docs/`](docs).

Rule: one phase at a time. Finish the phase, run its gate, report, then ask to proceed.

Status: `[x]` done · `[~]` in progress · `[ ]` pending

| # | Phase | Status |
| --- | --- | --- |
| 0 | Recon and decisions | `[x]` |
| 1 | System design and architecture | `[x]` |
| 2 | Control plane database | `[x]` |
| 3 | Tenant module databases | `[x]` |
| 4 | Backend foundation | `[x]` |
| 5 | Authentication and security controls | `[x]` |
| 6 | Tenancy and permission engine | `[x]` |
| 7 | Provisioning service | `[x]` |
| 8 | Platform API | `[x]` |
| 9 | Workspace API and retail flows | `[x]` |
| 10 | Seed and demo data | `[x]` |
| 11 | Tests and security compliance | `[x]` |
| 12 | Multi-tenant frontend wiring | `[~]` |
| 13 | Verification and handover | `[ ]` |

---

## Phase 0 — Recon and decisions `[x]`

- [x] Read `design.md`, `BUILD_PROMPT_MULTITENANT.md`, existing React app.
- [x] Confirm stack: React 19 + Vite + Tailwind 4; Node 24 + Express + PostgreSQL 16.
- [x] Confirm tenancy: database-per-client-per-module.
- [x] Map the Flask/Supabase security checklist to Node/Postgres equivalents.
- **Gate:** decisions recorded, dependencies installed, UI untouched.

## Phase 1 — System design and architecture `[x]`

- [x] `docs/ARCHITECTURE.md` — planes, request lifecycle, tenancy, provisioning, scaling.
- [x] `docs/DATA_MODEL.md` — control plane, shared tenant tables, 4 module schemas, seed shape.
- [x] `docs/PERMISSIONS.md` — catalog, presets, delegation algorithm, Inspect/Support override.
- [x] `docs/ROUTES.md` — auth/platform/workspace APIs, error codes, UI route map.
- [x] `docs/SECURITY.md` — threat model + 19-item checklist mapping.
- [x] `docs/BUILD_PLAN.md` — phases, gates, stop conditions.
- [x] `PHASES.md` — this tracker.
- **Gate:** docs cross-checked, no schema/route contradictions.

## Phase 2 — Control plane database `[x]`

- [x] `db/docker-compose.yml` — PostgreSQL 16, healthcheck, named volume.
- [x] `0001_extensions_and_helpers.sql` — `pgcrypto`, `citext`, updated-at + append-only triggers.
- [x] `0002_identity.sql` — `platform_users`, `users`, `sessions`, `invite_tokens`.
- [x] `0003_tenancy.sql` — `plans`, `clients`, `modules`, `client_modules`, `memberships`,
      `roles`, `permissions`, `role_grants`.
- [x] `0004_operations.sql` — `provisioning_jobs`, `db_registry`, `usage_counters`, `audit_events`,
      `platform_events`, `rate_limit_buckets`, `platform_module_access`, `impersonation_sessions`.
- [x] `0005_rls_and_privileges.sql` — `lilac_platform_app`, `lilac_migrator`, revoke `PUBLIC`, RLS,
      append-only enforcement, least-privilege grants.
- [x] `server/src/scripts/migrate-platform.ts` — checksummed idempotent runner.
- **Gate:** passed — `db:up` + `db:migrate` applied 5 migrations and a second run skipped all 5 with
  no drift; `lilac_platform_app` is not superuser/createdb/createrole and has only SELECT/INSERT on
  `audit_events`; trigger rejects UPDATE/DELETE/TRUNCATE; 21 tables match `DATA_MODEL.md`.

## Phase 3 — Tenant module databases `[x]`

- [x] `_shared/0001_tenant_common.sql` — meta, module users, settings, audit, migrations, branches,
      warehouses, tax codes, numbering, RLS helper.
- [x] `hr/0001_schema.sql` + `0002_seed_defaults.sql`.
- [x] `retail/0001_schema.sql` + `0002_seed_defaults.sql`.
- [x] `school/0001_schema.sql` + `0002_seed_defaults.sql`.
- [x] `accounts/0001_schema.sql` + `0002_seed_defaults.sql`.
- [x] `server/src/provisioning/migrate.ts` — per-tenant runner, advisory lock, checksums.
- **Gate:** passed — all four module sets applied to separate scratch databases and a second run
  skipped every file with matching checksums; tenant roles saw only their own rows and cross-tenant
  inserts were rejected by RLS; `__migrations` records match file checksums; no cross-database
  references or FDW extensions exist.

## Phase 4 — Backend foundation `[x]`

- [x] `server/src/config.ts` — zod env validation + production guards.
- [x] `server/src/http/` — error codes, helmet/CSP, body limits, request id, redacted logging.
- [x] `server/src/db/platform.ts` — service pool, query and transaction helpers.
- [x] `server/src/db/registry.ts` — encrypted registry, lazy tenant pools, caps, idle eviction, health.
- [x] `server/src/db/tenant.ts` — `withTenantTx` sets `app.client_id` / `app.module_key`.
- [x] `server/src/kms/local.ts` — AES-256-GCM provider behind `KmsProvider` interface.
- [x] `server/src/app.ts` + `index.ts` — composition, `/api/health`, graceful shutdown.
- [x] `scripts/dev.mjs`, `scripts/clean.mjs`.
- **Gate:** passed — strict boot with Postgres exposes a secret-free `/api/health` (200); with an
  unreachable database and `BOOT_STRICT=false` the API still boots and health returns `503 degraded`;
  strict boot with the same failure exits 1; production config rejects `COOKIE_SECURE=false`; KMS
  round-trip and tamper rejection pass; registry + `withTenantTx` returned 1 own row and 0 foreign rows;
  boot logs contain no secrets; typecheck passes.

## Phase 5 — Authentication and security controls `[x]`

- [x] Argon2id hashing, rehash-on-login, password policy.
- [x] TOTP enroll/verify, mandatory Super Admin MFA, encrypted secret.
- [x] Access JWT + rotating refresh sessions, revocation, session list/revoke.
- [x] httpOnly/Secure/SameSite cookies, signed double-submit CSRF, strict CORS.
- [x] Postgres-backed login/invite rate limits, lockout, invite expiry, forced password change.
- [x] CSP/HSTS/frame-ancestors/referrer-policy, upload validation (2 MB, magic bytes, EXIF strip, UUID).
- [x] Separate platform/tenant realms; cross-realm rejection; impersonation with reason + audit records.
- **Gate:** passed — 17 server tests, typecheck, and `build:all` pass; tests verify login/logout/refresh,
  CSRF, MFA, lockout, cross-realm rejection, invite expiry, impersonation audit, production cookie flags,
  and fake-image rejection. The API build passes; Vite reports its existing large-chunk warning.

## Phase 6 — Tenancy and permission engine `[x]`

- [x] `authz/catalog.ts` — catalog, presets, wildcard expansion and validation.
- [x] `authz/resolver.ts` — creator-chain intersection, entitlement filter, cycle/depth guard, hash.
- [x] `authz/guard.ts` — permission guard, inspect write block, escalation and last-admin helpers.
- [x] `tenancy/resolve.ts` — token → membership → entitlement → registry → `TenantContext`.
- [x] `tenancy/context.ts` — typed request-scoped context; no globals.
- [x] `audit/` — platform + module audit writers, before/after sanitization.
- [x] Unit tests: resolution, delegation, revocation propagation, wildcards and audit redaction.
- **Gate:** passed — 27 server tests pass; tests verify wildcard/preset expansion, delegated grant
  intersection and revocation without re-login, cross-client denial, disabled-module denial, inspect
  write blocking, and audit redaction. Platform migration 0007 applied; typecheck and `build:all` pass.
  Vite reports the existing large-chunk warning.

## Phase 7 — Provisioning service `[x]`

- [x] Idempotent job + advisory lock + step timeline.
- [x] Create database + least-privilege role + encrypted registry entry.
- [x] Run tenant migrations, create client admin membership/grants, and activate transactionally.
- [x] Failure handling: safe code, exponential backoff (max 5), no partial access.
- [x] Deprovisioning job (revoke → disable → snapshot → drop) outside the request path.
- [x] Database-backed service tests cover idempotency, concurrent claims, retry limits, failed
  activation, deprovision ordering, and unknown-client rejection.
- [x] Local live smoke test provisions a temporary tenant, applies migrations, activates it,
  snapshots with `pg_dump`, deprovisions it, and removes its temporary records.
- **Gate:** service tests and a live local provisioning/snapshot smoke test pass. Seed-client
  provisioning was exercised with real demo clients and modules in Phase 10.

## Phase 8 — Platform API `[x]`

Complete in `server/src/routes/platform.ts`: platform authentication/MFA, overview
(`clients_by_status`, `modules_by_status`), client CRUD incl. soft archive with session/membership
revocation, module enable/disable/archive/reactivate and deprovision, client-admin
invite/suspend/reactivate/reset/revoke, membership capacity checks, all-modules explorer with
health/version/record counts, provisioning jobs list/retry/cancel, plans/usage/health, audit filters
+ `total` + CSV export, module access enter/exit/log with a scoped `lilac_module_access` token,
impersonation (client inferred from a single membership), and platform-user invite/reset/suspend.
Migration `0008` carries custom initial grants through asynchronous provisioning.

- [x] Auth, `/api/platform/me`.
- [x] Overview, clients CRUD, module enable/disable/archive, grants.
- [x] Client admins invite/suspend/reset/revoke.
- [x] All-modules explorer with status, health, version, counts, users, activity.
- [x] Access enter/exit/log, impersonation, provisioning jobs, plans, usage, audit, health.
- **Gate:** API-level portions of acceptance tests 1, 5, 7, 9, 13–16 pass in
  `server/tests/platform.test.ts` (42 server tests total); workspace-facing halves of 5, 13–16 are
  re-exercised in Phase 9. `npm run typecheck`, `npm run lint`, `npm run db:migrate`, and `npm test`
  pass against PostgreSQL on port 55432.

## Phase 9 — Workspace API and retail flows `[x]`

- [x] `/api/workspace/me`, dashboards for 4 modules, permission-filtered cards.
- [x] Retail resources + invoice lines, sales view, duplicate bill, refunds, banks, purchases, returns.
- [x] Transactional invoice → stock → refund; audit both trails.
- [x] HR employees/attendance/leave, school students/fees, accounts journals/post.
- [x] Workspace admin: users (subset check), roles, company, branches, tax, audit.
- **Gate:** passed — acceptance tests 2, 3, 4, 6, 8, 10 pass; unbalanced journals are rejected;
  `server/tests/workspace.test.ts` covers tenant scope, platform Inspect/Support overrides, generic
  CRUD/CSV, admin endpoints, and critical flows. Full suite: 48 tests pass; `npm run typecheck` passes.

## Phase 10 — Seed and demo data `[x]`

- [x] Super Admin + 3 plans.
- [x] Northwind (hr + retail), Beacon (school), Meridian (retail + accounts) provisioned end to end.
- [x] Client admins, scoped sub-admins, products-only viewer.
- [x] Volumes from `DATA_MODEL.md` §8, 12 months of history, deterministic, idempotent.
- **Gate:** passed — fresh `db:down && db:up && db:setup` gives a complete demo; a fully clean volume
  additionally requires `db:provision:setup` after `db:up` because the provisioner role lives in the
  database volume. Re-running the seeder did not duplicate rows. Scoped viewer resolves to exactly
  `retail.products.view`; full suite remains 48/48 and `npm run typecheck` passes.

## Phase 11 — Tests and security compliance `[x]`

- [x] Integration suite: escalation, cross-tenant, provisioning idempotency, Inspect/Support,
      audit completeness, rate limits, CSRF.
- [x] `SECURITY.md` sign-off: 17 implemented + 2 documented N/A.
- [x] `npm audit`, secret scan of repo + `dist/`, log redaction check.
- [x] CI: typecheck, tests with Postgres service, secret scan.
- **Gate:** passed — `npm test` 56/56, `npm run typecheck` clean, `npm run build:all` clean,
  `npm run security:gates` clean (0 vulnerabilities; no secret findings), checklist 19/19 resolved
  with 2 documented N/A, bundle secret-free. `semgrep`/`gitleaks` were unavailable and are documented
  as a scripted-scanner substitution in `SECURITY.md` item 19.

## Phase 12 — Multi-tenant frontend wiring `[x]`

- [x] API client, auth/tenant context, login + MFA, session expiry.
- [x] Platform console: overview, clients, modules explorer, jobs, plans, audit, access log.
- [x] Workspace shell: module switcher, permission nav, Inspect/Support banner.
- [x] Retail exact nav + screens; HR carried over; school/accounts dashboards; admin screens.
- [x] Wire real data, loading/empty/error/permission-denied states, responsive 375–1440.
- **Gate:** passed — Playwright browser gate 85/85 checks, no console errors, no page errors;
  acceptance tests 2, 3, 11, 17 pass; Lighthouse accessibility 100 (tenant dashboard) and 96
  (platform overview); `npm run typecheck`, `npm test` (61/61), and `npm run build:all` clean.

## Phase 13 — Verification and handover `[x]`

- [x] `npm run typecheck`, `npm test`, `npm run build:all` clean.
- [x] Run acceptance tests 1–17, record results in `docs/PHASE13_VERIFICATION.md`.
- [x] README: architecture, setup, demo accounts, provisioning, adding a module.
- [x] Final security sign-off + known limitations.
- **Gate:** passed — reproducible fresh setup, 61/61 tests, 89/89 browser checks, 0 production
  vulnerabilities, clean secret scan, live provisioning smoke, no pending P0/P1, user sign-off.

---

## Current position

Phases 0–13 are complete. The multi-tenant ERP, verification record, handover documentation, and
Graphify connectivity artifacts are complete; the repository is ready for push.

# Lilac Office — System Architecture

Status: **Phase 13 complete** (API, provisioning, seed data, multi-tenant frontend, verification,
security gates, and handover documentation passed).
Visual source of truth: [`design.md`](../design.md). Build scope: [`BUILD_PROMPT_MULTITENANT.md`](../BUILD_PROMPT_MULTITENANT.md).

---

## 1. Planes

```text
                         ┌──────────────────────────────────────────────┐
  Browser (SPA)          │  Platform console      Client workspace       │
  React 19 + Vite  ──────▶  /platform/*            /w/:module/*           │
                         └───────────────┬──────────────────────────────┘
                                         │ HTTPS, httpOnly cookies
                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Stateless API (Express)                        │
│                                                                        │
│  security headers → request id → rate limit → auth → tenant resolve    │
│  → entitlement → permission → validation → handler → audit             │
│                                                                        │
│  auth/     sessions, CSRF, Argon2id, TOTP, lockout                      │
│  authz/    permission catalog, presets, delegation resolver             │
│  tenancy/  TenantContext, RLS transaction wrapper, pool registry        │
│  provisioning/  idempotent jobs, migrations, DB/role creation           │
│  audit/    append-only platform + module trails                        │
└──────────────┬──────────────────────────────────┬──────────────────────┘
               │ service role (control plane)      │ per-tenant least-privilege roles
               ▼                                  ▼
    ┌─────────────────────┐        ┌─────────────────────────────────────┐
    │  erp_platform       │        │ tenant_db (one per client × module) │
    │                     │        │                                     │
    │ platform_users      │        │ tenant_meta, module_users           │
    │ clients, plans      │        │ module_settings, module_audit       │
    │ modules,            │        │ __migrations                        │
    │ client_modules      │        │ business tables (RLS on client_id)  │
    │ memberships, roles  │        └─────────────────────────────────────┘
    │ role_grants         │                     ▲
    │ sessions, audits    │        ┌────────────┴────────────┐
    │ db_registry         │        │ tenant_<slug>_<module>_ │
    │ provisioning_jobs   │        │ <suffix> (PostgreSQL)   │
    └─────────────────────┘        └─────────────────────────┘
               ▲
               │ encrypted connection refs (KMS adapter)
        ┌──────┴───────┐
        │  KMS / Vault │  local AES-256-GCM in dev, KMS in prod
        └──────────────┘
```

### Hard boundaries

| Boundary | Rule |
| --- | --- |
| Platform vs tenant identity | `platform_users` and `users` are separate tables and separate login realms. A tenant user can never receive a platform token; platform routes reject `actor_type = tenant`. |
| Tenant vs tenant | Every tenant request resolves its database from the **session**, never from a URL or body. There is no shared business table. Guessing an ID from another tenant returns `404` because the query runs against the caller's own database. |
| Module vs module | Each module has its own database and migration stream. No cross-database foreign keys and no live joins. Cross-module reporting is API composition or ETL. |
| Audit vs business data | Audit tables are append-only (DB triggers reject `UPDATE`/`DELETE`). Module audit and platform audit both receive every mutation. |

---

## 2. Request lifecycle

```text
1. TLS / helmet          CSP, HSTS, frame-ancestors, referrer-policy, no sniff
2. Request id            x-request-id echoed, used in logs
3. Rate limit            Postgres fixed-window buckets (IP + route family)
4. Authenticate          lilac_session (access JWT, 15 min) or access token
                         → revoked? expired? account locked? realm allowed?
5. Resolve actor         platform user or tenant user (never both)
6. Resolve tenant        from token claims, then verify client_modules.status
                         - active     → continue
                         - provisioning → 503 MODULE_PROVISIONING
                         - disabled/archived → 403 MODULE_ARCHIVED / MODULE_NOT_ENABLED
7. Attach TenantContext  clientId, moduleKey, pool, membership, mode, perms
8. Authorize             permission ∈ effective permissions (server-computed)
                         platform override: inspect = GET only; support = writes
9. Validate              zod schema; identifier allowlists; parameterized SQL
10. Execute              tenant transaction sets app.client_id for RLS
11. Audit                module_audit + platform audit_events (append-only)
12. Respond              typed JSON; errors are stable codes, no SQL/stack
```

### Connections

- Control plane: one service pool using `lilac_platform_app`, max 10.
- Tenant: pool per `client_id + module_key`, lazy, max 4 per tenant, global cap 40, idle eviction 60s, health check query. Registry key is derived from the resolved context only.
- Each tenant transaction runs `SET LOCAL app.client_id` / `app.module_key` so RLS is a second line of defence even if a query forgets its tenant predicate.

---

## 3. Tenancy model

Database-per-client-per-module, as required.

```text
client_modules (control plane)
  northwind-studios  hr       tenant_northwind_studios_hr_a1b2c3
  northwind-studios  retail   tenant_northwind_studios_retail_d4e5f6
  beacon-academy     school   tenant_beacon_academy_school_g7h8i9
  meridian-traders   retail   tenant_meridian_traders_retail_j1k2l3
  meridian-traders   accounts tenant_meridian_traders_accounts_m4n5o6
```

- Database name is sanitized and carries a random suffix, so editable slugs cannot collide or be guessed usefully.
- Each tenant database gets a dedicated login role with `CONNECT`/`USAGE` only on that database. The role is not a superuser, cannot create databases/roles, and cannot see other tenant databases.
- Credentials live encrypted in `db_registry.secret_ref`; plaintext never enters logs, audit payloads, or the repo.
- Every business table carries `client_id`, `module_key`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`. RLS forces `client_id = app.client_id`.
- `user_id` values are opaque control-plane UUIDs. Membership is validated in the control plane on every request; no cross-DB FK.

### Tenant resolution rules

- Resolved from signed token claims (`client_id`, `active_module`), never from `req.params.clientId`.
- The requested module must be present in the actor's memberships **and** `client_modules.status = active`.
- A platform module-access token is scoped to exactly one `client_id + module_key` and is rejected by tenant-only endpoints and by other modules.
- Failure never falls back to a default tenant or module.

---

## 4. Provisioning

Provisioning is currently exposed as a service for the Phase 8 platform API and is idempotent by
`client_id + module_key`:

```text
1  transactionally create client_modules(status=provisioning) + provisioning_jobs
2  worker claims a due job; advisory locks serialize requests and tenant migrations
3  create deterministic tenant database + restricted application role
4  apply checksummed shared/module migrations and grant tenant-role access
5  encrypt the application connection string; create initial client-admin membership/grants
6  transactionally register the database and activate the module
7  on failure, store a safe error code and retry with exponential backoff (maximum 5 attempts)
```

- Each step is recorded in `provisioning_jobs.steps`; failed jobs remain inactive and can be retried
  until the five-attempt limit.
- Deprovisioning disables the module and revokes sessions/memberships before an out-of-band snapshot
  and database/role drop; successful cleanup archives the module and clears registry references.
- `npm run db:provision:worker` processes one batch and exits; deployment must schedule repeated runs.
- The worker requires `PROVISIONING_DATABASE_URL` with database/role creation privileges. Snapshots
  require a writable `BACKUP_DIR` (default `storage/backups`) and a compatible `pg_dump`.
- For local Compose development, `PG_DUMP_DOCKER_CONTAINER=lilac-postgres` runs the PostgreSQL
  image's `pg_dump` and copies the completed dump to `BACKUP_DIR`; see
  [`LOCAL_SETUP.md`](./LOCAL_SETUP.md).
- Provisioning is exposed through authenticated platform HTTP endpoints and processed by the
  provisioning worker; the workspace never receives destructive database operations.

---

## 5. Authentication and sessions

| Control | Implementation |
| --- | --- |
| Password hashing | Argon2id (`argon2`), memory 64 MiB, iterations 3, parallelism 1; rehash on login if parameters change |
| Super Admin MFA | TOTP (RFC 6238), encrypted secret, mandatory when `MFA_REQUIRED_PLATFORM=true` (default in production) |
| Access token | Signed HS256 JWT in `lilac_session` — `HttpOnly`, `Secure` in prod, `SameSite=Lax`, 15 min |
| Refresh token | 32-byte random, SHA-256 hashed at rest, rotating on every refresh, 30 days, revocable per session |
| CSRF | Signed double-submit cookie + `x-csrf-token` header on all cookie-authenticated mutations |
| Lockout | 5 failed logins → 15-minute lock, counters in control plane |
| Separate realms | `platform` and `tenant` session cookies are distinct; endpoints check realm |
| Impersonation | explicit reason, time-boxed, audited, banner in UI, destructive platform actions blocked |
| Session management | list/revoke sessions, revoke-all on password reset, invite expiry |

Access token claims:

```json
{
  "sub": "user-uuid",
  "sid": "session-uuid",
  "actor_type": "tenant",
  "realm": "tenant",
  "client_id": "client-uuid",
  "memberships": [{ "module_key": "retail", "role": "sub_admin", "permissions_hash": "..." }],
  "active_module": "retail",
  "platform_override": false,
  "impersonated_by": null
}
```

Permissions are **never** trusted from the token. The server recomputes effective permissions from the control plane on every request, which is what makes revocation immediate.

---

## 6. Authorization

Full model in [`PERMISSIONS.md`](./PERMISSIONS.md). Summary:

```text
effective(tenant membership) =
    direct role_grants
  ∩ effective(creator membership)        // recursive, depth ≤ 4
  ∩ permissions entitled by enabled modules

effective(platform super admin, module access) =
  all module permissions  (no tenant grants, no membership row)
  + inspect mode is read-only, support mode is read/write with a recorded reason
```

- Delegation is enforced server-side on every user create/edit: `requested ⊆ creator_effective`.
- Escalation returns `403 PERMISSION_ESCALATION`.
- A sub-admin cannot edit their own grants and cannot remove the last client admin.
- Platform keys (`platform.*`) are never delegable to tenant users.

---

## 7. Audit and observability

- `audit_events` (control plane): actor type/id, client, module, action, entity, before/after, IP, user agent, `platform_override`, request id, timestamp. Append-only trigger.
- `module_audit` (tenant DB): actor id, actor type, action, entity, entity id, before/after diff, reason, `platform_override`, request id, timestamp. Append-only trigger.
- Access log: `platform_module_access` records Inspect/Support entry, reason, mode, start/end, revoked; periodically exported.
- Logs redact secrets, password hashes, tokens, TOTP secrets, phone numbers, and connection strings. `sanitizeForLog()` is the only logging helper.
- Health: `GET /api/health` (no secrets), DB registry health, pool usage, failed jobs.

---

## 8. Scaling and operations

- API is stateless; sessions and rate limits live in Postgres so horizontal replicas agree.
- Tenant pool registry caps total connections and evicts idle pools; for very large client counts, shard `db_registry` by `hash(client_id)` and route through a registry service.
- Backups: per-tenant PITR, encrypted, restore-tested into staging. Never restore a tenant into another tenant's database name.
- Migrations versioned per module (`db/migrations/<module>/NNNN_*.sql`) and recorded in each tenant `__migrations`.
- Per-tenant quotas and rate limits come from the plan (`plans`, `usage_counters`).
- Errors use stable codes (`UNAUTHENTICATED`, `FORBIDDEN`, `PERMISSION_ESCALATION`, `MODULE_NOT_ENABLED`, `MODULE_PROVISIONING`, `MODULE_ARCHIVED`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`). Stack traces and SQL never reach clients.

---

## 9. Deliberate decisions

1. **Opaque server sessions + JWT access tokens.** The JWT gives the required claim shape; the session row makes revocation immediate and audit-friendly.
2. **Postgres as rate-limit store.** No Redis dependency for the single-node deployment; the store interface is isolated so Redis can replace it without touching routes.
3. **RLS in addition to DB-per-tenant.** Isolation by database is primary; RLS protects against a missing predicate in a future query.
4. **`administration.*` is client-wide.** Administration is a capability surface shared by enabled modules, not a fifth module database. This matches the retail nav requirement and keeps grants simple.
5. **Platform access is a scoped token, not a membership.** It cannot leak into tenant grant tables, and it expires.
6. **No shared cross-tenant reporting database yet.** Reporting is composed per module through the API; an ETL read model is the documented seam for later.

---

## 10. Repository map

```text
db/
  docker-compose.yml               PostgreSQL 16
  migrations/platform/*.sql        control plane
  migrations/<module>/*.sql        tenant schemas (applied per tenant DB)
docs/                              architecture, data model, permissions, security
server/
  src/config.ts                    env validation (zod)
  src/app.ts, src/index.ts         HTTP composition
  src/http/                        errors, middleware, response helpers
  src/db/                          control pool, registry, tenant transactions
  src/auth/                        password, TOTP, sessions, CSRF, auth middleware
  src/authz/                       catalog, presets, resolver, guard
  src/tenancy/                     context + resolver
  src/provisioning/                db/role creation, migration runner, jobs
  src/audit/                       append-only audit writers
  src/routes/platform.ts           super admin console API
  src/routes/workspace.ts          tenant module API
  src/modules/                     per-module resources + dashboards
  src/scripts/                     migrate, seed, provision
  tests/                           permission, isolation, provisioning tests
scripts/dev.mjs                    runs Vite + API together
src/                               existing React design-system prototype (Phase 2 wiring)
```

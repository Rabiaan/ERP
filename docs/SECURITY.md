# Lilac Office — Security Model and Checklist Compliance

The original checklist came from a different stack (Flask + React + Supabase) and has been removed.
This document maps **all 19 items** to the actual Node/Express/PostgreSQL multi-tenant build, marks the two
items with no equivalent flow as N/A with justification, and defines the verification gate for each.
The Phase 11 gate was executed and recorded in §5; the Phase 13 final sign-off is recorded in §7.

---

## 1. Threat model

| Threat | Impact | Primary controls | Verified in |
| --- | --- | --- | --- |
| Cross-tenant read/write by guessed ID | Critical | DB-per-client-per-module, tenant resolved from session only, `client_id` predicate + forced RLS, `404` on misses | P6, P11 |
| Privilege escalation via user management | Critical | Creator-chain intersection, server-side subset check, no self-edit, last-admin guard | P6, P11 |
| Super Admin override abuse | Critical | Inspect read-only default, Support needs reason + confirmation, 30-min scoped token, dual audit, no DB drops from workspace | P7, P8, P11 |
| Tenant DB credential theft | Critical | KMS-encrypted `secret_ref`, least-privilege per-tenant roles, no secrets in logs/bundle/repo | P2–P4, P11 |
| Session theft / CSRF | High | HttpOnly/Secure/SameSite cookies, short access TTL, rotating refresh, signed CSRF, revocation | P5, P11 |
| Password brute force / credential stuffing | High | Argon2id, login rate limits, 5-attempt lockout, mandatory platform MFA, generic errors | P5, P11 |
| SQL injection / filter injection | High | Parameterized queries only, identifier allowlists, no string-built SQL, schema validation | P4, P9, P11 |
| Stored XSS | High | No `dangerouslySetInnerHTML`, React escaping, strict CSP, sanitized rich text if ever added | P5, P11 |
| CSV formula injection | Medium | Prefix `'` on cells starting with `= + - @ \t \r`, quote/escape, correct MIME | P9, P11 |
| Malicious upload | High | 2 MB cap, magic-byte allowlist, image re-encode (EXIF stripped), UUID filenames, scan hook, private storage | P5, P11 |
| Provisioning race / partial module | High | Advisory lock, idempotent job, step timeline, active only after full success, retry cap | P7, P11 |
| Destructive action by accident | High | Confirmation + typed confirmation, reason, audit, no hard delete in request path | P8, P9 |
| Secret leakage in logs/errors | High | Redaction helper, stable error codes, no stack/SQL to clients, request-id correlation | P4, P5, P11 |
| Dependency compromise | Medium | Lockfile, `npm audit`, pinned versions, minimal deps, CI scan | P11 |
| Misconfigured production | High | Env validation, secure cookie enforcement, no debug, CSP/HSTS, health endpoint | P4, P5, P11 |

Out of scope for this build (documented seams): real email/SMS delivery, payment gateways, malware
scanning vendor integration, real KMS/Vault (local AES-GCM provider used in dev behind the same interface).

---

## 2. Data classification

| Class | Examples | Handling |
| --- | --- | --- |
| Secret | DB passwords, KMS keys, TOTP secrets, session/refresh tokens, CSRF secret | KMS-encrypted or hashed at rest; never logged; never returned by any API |
| Sensitive personal | Salary, CNIC, passport, phone, address, medical/leave reason, guardian data | Tenant-isolated, permission-gated, redacted in logs, no cross-tenant aggregation |
| Business | Invoices, journals, stock, students, employees | Tenant-isolated, audited on mutation |
| Public | Module catalog, plan names | Safe to expose to authenticated users |

Phone numbers, emails in bulk, and salary fields are never written to application logs. Audit payloads
store only the changed business fields needed for the trail.

---

## 3. Checklist mapping (19 items)

### 1. Default-deny gate
**Requirement:** role decorators on every `/api` route; a route without an explicit decorator returns 401.

**Implementation:** every API router is mounted behind `requireSession` unless it is in the explicit
`PUBLIC_ROUTES` allowlist (health, auth login/MFA/refresh, invite accept, password reset). Route
registration goes through a typed `route()` helper that requires a permission key or `public: true`.
A test enumerates the Express router stack and fails if any non-public route lacks a guard.

**Status:** passed (P11).

### 2. Object-level authorization
**Requirement:** verify ownership/permission server-side for every object access (prevent IDOR).

**Implementation:** resource handlers always query with `WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`
inside the tenant transaction. Cross-tenant IDs produce `404`, never `403` with existence leaks.
Workflow endpoints re-load the object and check its state before acting (`approved` cannot be approved again).

**Status:** passed (P11).

### 3. Row Level Security
**Requirement:** deny `anon` and `authenticated` roles, force access through `service_role`.

**Adaptation:** Supabase roles do not exist here. The equivalent is: `REVOKE ALL ... FROM PUBLIC`, no login
role has blanket table access, the control plane app role has only the required DML, each tenant database
has a dedicated least-privilege role, and every tenant table has `ENABLE` + `FORCE ROW LEVEL SECURITY`
with a policy `client_id = app.current_client_id()`. `app.client_id` is set per transaction with
`SET LOCAL`. Migration/seed roles are separate from runtime roles.

**Status:** passed (P11).

### 4. Email verification
**Requirement:** not applicable (no email flow); document the decision.

**Decision:** N/A — this build has no outbound email delivery. Accounts are created by invitation only.
Invite tokens are 32 bytes, stored SHA-256-hashed, expire in 72 hours, are single-use, and are bound to
the invitee email. Password reset uses the same token discipline. The admin UI shows "invite link copied"
instead of claiming an email was sent. If email is added later, verification must be implemented before
enabling self-service signup.

**Status:** N/A, documented.

### 5. Password hashing
**Requirement:** bcrypt cost factor ≥ 12; never plaintext.

**Implementation:** Argon2id via the `argon2` package — memory 64 MiB, time cost 3, parallelism 1
(stronger than bcrypt 12 for this use). Passwords are never logged, never returned, and rehashed on login
when parameters change. Minimum 12 characters; breached-password check hook documented.

**Status:** passed (P11).

### 6. Session cookies
**Requirement:** `HttpOnly` cookies; never tokens in `localStorage`.

**Implementation:** access/refresh tokens live only in `HttpOnly`, `Secure` (prod), `SameSite=Lax`
cookies. The SPA stores no tokens in `localStorage`; only non-sensitive UI preferences may be persisted.
CSRF cookie is readable by design but signed and useless without the session.

**Status:** passed (P11).

### 7. No secrets in bundle
**Requirement:** grep the built `dist/` for key/token patterns after every build.

**Implementation:** frontend build receives no server secrets; only `VITE_*` public values.
`npm run security:scan` greps the repository plus `dist/` and `dist-server/` for `postgres://`,
`BEGIN PRIVATE KEY`, OpenAI/AWS/Slack tokens, JWT-shaped strings, and literal secret assignments. The
dev seed secret is never imported by frontend code.

**Status:** passed (P11).

### 8. Secrets hygiene
**Requirement:** keep secrets untracked, purge from history, rotate anything committed.

**Implementation:** `.env` is gitignored; `.env.example` contains placeholders only. Generated application
secret, tenant DB passwords, TOTP secrets, and KMS keys are never committed. A scripted secret scan
(`npm run security:scan`) is part of the Phase 11 gate and CI. Rotation procedure is documented in §6.

**Status:** passed (P11).

### 9. Log redaction
**Requirement:** never log raw secrets, tokens, or phone numbers in plaintext.

**Implementation:** a single `log()` helper sanitizes keys matching
`password|secret|token|authorization|cookie|mfa|phone|connection|dsn`, redacts emails to `a***@domain`,
and truncates bodies. Request logging records method, route pattern, status, duration, actor id, request
id — never bodies for auth routes.

**Status:** passed (P11).

### 10. Filter injection
**Requirement:** avoid unsafe filters; sanitize all query input.

**Implementation:** no ORM string filters. Query parameters are validated by zod, sort columns are checked
against a per-resource allowlist, and every value is a bind parameter. `ILIKE` search uses an escaped
pattern (`%`, `_`, `\`). No user string ever becomes an identifier.

**Status:** passed (P11).

### 11. Input validation
**Requirement:** schemas on every endpoint, including payments, plan fees, integrations, uploads.

**Implementation:** zod schemas on params, query, and body for every route. Body size capped at 256 KB
JSON. Numeric ranges, dates, enums, UUIDs, and cross-field rules (end ≥ start, quantity > 0,
debit = credit) are enforced. Uploads validated separately (§13). Unknown keys are stripped.

**Status:** passed (P11).

### 12. XSS / CSV injection
**Requirement:** no `dangerouslySetInnerHTML`; sanitize CSV exports; set a CSP header.

**Implementation:** React escaping everywhere; a grep gate forbids `dangerouslySetInnerHTML` and inline
event handlers. CSV cells that begin with `= + - @` (or tab/CR) are prefixed with `'`; all cells are
quoted and escaped. Helmet sets a strict CSP: default-src `'self'`, script-src `'self'` (no
`unsafe-inline`; Vite dev uses a documented relaxed policy), object-src `'none'`, base-uri `'self'`,
frame-ancestors `'none'`.

**Status:** passed (P11).

### 13. Upload validation
**Requirement:** decode with Pillow, strip EXIF, 2 MB limit, UUID filenames.

**Adaptation:** `sharp` decodes and re-encodes images (which strips EXIF); PDFs are accepted only with a
valid `%PDF-` header. Magic bytes are checked before storage, size is capped at 2 MB, filenames are
`<uuid>.<ext>` with the extension derived from the detected type, files are written outside the web root,
and a `scanFile()` hook is the seam for ClamAV/VirusTotal. Type allowlist: PNG, JPEG, WebP, PDF.

**Status:** passed (P11).

### 14. WhatsApp bridge auth
**Requirement:** shared-secret header, bind to `127.0.0.1` only.

**Decision:** N/A — there is no WhatsApp bridge or messaging integration in this build. Non-goal per the
build prompt. If added, it must use a shared-secret header, bind to loopback, and be excluded from the
public router; this is documented in the integration seams.

**Status:** N/A, documented.

### 15. Rate limiting
**Requirement:** use a store backed by Redis/Postgres, not in-memory counters.

**Implementation:** Postgres fixed-window buckets in `rate_limit_buckets`, updated with a single atomic
upsert (`window_start`, `count`), shared by all API replicas. Buckets: login (IP + email), refresh,
invite, provisioning, upload, general API. `429 RATE_LIMITED` with `Retry-After`. The store is behind an
interface so Redis can replace it.

**Status:** passed (P11).

### 16. Security headers
**Requirement:** CSP, HSTS, `frame-ancestors`, `Referrer-Policy`.

**Implementation:** helmet with HSTS (1 year, includeSubDomains, preload in prod), CSP as in §12,
`frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options:
nosniff`, `Cross-Origin-Opener-Policy`, `Permissions-Policy` disabling camera/mic/geolocation. CORS is
same-origin only; no `*` with credentials.

**Status:** passed (P11).

### 17. Production runtime
**Requirement:** `debug=False` under gunicorn.

**Adaptation:** production runs the bundled Node server (`npm run build:all && npm start`) with
`NODE_ENV=production`, no watch mode, no stack traces in responses, secure cookies enforced, and a
non-root container user. The server refuses to boot in production with default/missing secrets,
`COOKIE_SECURE=false`, or `MFA_REQUIRED_PLATFORM=false` unless an explicit override env is set.

**Status:** passed (P11).

### 18. Dependency patching
**Requirement:** keep dependencies updated; run `pip-audit` and `npm audit`.

**Implementation:** single lockfile, `npm audit --omit=dev` in CI, Dependabot config for npm and GitHub
Actions, pinned major versions, minimal runtime dependencies. High/critical advisories block the release
gate. Phase 11 upgraded `sharp` to `^0.35.5` to clear the remaining advisory.

**Status:** passed (P11).

### 19. Security scanning
**Requirement:** run `bandit`, `semgrep`, and `gitleaks`; resolve findings.

**Adaptation:** Node stack → `npm run security:gates` (`npm audit --omit=dev` plus a scripted repository
and bundle secret scan), `npm run typecheck`, the integration suite, and static checks for
`dangerouslySetInnerHTML`, `eval`, and secrets in `dist/`. The `semgrep` and `gitleaks`
binaries are unavailable in this environment and there is no git history in the workspace, so the
scripted working-tree/bundle scanner is the documented substitute. Findings are triaged; unresolved high
findings block release.

**Status:** passed (P11; adapted tooling).

---

## 4. Authorization and tenancy invariants (security-critical)

1. Tenant is resolved from the signed session, never from `:clientId`, headers, or bodies.
2. `client_modules.status` gates every request; suspended/archived modules cannot be read or written.
3. Effective permissions are recomputed per request; the JWT is identity, not authority.
4. Super Admin override is explicit, scoped, time-boxed, read-only by default, and audited in both trails.
5. Tenant and platform realms reject each other's tokens.
6. Every mutation writes a before/after audit row; audit tables reject `UPDATE`/`DELETE`.
7. Tenant database credentials are encrypted; the API never returns them.
8. Provisioning and deprovisioning are jobs, never inline destructive work.
9. No cross-tenant fallback exists in any error path.
10. Cross-tenant probes are automated tests, not manual checks.

---

## 5. Verification gates

Phase 11 sign-off recorded 2026-11-20: 17 implemented items passed, 2 documented N/A. No assumed
items. The `semgrep`/`gitleaks` substitution in item 19 is explicit above. Phase 13 re-ran the full
gate from a fresh baseline and added the results recorded in §7.

| Gate | Command / action | Latest result |
| --- | --- | --- |
| G0 build | `npm run build:all` | Pass — Vite and API bundles built. |
| G1 static | `npm run typecheck` | Pass — zero errors, frontend + server. |
| G2 tests | `npm test` | Pass — 61/61, including escalation, isolation, provisioning, audit, rate limits, CSRF, production headers. |
| G3 audit | `npm run security:audit` | Pass — 0 vulnerabilities after `sharp` upgrade to `^0.35.5`. |
| G4 secrets | `npm run security:scan` | Pass — no findings across repo and built bundles; scripted substitute for unavailable scanners. |
| G5 headers | integration assertions | Pass — CSP, HSTS, `frame-ancestors`, referrer, `nosniff`, `x-frame-options` on production health response. |
| G6 cookies | production-mode test | Pass — HttpOnly, Secure, SameSite on session cookies; insecure production config rejected. |
| G7 tenancy | cross-tenant probe suite | Pass — guessed tenant IDs return `404`; no cross-client data exposed. |
| G8 RBAC | escalation suite | Pass — escalation/delegation denials, creator-chain revocation, no grant materialized. |
| G9 uploads | fake image / oversized file | Pass — fake image rejected; valid image metadata stripped. |
| G10 audit | mutate, then query both trails | Pass — actor, before/after, and override flag present in platform and tenant trails. |
| G11 runtime | `NODE_ENV=production` boot checks | Pass — refuses insecure cookie config. |
| G12 UI | static grep + Lighthouse | Pass — no `dangerouslySetInnerHTML` or `eval(` in `src/`; tenant accessibility 100, platform 96. |

---

## 6. Operations

- **Rotation:** rotate `APP_SECRET` (invalidates all sessions), `KMS_LOCAL_KEY` (re-encrypt registry
  entries with a dual-read window), tenant DB passwords (ALTER ROLE + registry update job), and
  super-admin TOTP secrets (re-enroll). Every rotation writes an audit event.
- **Backups:** per-tenant encrypted backups with PITR; restore tested quarterly into staging;
  retention enforced; deleted tenants follow a documented retention window before drop.
- **Incident response:** revoke sessions, disable module/client, preserve audit tables (append-only),
  rotate secrets, export access log for the affected window.
- **Access reviews:** monthly review of `platform_users`, `memberships`, and overrides; last-admin rule
  prevents lockout.
- **Least privilege:** runtime database roles cannot create databases/roles or read `pg_authid`; the
  migration role is used only by jobs.

---

## 7. Phase 13 final sign-off

Date: 2026-11-21. Re-verified after a full local Docker volume reset and clean seed setup.

| Gate | Result |
| --- | --- |
| `npm run typecheck` | Pass — frontend and API. |
| `npm test` | Pass — 61/61. |
| `npm run build:all` | Pass — Vite and API bundles; known chunk-size warning only. |
| `npm run security:audit` | Pass — 0 production vulnerabilities. |
| `npm run security:scan` | Pass — 215 files scanned, no secrets. |
| `npm run db:provision:smoke` | Pass — live provision/deprovision with snapshot. |
| Browser gate | Pass — 89/89, no console or page errors. |
| Lighthouse | Tenant 100; platform 96 with one known `color-contrast` finding. |

Checklist status remains 17 implemented, 2 documented N/A. No P0/P1 issues are pending. Known
limitations are tracked in `docs/PHASE13_VERIFICATION.md`: the platform color-contrast polish item,
Vite chunk-size warning, scripted substitute for unavailable `semgrep`/`gitleaks`, and the
out-of-scope deployment checklist.

Final sign-off: **approved for handover and push** by explicit user instruction after Phase 13.

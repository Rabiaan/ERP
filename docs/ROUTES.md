# Lilac Office — Routes and API Surface

Three surfaces: **auth**, **platform control plane**, **tenant workspace**. All JSON responses use one
envelope and one error shape. Tenant routes never accept a client id from the URL or body.

---

## 1. Conventions

```jsonc
// success
{ "data": { }, "meta": { "page": 1, "per_page": 25, "total": 48 } }

// error
{ "error": { "code": "PERMISSION_ESCALATION", "message": "Human readable.",
             "details": [{ "path": "permissions", "message": "..." }],
             "request_id": "req_..." } }
```

| Code | HTTP | Meaning |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | Missing, expired, or revoked session |
| `MFA_REQUIRED` | 401 | Password accepted, TOTP challenge required |
| `ACCOUNT_LOCKED` | 423 | Too many failed attempts |
| `FORBIDDEN` | 403 | Authenticated, missing permission or inspect-mode write |
| `PERMISSION_ESCALATION` | 403 | Requested grants exceed the creator's rights |
| `MODULE_NOT_ENABLED` | 403 | Module not entitled or suspended |
| `MODULE_ARCHIVED` | 403 | Archived module, read-only inspect only |
| `MODULE_PROVISIONING` | 503 | Module database not ready |
| `NOT_FOUND` | 404 | Object does not exist **in the caller's tenant** |
| `VALIDATION_ERROR` | 422 | Zod/schema failure |
| `CONFLICT` | 409 | Duplicate key, last admin, invalid state transition |
| `RATE_LIMITED` | 429 | Bucket exhausted, `Retry-After` set |
| `INTERNAL` | 500 | Unexpected; no stack or SQL in the body |

Cookies (all `HttpOnly`, `Secure` in production, `SameSite=Lax` unless noted):

| Cookie | Lifetime | Purpose |
| --- | --- | --- |
| `lilac_platform_at` | 15 min | Platform access JWT |
| `lilac_platform_rt` | 30 days | Platform refresh token (rotating) |
| `lilac_tenant_at` | 15 min | Tenant access JWT |
| `lilac_tenant_rt` | 30 days | Tenant refresh token (rotating) |
| `lilac_module_access` | 30 min | Super Admin Inspect/Support token |
| `lilac_csrf` | session | Non-HttpOnly signed double-submit token |

Every cookie-authenticated mutation requires `x-csrf-token`. Bearer tokens (tests, service calls) skip CSRF
but still pass authorization.

---

## 2. Auth API (public + session)

```text
GET    /api/health                              liveness + db ping (no secrets)

POST   /api/auth/csrf                           issue signed CSRF cookie

POST   /api/auth/:realm/login                   { email, password }
POST   /api/auth/:realm/mfa/verify              { challenge_token, code }
POST   /api/auth/:realm/refresh                 rotate refresh token
POST   /api/auth/:realm/logout                  revoke current session
GET    /api/auth/:realm/me                      actor + realm + memberships
GET    /api/auth/:realm/sessions                list active sessions
DELETE /api/auth/:realm/sessions/:id            revoke one session
POST   /api/auth/:realm/password/change         { current_password, new_password }
POST   /api/auth/:realm/mfa/enroll              returns otpauth URI (encrypted secret at rest)
POST   /api/auth/:realm/mfa/confirm             { code }
POST   /api/auth/invite/accept                  { token, password, full_name }
POST   /api/auth/password/forgot                always 202 (no account enumeration)
POST   /api/auth/password/reset                 { token, password }
```

`:realm` is `platform` or `tenant`. Cross-realm tokens are rejected with `FORBIDDEN`.
Login is rate-limited per IP + email and locks the account after 5 failures for 15 minutes.

---

## 3. Platform API (`/api/platform`)

Every route requires `actor_type = platform`. Mutations require a platform permission and write
`audit_events`.

### Session and overview

```text
GET    /api/platform/me
GET    /api/platform/overview                   clients by status, modules, failures, users, storage
GET    /api/platform/health                     registry health, pool usage, failed jobs, backups
```

### Clients and modules

```text
GET    /api/platform/clients                     ?status=&q=&page=
POST   /api/platform/clients                     { name, slug, plan_key, limits, admin? }
GET    /api/platform/clients/:id
PATCH  /api/platform/clients/:id                 status, plan, limits
DELETE /api/platform/clients/:id                 soft archive; revokes tenant sessions + memberships
POST   /api/platform/clients/:id/modules         { module_key, preset? , grants[] }
                                                     (module enable also accepts admin_user_id)
PATCH  /api/platform/clients/:id/modules/:key    { status: active|disabled|archived }
                                                     (reactivate only from disabled with a registered DB)
DELETE /api/platform/clients/:id/modules/:key    deprovision (revoke → disable → job)
GET    /api/platform/clients/:id/memberships
POST   /api/platform/clients/:id/admins          { email, full_name, module_grants[] }
PATCH  /api/platform/clients/:id/admins/:mid     suspend / reset / revoke sessions
GET    /api/platform/clients/:id/usage
GET    /api/platform/clients/:id/audit
```

Module grant requests accept concrete keys or presets. Wildcards are expanded server-side and validated
against the catalog. The response never includes database credentials.

### Catalog, jobs, plans

```text
GET    /api/platform/modules                     catalog + latest version + rollout status
GET    /api/platform/modules/instances           every client × module (status, health, version,
                                                 record count, active users, last activity)
GET    /api/platform/provisioning-jobs           ?status=&client_id=
GET    /api/platform/provisioning-jobs/:id       step timeline
POST   /api/platform/provisioning-jobs/:id/retry
POST   /api/platform/provisioning-jobs/:id/cancel
GET    /api/platform/plans
GET    /api/platform/usage                       per-client counters and quotas
```

### Super Admin module access

```text
POST   /api/platform/access/enter                { client_id, module_key, mode, reason }
POST   /api/platform/access/exit                 { access_id }
GET    /api/platform/access/log                  ?client_id=&module_key=&mode=&platform_user_id=&from=&to=&limit=
GET    /api/platform/access/active
```

`enter` validates the client/module, writes `platform_module_access`, and returns a 30-minute
`lilac_module_access` token. `mode=inspect` is the default and blocks writes at the workspace layer.
`mode=support` requires a non-empty reason.

### Impersonation and audit

```text
POST   /api/platform/impersonate                 { user_id, client_id?, reason }  (client inferred when
                                                 the user has exactly one active membership)
POST   /api/platform/impersonate/:id/end
GET    /api/platform/audit                       ?actor=&action=&client_id=&module_key=&from=&to=&page=
GET    /api/platform/audit/export                CSV, formula-injection safe
GET    /api/platform/platform-users
POST   /api/platform/platform-users               invite super admin (MFA enforced)
PATCH  /api/platform/platform-users/:id          suspend|reactivate|reset_password
```

---

## 4. Workspace API (`/api/workspace`)

The `:module` segment must match the token's `active_module`; a mismatch is `403 FORBIDDEN`.
Super Admin tokens (`platform_override = true`) may call these routes for their scoped module only;
`inspect` mode rejects every non-GET request with `403 FORBIDDEN`.

### Session and dashboards

```text
GET    /api/workspace/me                         client, modules, effective permissions, mode
GET    /api/workspace/:module/dashboard          permission-filtered cards
GET    /api/workspace/:module/resources           resource names available to the module
GET    /api/workspace/:module/settings
PATCH  /api/workspace/:module/settings           administration.settings.manage
GET    /api/workspace/:module/company
PATCH  /api/workspace/:module/company            administration.company.manage
```

### Generic resources

```text
GET    /api/workspace/:module/:resource          ?q=&page=&per_page=&sort=&filters
POST   /api/workspace/:module/:resource
GET    /api/workspace/:module/:resource/:id
PATCH  /api/workspace/:module/:resource/:id
DELETE /api/workspace/:module/:resource/:id      soft delete
GET    /api/workspace/:module/:resource/export   CSV, formula-injection safe
```

Allowed `resource` values per module:

| Module | Resources |
| --- | --- |
| `retail` | `categories`, `products`, `customers`, `vendors`, `stock`, `stock-movements`, `expenses`, `invoices`, `sales`, `refunds`, `banks`, `bank-transactions`, `purchase-orders`, `purchases`, `purchase-returns`, `salesmen` |
| `hr` | `employees`, `departments`, `locations`, `attendance`, `leave-types`, `leave-requests`, `pay-runs`, `payslips`, `salary-structures`, `job-openings`, `candidates`, `interviews`, `goals`, `reviews`, `documents` |
| `school` | `students`, `guardians`, `classes`, `sections`, `subjects`, `attendance`, `exams`, `grades`, `fee-heads`, `fee-invoices`, `fee-payments`, `staff`, `timetable`, `transport-routes`, `admissions` |
| `accounts` | `chart-of-accounts`, `journals`, `journal-lines`, `bank-accounts`, `reconciliations`, `ar-open-items`, `ap-open-items`, `fiscal-periods`, `ledgers` |

Every resource maps to `<module>.<resource>.<action>`; an unknown resource is `404` before any SQL.

Permission aliases for tables that are children/views of a catalog resource:

| Resource | Permission resource |
| --- | --- |
| `stock-movements` | `stock` |
| `bank-transactions` | `banks` |
| `journal-lines` | `journals` |
| `sales` | `sales` (view/export only) |

The alias table lives in the resource descriptor, never in user input.

### Workflow endpoints

```text
POST   /api/workspace/:module/invoices/:id/finalize
POST   /api/workspace/:module/invoices/:id/duplicate       { number?, date? }
POST   /api/workspace/:module/refunds/:id/approve          { comment? }
POST   /api/workspace/:module/refunds/:id/reject           { comment }
POST   /api/workspace/:module/purchase-returns/:id/approve
POST   /api/workspace/:module/expenses/:id/approve
POST   /api/workspace/:module/purchases/:id/receive
POST   /api/workspace/:module/leave-requests/:id/approve   { comment? }
POST   /api/workspace/:module/leave-requests/:id/reject    { comment }
POST   /api/workspace/:module/pay-runs/:id/approve
POST   /api/workspace/:module/journals/:id/post
```

### Administration inside a workspace

```text
GET    /api/workspace/:module/admin/users              administration.users.manage
POST   /api/workspace/:module/admin/users              invite sub-admin (delegation check)
PATCH  /api/workspace/:module/admin/users/:id/permissions  requested ⊆ creator effective
PATCH  /api/workspace/:module/admin/users/:id/status
GET    /api/workspace/:module/admin/roles
POST   /api/workspace/:module/admin/roles              bundle of permissions the creator holds
PATCH  /api/workspace/:module/admin/roles/:id
DELETE /api/workspace/:module/admin/roles/:id
GET    /api/workspace/:module/admin/branches
POST   /api/workspace/:module/admin/branches
PATCH  /api/workspace/:module/admin/branches/:id
DELETE /api/workspace/:module/admin/branches/:id
GET    /api/workspace/:module/admin/tax-codes
POST   /api/workspace/:module/admin/tax-codes
PATCH  /api/workspace/:module/admin/tax-codes/:id
DELETE /api/workspace/:module/admin/tax-codes/:id
GET    /api/workspace/:module/admin/audit              administration.audit.view
GET    /api/workspace/:module/admin/audit/export
POST   /api/workspace/:module/admin/uploads            multipart; 2 MB; magic bytes; EXIF stripped
```

`POST /admin/users` and `PATCH /admin/users/:id/permissions` reject escalation with `PERMISSION_ESCALATION`,
reject self-editing grants, and refuse to remove the last active client admin (`409 CONFLICT`).

---

## 5. UI route map

### Public

```text
/login                     realm picker + credentials + MFA step
/accept-invite?token=...
/forgot-password
```

### Platform console (`/platform`)

```text
/                                     overview
/clients                              list
/clients/new                          create client + first admin
/clients/:clientId                    detail: modules, memberships, usage, audit
/clients/:clientId/modules/:moduleKey access in Inspect/Support (wrapped in banner)
/modules                              module catalog
/modules/instances                    all-modules explorer (Open action per row)
/provisioning                         jobs + step progress + retry
/plans                                plans and limits
/access-log                           Super Admin module access history
/audit                                platform audit
/health                               system health
```

### Client workspace (tenant)

```text
/w/:module                            module dashboard
/w/:module/dashboard                  alias
```

**Retail** (exact order required by the build prompt):

```text
/w/retail/dashboard
/w/retail/administration/{users|roles|company|branches|tax|audit}
/w/retail/products
/w/retail/customers
/w/retail/vendors
/w/retail/stock
/w/retail/expenses
/w/retail/duplicate-bill
/w/retail/invoice
/w/retail/sales
/w/retail/refunds
/w/retail/banks
/w/retail/purchase-returns
/w/retail/salesmen
logout (action, not a page)
```

**HR:**

```text
/w/hr/employees              /w/hr/employees/:id
/w/hr/org-chart              /w/hr/onboarding
/w/hr/attendance             /w/hr/timesheets        /w/hr/shifts
/w/hr/leave
/w/hr/payroll                /w/hr/payslips          /w/hr/salary-structures
/w/hr/jobs                   /w/hr/candidates        /w/hr/interviews
/w/hr/goals                  /w/hr/reviews
/w/hr/documents              /w/hr/assets            /w/hr/announcements
/w/hr/reports
/w/hr/settings/{organization|departments|users|roles|holidays|audit}
```

**School:**

```text
/w/school/students           /w/school/students/:id
/w/school/guardians          /w/school/classes       /w/school/subjects
/w/school/attendance         /w/school/exams         /w/school/grades
/w/school/fees               /w/school/staff         /w/school/timetable
/w/school/transport          /w/school/admissions
/w/school/reports
/w/school/settings/{company|branches|users|roles|audit}
```

**Accounts:**

```text
/w/accounts/chart-of-accounts
/w/accounts/journals            /w/accounts/journals/:id
/w/accounts/ledgers             /w/accounts/receivables     /w/accounts/payables
/w/accounts/banks               /w/accounts/tax             /w/accounts/fiscal-periods
/w/accounts/reports
/w/accounts/settings/{company|branches|users|roles|audit}
```

### Guard behavior

| Situation | Redirect / render |
| --- | --- |
| No session | `/login?next=...` |
| Tenant hits `/platform/*` | `/w/:module` (or permission-denied for API) |
| Platform hits `/w/*` without an access token | `/platform/clients` |
| Module not entitled | permission-denied screen with module status |
| Missing nav `view` permission | item hidden; direct URL shows permission-denied |
| Inspect mode mutation | action disabled with tooltip + `403` on API |
| Access token expired | silent refresh; on refresh failure → `/login` |

---

## 6. Route → permission matrix (summary)

| Route family | Permission |
| --- | --- |
| `/api/platform/clients*` | `platform.clients.*` |
| `/api/platform/modules*` | `platform.modules.manage` (instances also `platform.modules.access`) |
| `/api/platform/provisioning*` | `platform.provisioning.manage` |
| `/api/platform/access/*` | `platform.modules.access` / `platform.modules.support` |
| `/api/platform/audit*` | `platform.audit.view` |
| `/api/platform/plans*` | `platform.plans.manage` |
| `/api/workspace/me` | any active membership |
| `/api/workspace/:module/dashboard` | `<module>.dashboard.view` |
| generic resource | `<module>.<resource>.<action>` |
| workflow endpoints | explicit approve/post/collect/run permission |
| `/api/workspace/:module/admin/users*` | `administration.users.manage` |
| `/api/workspace/:module/admin/roles*` | `administration.roles.manage` |
| `/api/workspace/:module/company` | `administration.company.manage` |
| `/api/workspace/:module/admin/branches*` | `administration.branches.manage` |
| `/api/workspace/:module/admin/tax-codes*` | `administration.tax.manage` |
| `/api/workspace/:module/admin/audit*` | `administration.audit.view` |
| platform override | `platform_override = true`; inspect blocks writes |

---

## 7. Adding a new module

1. Add a catalog entry and presets in `server/src/authz/catalog.ts`.
2. Add `db/migrations/<module>/0001_schema.sql` including the shared tenant preamble.
3. Add a resource descriptor and dashboard query in `server/src/modules/<module>.ts`.
4. Register the module in `modules` (migration seed) and the registry key type.
5. Add UI routes under `/w/<module>` and nav permissions.
6. Add isolation + permission tests. No control-plane table changes required.

# Build Prompt — Lilac Office Multi-Tenant Modular ERP

Use this prompt together with `design.md` (visual source of truth) and append your own styling at the end where marked. This is a full-stack build prompt, not a frontend-only prototype.

---

## MISSION

Build **Lilac Office**, a production-grade, multi-tenant, modular ERP platform.

There are two planes:

1. **Platform control plane** — owned by the Super Admin (you). Creates clients, enables modules, assigns module rights, provisions databases, manages platform users, and audits everything.
2. **Client workspaces** — one per client. A client may have one or many modules enabled (School, HR, Retail/Sales & Purchase, Accounts). Each enabled module gets its **own isolated database** for that client. Client admins manage their own users and can create sub-admins with a **strict subset** of their own rights.

The Super Admin can also **enter and inspect every module of every client at any time**, without being a member of that client. This is a platform-level override, never a tenant permission, and every access is audited.

Every module has its own dashboard tailored to that module. The UI uses the Pillio-based Lavender Canvas design system defined in `design.md`: lavender gradient background, floating white rounded panels, one lilac gradient hero card, and one black CTA.

## 1. ACTORS AND RIGHTS CHAIN

| Actor | Created by | Scope | Can do |
| --- | --- | --- | --- |
| Super Admin | System | Entire platform, every client, every module | Create clients, enable/disable modules, grant module rights, provision DBs, create client admins, enter and operate any module for any client (audited), impersonate with audit, manage plans/limits, platform settings |
| Client Admin | Super Admin | One client, assigned modules | Full rights inside the modules granted to them; create sub-admins; assign only permissions they themselves hold |
| Sub-Admin | Client Admin | One client, assigned modules | Only the permissions explicitly granted; cannot create users unless granted `administration.users.manage`; can never exceed the creator's rights |
| Staff / Operator | Client Admin or Sub-Admin | One client, assigned modules | Narrow operational permissions (e.g., create invoices only) |

**Hard delegation invariant**

```
effective_permissions(user) =
  super_admin_grants_for_client
  ∩ creator_grants
  ∩ role_grants
```

A sub-admin can never receive a permission the creator does not hold. Enforce this on the server for every create/edit user request, not just in the UI. Reject privilege escalation with `403 PERMISSION_ESCALATION`.

Super Admin rights are platform rights (`platform.*`) and are never delegable to tenant users.

**Platform override (Super Admin only).** A `platform` actor with role `super_admin` bypasses tenant grants and module entitlements when entering a module. This override:

- Applies only to platform actors — never to tenant users, roles, or sub-admins.
- Does not modify the client's permission data and never appears in tenant permission pickers.
- Always records `actor_type = platform`, `active_module`, and `platform_override = true` in the audit trail.
- Cannot be used to bypass input validation, business rules, or audit logging.

## 2. MODULE CATALOG

| Module key | Name | Purpose | Database |
| --- | --- | --- | --- |
| `school` | School Management | Students, guardians, classes, attendance, exams, fees, staff, timetable, transport | `tenant_<client>_school` |
| `hr` | HR Management | Employees, departments, attendance, leave, payroll, recruitment, documents, performance | `tenant_<client>_hr` |
| `retail` | Sales & Purchase / Inventory | Products, customers, vendors, stock, invoices, refunds, purchases, banks, salesmen, expenses | `tenant_<client>_retail` |
| `accounts` | Accounts & Finance | Chart of accounts, journals, ledgers, receivables/payables, banking, tax, financial reports | `tenant_<client>_accounts` |

A client can have any combination, including one module only. Only enabled modules appear in that client's sidebar.

### Required Retail module navigation

The retail workspace must contain exactly these items, in this order:

`Dashboard · Administration · Products · Customers · Vendors · Stock · Expenses · Duplicate Bill · Invoice · Sales View · Itemwise Refund · Banks · Purchase Return · Salesman · Logout`

- **Administration** is a submenu: Users, Roles & Permissions, Company Profile, Branches & Warehouses, Tax Settings, Audit Log.
- **Logout** is a bottom action, not a content page.
- Each item below has its own screen, filters, table, and actions:
  - **Dashboard:** today's sales, invoice count, receivables, payables, cash/bank balance, low-stock alerts, top products, sales trend, recent invoices, pending refunds.
  - **Products:** SKU, name, category, unit, cost, price, tax, stock, reorder level, status; create/edit drawer; import/export.
  - **Customers:** name, phone, email, city, balance, credit limit, status; ledger view; create/edit.
  - **Vendors:** name, contact, terms, payables balance, status; purchase history; create/edit.
  - **Stock:** stock by warehouse, in/out movements, adjustments, transfers, low-stock and expiry views.
  - **Expenses:** date, category, account, paid-through bank, amount, reference, attachment; approve/void.
  - **Duplicate Bill:** clone an existing invoice with a new number/date, re-price against current stock, editable lines.
  - **Invoice:** line-item builder (product, qty, rate, discount, tax), customer, warehouse, payment split (cash/bank/credit), totals, save draft / finalize / print.
  - **Sales View:** all invoices and returns with date, customer, salesman, total, paid, balance, status; filters and export.
  - **Itemwise Refund:** choose invoice line, quantity, reason, refund method; updates stock and customer balance; approval required above a configurable limit.
  - **Banks:** bank accounts, opening balance, deposits, withdrawals, transfers, reconciliation status, running balance.
  - **Purchase Return:** return lines against a purchase bill; restock, vendor payable adjustment, reason, approval.
  - **Salesman:** salesmen, assigned customers/territories, commission rate, sales and commission summary.
- Also implement the purchase side needed by the module: purchase orders and purchase bills, with vendor, warehouse, lines, tax, payment status.

## 3. TENANCY AND DATABASE ARCHITECTURE (CRITICAL)

Implement **database-per-client-per-module**. Do not use a single shared database with a tenant column as the only isolation mechanism.

### 3.1 Control plane database

`erp_platform` stores:

- `platform_users` (super admins, MFA-enabled)
- `clients` (id, name, slug, status: provisioning | active | suspended | archived, plan, limits)
- `modules` (catalog: key, name, version, migration_path)
- `client_modules` (client_id, module_key, status, granted_by, granted_at, db_name, db_secret_ref, schema_version)
- `memberships` (user_id, client_id, module_key, role, status)
- `permissions` (catalog of permission keys)
- `role_grants` (membership_id, permission_key, granted_by)
- `provisioning_jobs` (client_id, module_key, step, attempt, error, timings)
- `sessions`, `impersonation_sessions`, `audit_events`, `plans`, `usage_counters`
- `db_registry` (client_id, module_key, encrypted connection reference, pool config, health, migration version)

Never store plaintext database credentials in application tables. Use a secrets manager or encrypted column with KMS-backed keys.

### 3.2 Tenant module databases

Naming: `tenant_<client_slug>_<module_key>`, sanitized and unguessable enough (include a short random suffix if slugs are user-editable).

Every tenant module DB contains:

- The module's business tables
- `tenant_meta` (client_id, module_key, schema_version, created_at)
- `module_users` (user_id from control plane as an opaque UUID, display name, role_label, status)
- `module_audit` (append-only)
- `module_settings` (branch/warehouse, currency, tax defaults, numbering series)
- `__migrations` (applied migration versions)

Rules:

- No cross-database foreign keys. Store `user_id` as UUID and validate membership in the control plane.
- No cross-database live joins. Use API composition or an event/ETL pipeline for cross-module reporting.
- Every business table carries `client_id`, `module_key`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` for defense in depth and audit.
- Application DB users are least-privilege per tenant DB; the app never connects as a superuser.

### 3.3 Tenant resolution and connection routing

- Resolve tenant from the authenticated session/JWT, **never** solely from URL params or request bodies.
- JWT claims: `sub`, `session_id`, `actor_type` (`platform` | `tenant`), `client_id`, `memberships[]` with `{ module_key, role, permissions_hash }`, `active_module`, `impersonated_by`, and `platform_override` (only ever `true` for a Super Admin module-access session).
- Middleware order: authenticate → load membership → verify module entitlement is `active` → resolve DB from `db_registry` → attach request-scoped `TenantContext` → authorize permission → handler.
- Connection registry caches pools keyed by `client_id + module_key`, with lazy creation, max pool size per tenant, idle eviction, health checks, and a global pool cap.
- If the requested module is not entitled or the DB is not ready, return `403 MODULE_NOT_ENABLED` or `503 MODULE_PROVISIONING`. Never fall back to another tenant or module.

### 3.4 Provisioning flow

When the Super Admin grants a module to a client, run an idempotent job:

1. Create `client_modules` row with `status = provisioning`; create `provisioning_jobs` row; write audit event.
2. Acquire a distributed lock for `client_id + module_key`.
3. Create the database (or schema template) with a generated name.
4. Create a least-privilege DB user and store its secret reference.
5. Run that module's migrations in a transaction with an advisory lock.
6. Seed defaults: branches, warehouses, numbering series, tax codes, chart of accounts (for accounts/retail), permission catalog.
7. Create the client admin membership and grant exactly the rights selected by the Super Admin.
8. Mark module `active`, register the DB, close the job, emit `module.provisioned`.
9. On failure: mark job `failed` with a safe error code, retry with exponential backoff (max 5), keep access blocked, and never leave a half-usable module.

Deprovisioning: revoke sessions and memberships immediately, mark `disabled`, retain DB per retention policy, then snapshot and drop via a separate audited job. Never drop in the request path.

### 3.5 Migrations and scaling

- Keep versioned migrations per module (`migrations/school`, `migrations/hr`, `migrations/retail`, `migrations/accounts`).
- Track applied version per tenant DB. Run upgrades as batched background jobs with canary clients first.
- New module version rollout must be resumable and report per-tenant status.
- Back up each tenant DB independently with point-in-time recovery; support restore into a staging DB.
- Scale the app horizontally (stateless API). Cap and tune connection pools; for very large client counts, shard the DB registry and route by client hash.
- Add per-tenant rate limits and quotas from the plan.

## 4. AUTHENTICATION AND SESSION

- Email + password (Argon2id), optional TOTP MFA; **mandatory MFA for Super Admin**.
- HTTP-only, Secure, SameSite=Lax cookies. CSRF protection on mutations.
- Short-lived access token + rotating refresh session stored server-side and revocable.
- Separate realms: `platform` users and `tenant` users. A tenant user can never access platform routes.
- Super Admin impersonation: explicit action, reason required, time-boxed, banner visible in the UI, fully audited, cannot perform destructive platform actions while impersonating.
- Password reset, session list/revoke, forced password change for invited users.
- Rate-limit login, invite, and provisioning endpoints.

## 5. AUTHORIZATION MODEL

### 5.1 Permission key grammar

```
<module>.<resource>.<action>
```

Actions: `view`, `create`, `update`, `delete`, `approve`, `export`, `manage`, `print`.

Examples:

```
retail.products.view
retail.products.create
retail.invoice.create
retail.invoice.approve
retail.refund.approve
retail.banks.manage
school.students.view
school.fees.collect
hr.payroll.run
accounts.journals.post
administration.users.manage
administration.roles.manage
platform.clients.manage
platform.modules.access       -- enter any client module in Inspect mode
platform.modules.support      -- switch to Support (write) mode
```

Wildcards: `retail.*` means all retail permissions. Store explicit grants in the control plane; resolve effective permissions server-side and return them to the client for UI gating. The server must authorize every request independently.

### 5.2 Super Admin grants

Super Admin grants a client a **module**, then chooses rights:

- Module-level preset: Viewer, Operator, Manager, Module Admin.
- Full permission tree with checkboxes per resource/action.
- Grant at module level to a client admin; sub-admins are created inside the client workspace.

### 5.3 Client Admin → Sub-Admin

When creating or editing a sub-admin:

- Show only the permissions the creator currently holds, for the modules the client has enabled.
- Default to no permissions; require explicit selection.
- Enforce `requested ⊆ creator_effective` and `requested ⊆ client_entitlements`.
- Recompute effective permissions on every request so revoking a grant takes effect immediately.
- Prevent deletion of the last remaining client admin.
- Prevent a sub-admin from editing their own permissions or escalating another user.

### 5.4 Permission-aware UI

- Hide nav items with no view permission.
- Disable actions without permission and explain why via tooltip.
- Never render platform navigation to tenant users.
- Route guards on the client; server guards on every API call.

### 5.5 Super Admin module access (global oversight)

The Super Admin must be able to check every module of every client from one place.

**Access modes**

| Mode | Default | Capabilities | Audit |
| --- | --- | --- | --- |
| Inspect | Yes | Read-only access to every screen, table, and record in the module | Logged on entry and periodically for exports |
| Support | No | Full read/write operations in the module, for troubleshooting or client support | Every mutation logged with reason |

- Entering Support mode requires a reason, an explicit mode switch in the UI, and a confirmation dialog.
- Both modes show a persistent top banner: `Platform access · <Client> · <Module> · Inspect/Support · Exit`. The banner uses `--primary-700` background with white text (AA contrast) so it can never be mistaken for normal client use.
- Exiting returns to the platform console and ends the access session.

**Surface**

- **All modules explorer** (`/platform/modules`): every client × module instance in one table — client, module, status (`provisioning`, `active`, `suspended`, `archived`), schema version, DB health, record count, active users, last activity, and an **Open** action.
- **Client detail → Modules:** each entitled module has **Open module** beside its provisioning status. Modules that are not entitled show **Enable module**; the Super Admin can enable and provision them directly.
- **Module switcher:** when inside a client, the Super Admin can jump between School, HR, Retail, and Accounts without leaving the workspace.
- Each module opens its normal module dashboard and full navigation, with additional platform-only widgets: DB status, schema version, record counts, enabled users, and recent module audit.

**Routes and API**

- Module access routes: `/platform/clients/:clientId/modules/:moduleKey/*` rendering the module workspace in platform mode.
- `POST /api/platform/access/enter` `{ client_id, module_key, mode, reason }` returns a short-lived, module-scoped access token.
- `POST /api/platform/access/exit` ends the session.
- `GET /api/platform/modules/instances` returns the global module explorer data.
- All module API handlers accept platform tokens when `platform_override = true`; they still resolve the correct tenant module DB and still enforce validation and business rules.

**Rules**

- No membership row is required and no tenant permission is checked for the Super Admin.
- Deleting, dropping, or deprovisioning a tenant database is only available from the platform console, never from inside the module workspace.
- A disabled or archived module opens in read-only Inspect mode and shows its status; write actions are blocked.
- Super Admin module access is time-boxed, revocable, and fully audited. It never changes tenant grants.

## 6. SUPER ADMIN CONSOLE

Routes under `/platform`:

- **Overview:** clients by status, modules provisioned, provisioning failures, active users, storage usage, recent audit events, system health.
- **All modules:** global explorer of every client × module instance with status, DB health, schema version, record count, active users, last activity, and an **Open** action. Filter by client, module, and status.
- **Clients:** list (name, slug, plan, modules, users, status), create client (name, slug, plan, limits, first admin), client detail with modules, memberships, usage, and audit.
- **Client detail → Modules:** enable module → choose rights → start provisioning → live job progress → retry on failure; disable/archive with confirmation. Every entitled module shows **Open module** (Inspect or Support mode) beside its status.
- **Client detail → Users:** invite client admin, assign modules/rights, suspend, reset password, revoke sessions.
- **Module catalog:** module versions, tenant rollout status, migration progress.
- **Provisioning jobs:** queue, steps, attempts, errors, retry/cancel.
- **Plans & limits:** users, branches, storage, modules per plan.
- **Impersonation:** start with reason; banner and audit.
- **Module access log:** every Super Admin entry into a client module, mode (Inspect/Support), reason, duration, and actions taken.
- **Platform audit:** actor, action, client, entity, before/after, IP, timestamp, filters and export.
- **System health:** DB registry health, pool usage, failed jobs, backups.

The console uses the same Lavender Canvas design system, with a primary-gradient logo tile and a “Platform” chip so it is never confused with a client workspace.

## 7. CLIENT WORKSPACE

### 7.1 Shell

- Floating white sidebar inset 16px, radius 24; shows only entitled modules and permitted pages; active item is a full-width pill with no accent bar.
- Workspace switcher showing enabled modules with a module icon and name, pill-shaped and frosted/white.
- Transparent 64px top bar with no bottom border: module name + client name, breadcrumbs, frosted search pill, notifications, quick create, user menu.
- Settings: Company profile, Branches, Users, Roles & permissions, Audit log, Module settings, Billing/usage if applicable.
- Logout is always available at the bottom of the user menu and as required in the retail nav.
- Exactly one black pill CTA and one gradient hero card per screen.

### 7.2 Module dashboards

Each enabled module opens its own dashboard with one gradient hero KPI, a calm KPI row, charts, lists, and one black CTA:

- **School:** hero = fee collection vs target; total students, present today, outstanding fees, classes, upcoming exams, admissions pipeline, attendance trend, recent payments.
- **HR:** hero = present today (e.g., 16 / 47) with hatched remainder; headcount, on leave, open roles, payroll cost, attendance rate, leave by type, department distribution, pending approvals.
- **Retail:** hero = today's sales vs target; invoices, receivables, payables, cash/bank position, low stock, top products, sales trend, recent invoices, refunds awaiting approval.
- **Accounts:** hero = cash and bank position; revenue vs expense, receivables/payables aging, trial balance summary, recent journals, tax liability.

Each dashboard is permission-filtered; hide cards the user cannot view. Use pill bars, soft line/area charts, 14px donuts, hatched not-yet states, and alert-row approvals from `design.md`.

### 7.3 Administration (retail example)

- **Users:** invite sub-admin, assign module + permissions, status, last login, force password reset, revoke sessions.
- **Roles & Permissions:** create role templates as a bundle of permissions the creator holds; assign roles to users; permission matrix with module → resource → actions.
- **Company Profile:** legal name, logo, address, tax/NTN, currency, fiscal year, invoice prefix.
- **Branches & Warehouses:** CRUD, default branch, per-branch numbering.
- **Tax Settings:** tax codes, rates, inclusive/exclusive behavior.
- **Audit Log:** filter by user, action, entity, date; export.

## 8. DATA MODEL

### Control plane

```text
clients(id, name, slug, status, plan_id, max_users, max_branches, created_at)
modules(key, name, latest_version, migration_path, is_active)
client_modules(id, client_id, module_key, status, granted_by, db_name, db_secret_ref, schema_version, created_at)
platform_users(id, email, password_hash, mfa_secret, status, last_login_at)
users(id, email, password_hash, full_name, status, mfa_enabled)  -- tenant + platform identity
memberships(id, user_id, client_id, module_key, role, status, created_by)
permissions(key, module_key, resource, action, description)
role_grants(id, membership_id, permission_key, granted_by, granted_at)
roles(id, client_id, module_key, name, permissions_json, created_by)
provisioning_jobs(id, client_id, module_key, step, status, attempts, last_error, started_at, finished_at)
db_registry(client_id, module_key, db_name, secret_ref, pool_config, health, schema_version, last_checked_at)
audit_events(id, actor_type, actor_id, client_id, module_key, action, entity, entity_id, before, after, ip, user_agent, created_at)
impersonation_sessions(id, platform_user_id, target_user_id, client_id, reason, started_at, ended_at)
platform_module_access(id, platform_user_id, client_id, module_key, mode, reason, started_at, ended_at, revoked_at)
sessions(id, user_id, realm, token_hash, expires_at, revoked_at, ip, user_agent)
```

### Retail module DB (core)

```text
products(id, sku, name, category_id, unit, cost_price, sale_price, tax_code, reorder_level, is_active)
product_stock(id, product_id, branch_id, warehouse_id, quantity, updated_at)
stock_movements(id, product_id, warehouse_id, type, quantity, reference_type, reference_id, note, created_by, created_at)
customers(id, code, name, phone, email, city, credit_limit, opening_balance, is_active)
vendors(id, code, name, phone, email, terms, opening_balance, is_active)
invoices(id, number, customer_id, branch_id, warehouse_id, salesman_id, date, subtotal, discount, tax, total, paid, balance, status, created_by)
invoice_lines(id, invoice_id, product_id, description, quantity, rate, discount, tax, line_total)
purchases(id, number, vendor_id, date, subtotal, tax, total, paid, balance, status)
purchase_lines(id, purchase_id, product_id, quantity, rate, tax, line_total)
purchase_returns(id, number, purchase_id, vendor_id, date, total, reason, status)
refunds(id, number, invoice_id, customer_id, date, total, method, reason, status, approved_by)
expenses(id, date, category, account_id, bank_id, amount, reference, attachment_url, status, approved_by)
banks(id, name, account_number, opening_balance, current_balance, is_active)
bank_transactions(id, bank_id, date, type, amount, reference, note, created_by)
salesmen(id, name, phone, commission_rate, territory, is_active)
```

Add equivalent tables for school, HR, and accounts. School: students, guardians, classes, sections, subjects, enrollments, attendance, exams, grades, fee_heads, invoices, payments, staff, timetable. HR: employees, departments, attendance, leave_types, leave_requests, salary_structures, pay_runs, payslips, job_openings, candidates, goals, documents. Accounts: chart_of_accounts, journal_entries, journal_lines, ledgers, bank_reconciliations, tax_codes, fiscal_periods.

## 9. API SURFACE

Platform:

```
POST   /api/platform/clients
POST   /api/platform/clients/:id/modules        { module_key, grants[] }
POST   /api/platform/clients/:id/admins
GET    /api/platform/provisioning-jobs
POST   /api/platform/provisioning-jobs/:id/retry
POST   /api/platform/impersonate                { user_id, reason }
GET    /api/platform/modules/instances          -> every client × module instance
POST   /api/platform/access/enter               { client_id, module_key, mode, reason }
POST   /api/platform/access/exit
GET    /api/platform/access/log
GET    /api/platform/audit
```

Tenant:

```
GET    /api/workspace/me                        -> client, modules, permissions
GET    /api/workspace/:module/dashboard
GET    /api/workspace/:module/products
POST   /api/workspace/:module/products
PATCH  /api/workspace/:module/products/:id
DELETE /api/workspace/:module/products/:id
GET    /api/workspace/:module/invoices
POST   /api/workspace/:module/invoices
POST   /api/workspace/:module/invoices/:id/duplicate
POST   /api/workspace/:module/refunds
GET    /api/workspace/:module/audit
POST   /api/workspace/:module/users             (subset grant check)
PATCH  /api/workspace/:module/users/:id/permissions
```

Every handler: validate session → validate entitlement → resolve tenant DB → authorize (tenant permission, or Super Admin `platform_override`) → execute → write module audit + platform audit → return typed response. Use consistent error codes: `UNAUTHENTICATED`, `FORBIDDEN`, `PERMISSION_ESCALATION`, `MODULE_NOT_ENABLED`, `MODULE_PROVISIONING`, `MODULE_ARCHIVED`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`.

## 10. UI AND DESIGN

Follow `design.md` (v2, Pillio-based) exactly. Where styling supplied by the user conflicts with this section, the user's styling wins visually, but keep the layout logic, screen inventory, permissions, and tenancy intact.

### 10.1 Visual language

- **Canvas:** soft lavender gradient `linear-gradient(135deg, #F7F6FC 0%, #ECEBF8 100%)`. Never a flat white or gray page background.
- **Surfaces:** pure white cards and sidebar. Soft tinted inner tiles `#F6F5FB`. Optional frosted `rgba(255,255,255,.72)` for search and top-bar chrome.
- **Floating sidebar:** white, radius 24, inset 16px from the viewport, full height minus inset, no right border. Width 260–280px. Collapsed becomes an icon rail at 1024–1279.
- **Top bar:** transparent, 64px, no bottom border. Search is a frosted 44px pill with `⌘K` chips. Icon buttons are 40px white circles.
- **Cards:** radius 24, no border, padding 20, shadow `0 1px 2px rgba(30,25,80,.04), 0 8px 24px rgba(30,25,80,.05)`.
- **CTAs:** one black pill CTA per screen (`#0E0E12`, height 48, px 24). Secondary is white with a 1px border; ghost is transparent with ink-500; small black pill height 32 for row actions like Approve.
- **Lilac:** `--primary-500 #8D86EA`, `--primary-600 #7A72DD`, `--primary-700 #5F57C4`. Use lilac for the single hero gradient card, progress, selected states, chart series, and soft chips. Never use saturated violet for large surfaces.
- **Hero gradient:** `linear-gradient(160deg, #A9A3F5 0%, #7F77E0 100%)`. Exactly one gradient card per dashboard/screen.
- **Hatch:** use `--hatch` for future, missed, or unfilled states; `--hatch-on-primary` inside the hero progress remainder. Status must combine color, icon/text, and pattern — never color alone.
- **Links:** `--primary-700` on light surfaces for AA contrast. Never primary-500 for small text on white.

### 10.2 Typography

Inter or Manrope, weights 400–500 (not 600–700). Tabular numerals everywhere for money, counts, and IDs.

- Greeting 32/40, weight 500, ink-900. Subtitle 14/20, ink-500.
- Hero metric 44/48, weight 500, white (unit lighter).
- KPI value 40/44, weight 500, ink-900. KPI title 13/18, weight 500, ink-500.
- Chart title 15/20, weight 500, ink-900. List title 14–15/20, weight 500.
- Nav 14/20, weight 400 (active 500). Buttons 14/20, weight 500.
- Caption/axis 11/14, ink-300.

### 10.3 Dashboard composition

Every module dashboard and the platform overview uses this structure:

1. Page header: time-of-day greeting or module title (32/500), subtitle, and the single black CTA.
2. KPI grid: 4 columns. One **gradient hero KPI** (1 col × 2 rows or 2 × 1) holding the module's most important metric with a progress bar; the rest are calm white KPI cards.
3. Main split `minmax(0,2fr) minmax(0,1fr)`, gap 20: charts and lists.
4. KPI cards: small gray title with inline icon, 40/500 value, lighter unit, borderless soft delta chip, ⋯ menu, optional tooltip-backed pill sparkline. No colored icon tiles outside alert rows.

Module hero metric:

- Retail: today's sales, with target progress.
- School: fee collection, with target progress.
- HR: present today (e.g., 16 / 47).
- Accounts: cash and bank position.
- Platform overview: active clients or modules provisioned.

### 10.4 Charts and lists

- **Weekly attendance:** pill bars 22–28px wide; past solid `#E9E8F0`, today solid primary-500, future/no data hatched. Labels 11px; today's label ink-900. Annotate the axis.
- **Headcount/trend:** 2px primary-500 smooth line, gradient area fill `rgba(141,134,234,.25) → 0`, dashed `#EEEDF5` gridlines, dots only on hover and last point.
- **Donut:** 14px ring, rounded caps, 3px gaps, softened palette, total in the center.
- **Department bars:** 10px pill, track `#EEEDF5` with faint hatch, fill in the category color.
- **Pending approvals:** alert rows with a 40px tinted icon tile, name + sub, age chip, small black Approve, ghost Reject, and a muted 2-line reason box. Severity by wait time.
- **Recent activity:** dot + actor + verb + object + relative time, `line-clamp-2`. Never hard-clip.
- **Milestones:** surface-muted tiles, 44px avatar, circular white action button, optional week strip with a primary-500 ring on the selected date.

### 10.5 Tables, forms, overlays

- Tables: white card radius 24, sticky header `#F6F5FB`, row dividers `#ECEBF3` only, 52px rows, hover `#F8F7FD`, sorting, filters, column visibility, bulk bar, pagination 25/50/100.
- Status chips: soft tinted, no borders, icon + text + optional hatch.
- Forms: labels 13/500 ink-700; inputs 44px, radius 14, focus ring `0 0 0 2px #8D86EA`; helper 12/ink-500; errors with icon + text, never color alone.
- Drawers/modals: radius 24, white, soft shadow, sticky header/footer, focus trap, `Esc` to close.
- Toasts: white card, status icon, title/message, Undo where relevant.
- Skeletons: shimmer on `#F1F0F8`, matching final layout.

### 10.6 Motion and accessibility

- 120ms hover, 200–240ms drawers/modals, `cubic-bezier(.2,.8,.2,1)`. Bars animate on mount. Respect `prefers-reduced-motion`.
- WCAG 2.1 AA, visible 2px primary-500 focus rings, 40×40 minimum targets, `aria-label` on icon buttons, keyboard support for menus/tabs/tables/command palette, focus trap in overlays, `aria-live` toasts, charts with text summaries and hidden data tables.

### 10.7 Content and formatting

- Sentence case everywhere; no UPPERCASE tracked labels.
- Greeting by time of day.
- Money: configurable currency (default PKR), `Rs 16.85M` with full-value tooltip, tabular and right-aligned in tables.
- Dates: `DD MMM YYYY`; relative time for activity (`in 3h`, `2 days`).
- Fixes: clamp/expand clipped activity text and approval reasons; compact payroll values; separate delta direction from good/bad semantics; start attendance axes at 0 or annotate; sidebar nav gets bottom padding equal to the footer height.

### 10.8 Platform access banner

The Super Admin module-access banner uses full-width primary-700 with white text (AA contrast), showing client, module, mode, and an outlined white Exit pill. Inspect shows `Inspect (read-only)`; Support shows `Support (write)` plus the recorded reason. It sits above the module top bar and remains visible on scroll.

## 11. SEED AND DEMO DATA

Seed the platform with:

- Super Admin: `owner@lilacoffice.app` / `ChangeMe123!` (force password change, MFA setup prompt).
- Client 1: “Northwind Studios” with `hr` + `retail` enabled and two provisioned module DBs.
- Client 2: “Beacon Academy” with `school` enabled only.
- Client 3: “Meridian Traders” with `retail` + `accounts` enabled.
- Per-client client admins and sub-admins demonstrating different permission scopes.
- Retail data: 60 products, 40 customers, 15 vendors, 3 warehouses, 120 invoices, 25 purchases, 12 refunds, 6 banks, 8 salesmen, 40 expenses, 12 months of sales history.
- School data: 300 students, 18 classes, 40 staff, 12 months of fee payments.
- HR data: 48 employees, attendance, leave, 3 pay runs.
- Accounts data: chart of accounts, 100 journals, AR/AP aging.
- A deliberately scoped sub-admin: “Products viewer” who cannot see invoices or banks, to prove permissions work.
- The Super Admin can open every seeded client module (School, HR, Retail, Accounts) from the All Modules explorer, proving platform-wide oversight.

## 12. ACCEPTANCE TESTS

1. Super Admin creates a client, enables `retail`, grants `retail.*` and `administration.*`, and a client admin is invited. A new `tenant_<slug>_retail` database is created and migrations complete; the job shows step-by-step progress.
2. The client admin signs in, sees only the Retail module, and can open every required retail page: Dashboard, Administration, Products, Customers, Vendors, Stock, Expenses, Duplicate Bill, Invoice, Sales View, Itemwise Refund, Banks, Purchase Return, Salesman.
3. The client admin creates a sub-admin with only `retail.products.view`. That sub-admin sees Products read-only, cannot see Invoices/Banks in the nav, and receives `403` from those APIs.
4. The client admin attempts to grant `retail.payroll.run` (not held). The request fails with `PERMISSION_ESCALATION`; the UI never even shows unavailable permissions.
5. A token for Client A cannot read Client B data even when IDs are guessed. Cross-tenant access returns `404` or `403`, never data.
6. Disabling a module immediately blocks its routes and sessions; the DB is retained per policy and no other module is affected.
7. A failed provisioning job is retryable, leaves no partial access, and logs the failure. No client module becomes `active` until every step succeeds.
8. Revoking a permission takes effect on the next request without requiring re-login.
9. Every create/update/delete/approve/provision/impersonate action appears in both the module audit and the platform audit with actor, before/after, and timestamp.
10. Dashboards show only cards the current user can view.
11. Layout passes at 375, 768, 1024, and 1440 with no horizontal overflow except scrollable tables.
12. Typecheck, lint, and tests pass; no console errors.
13. Super Admin opens the All Modules explorer, sees every client × module instance with status and health, and opens any of them without being a member. School, HR, Retail, and Accounts all render their normal dashboards and navigation under a persistent platform-access banner.
14. Super Admin enters a module in Inspect mode and write attempts are blocked; switching to Support mode requires a reason, then writes succeed and every action is recorded in the module audit and platform audit with `platform_override = true`.
15. Super Admin module access never creates memberships or tenant grants; a client admin's permission list is unchanged after the Super Admin visits and operates the module.
16. A suspended or archived module opens read-only with its status shown; the Super Admin cannot use module access to drop or deprovision a tenant database — that remains a platform-console action.
17. Every module dashboard and the platform overview show exactly one gradient hero card and one black pill CTA, use the lavender canvas, floating white sidebar, 24px borderless cards, pill bars, and hatched not-yet states, and match `design.md`. No old violet-on-white button styling remains.

## 13. SECURITY CHECKLIST

- Argon2id passwords, mandatory MFA for Super Admin, session rotation and revocation.
- httpOnly/Secure/SameSite cookies, CSRF protection, strict CORS.
- Server-side authorization on every request; never trust permissions sent by the client.
- Parameterized queries only; validation with a schema library on every input.
- Secrets manager/KMS for tenant DB credentials; no secrets in logs or the repo.
- Least-privilege DB users; separate migration users.
- Immutable audit trail for platform and module actions.
- Super Admin module access defaults to read-only Inspect mode; Support mode requires an explicit reason switch, is time-boxed, and is fully audited.
- Platform module-access tokens are short-lived, scoped to one client + module, revocable, and rejected by tenant-only endpoints.
- Rate limits, account lockout, invite expiry, signed URLs for uploads.
- File upload validation: type, size, malware scan hook.
- Backups encrypted; restore tested; retention policy enforced.
- Tenant isolation tests in CI, including automated cross-tenant probes.
- No stack traces or SQL details in client-facing errors.

## 14. NON-GOALS

Native mobile apps, real payment gateway charges, e-invoicing integrations, WhatsApp/SMS delivery, AI forecasting, and third-party accounting sync. Leave clean integration seams for these.

## 15. DELIVERABLES

1. Runnable full-stack app with `npm run dev`, database setup script, and `.env.example`.
2. Control plane migrations, four module migration sets, and seed scripts.
3. Provisioning worker with retries, progress, and audit.
4. Super Admin console, All Modules explorer, Inspect/Support module access, and client workspace with all screens above.
5. Permission engine with delegation invariant, platform override, and automated tests for escalation, override auditing, and tenant isolation.
6. Component library matching `design.md`.
7. README covering architecture, provisioning, module setup, Super Admin module access, demo accounts, and how to add a new module.
8. Tests: permission resolution, cross-tenant isolation, provisioning idempotency, Super Admin module access (Inspect/Support), and critical retail flows (invoice → stock → refund).

## OUTPUT FORMAT

Before coding, produce:

1. Architecture diagram in text (control plane, tenant DBs, request flow).
2. Route map for platform and client.
3. Permission catalog and role presets.
4. Database schema summary per module.
5. Build plan in phases.

Then implement end to end without stopping at a scaffold. Run typecheck, lint, and tests; fix failures before finishing.

---

## PASTE YOUR STYLING HERE

<!-- Add your CSS, Tailwind theme, fonts, or brand assets below. Where they conflict with the
     tokens above, your styling wins visually. Do not change the layout logic, permission rules,
     tenancy model, or screen inventory. -->

```css
/* YOUR STYLING */
```

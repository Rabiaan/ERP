# Lilac Office — Permission Model

Source of truth in code: [`server/src/authz/catalog.ts`](../server/src/authz/catalog.ts) and
[`server/src/authz/resolver.ts`](../server/src/authz/resolver.ts).

---

## 1. Grammar

```text
<namespace>.<resource>.<action>

namespace = platform | administration | school | hr | retail | accounts
action    = view | create | update | delete | approve | export | print | manage
            (extended: run | collect | post for specific workflows)
```

Wildcards are accepted only in **grant presets** and in Super Admin grant requests
(`retail.*` expands to the catalog). They are never stored as wildcard grants — the catalog is
expanded and each concrete key is materialized in `role_grants`. The server never evaluates a
wildcard at request time.

---

## 2. Catalog

### Platform (never delegable to tenants)

```text
platform.clients.view          platform.clients.manage
platform.modules.manage        platform.modules.access
platform.modules.support       platform.users.manage
platform.plans.manage          platform.provisioning.manage
platform.audit.view            platform.usage.view
platform.health.view           platform.impersonate.manage
```

### Administration (client-wide, available when any module is enabled)

```text
administration.users.manage    administration.roles.manage
administration.company.manage  administration.branches.manage
administration.tax.manage      administration.settings.manage
administration.audit.view
```

### Retail

```text
retail.dashboard.view
retail.products.{view,create,update,delete,export}
retail.customers.{view,create,update,delete,export}
retail.vendors.{view,create,update,delete,export}
retail.stock.{view,update,export}
retail.expenses.{view,create,update,delete,approve,export}
retail.invoices.{view,create,update,delete,approve,print,export}
retail.sales.{view,export}
retail.refunds.{view,create,approve,print,export}
retail.banks.{view,create,update,delete,manage,export}
retail.purchases.{view,create,update,approve,export}
retail.purchase_returns.{view,create,approve,export}
retail.salesmen.{view,create,update,delete,export}
retail.reports.{view,export}
```

### HR

```text
hr.dashboard.view
hr.employees.{view,create,update,delete,export}
hr.departments.{view,create,update,delete}
hr.org_chart.view
hr.onboarding.{view,create,update}
hr.attendance.{view,create,update,approve,export}
hr.timesheets.{view,create,update,approve,export}
hr.shifts.{view,create,update,delete}
hr.leave.{view,create,update,approve,export}
hr.payroll.{view,run,approve,export}
hr.payslips.{view,print,export}
hr.salary_structures.{view,create,update,delete,export}
hr.job_openings.{view,create,update,delete}
hr.candidates.{view,create,update,delete}
hr.interviews.{view,create,update}
hr.goals.{view,create,update,delete}
hr.reviews.{view,create,update,approve}
hr.documents.{view,create,update,delete,export}
hr.assets.{view,create,update,delete}
hr.announcements.{view,create,update,delete}
hr.reports.{view,export}
```

### School

```text
school.dashboard.view
school.students.{view,create,update,delete,export}
school.guardians.{view,create,update,delete}
school.classes.{view,create,update,delete}
school.subjects.{view,create,update,delete}
school.attendance.{view,create,update,export}
school.exams.{view,create,update,delete,approve}
school.grades.{view,create,update,export}
school.fees.{view,create,update,delete,collect,approve,export,print}
school.staff.{view,create,update,delete}
school.timetable.{view,create,update,delete}
school.transport.{view,create,update,delete}
school.admissions.{view,create,update,approve}
school.reports.{view,export}
```

### Accounts

```text
accounts.dashboard.view
accounts.chart_of_accounts.{view,create,update,delete,manage}
accounts.journals.{view,create,update,delete,post,export,print}
accounts.ledgers.{view,export}
accounts.receivables.{view,export}
accounts.payables.{view,export}
accounts.banks.{view,create,update,manage,export}
accounts.tax.{view,manage,export}
accounts.fiscal_periods.{view,manage}
accounts.reports.{view,export}
```

---

## 3. Role presets

Presets expand to concrete keys at grant time.

| Preset | Expansion |
| --- | --- |
| Viewer | every `<module>.<resource>.view` plus `<module>.reports.export` |
| Operator | Viewer + `create`/`update` on operational resources (products, customers, vendors, invoices, expenses, purchases, stock, attendance, leave, candidates, students, fees, journals) + `print` |
| Manager | Operator + `approve` on approvals (invoices, refunds, expenses, purchases, leave, payroll, exams, admissions) + `delete` on operational resources |
| Module Admin | every `<module>.*` permission for that module + `administration.audit.view` |
| Client Admin | every permission for all enabled modules + every `administration.*` |

Super Admin selectable presets when granting a module: Viewer, Operator, Manager, Module Admin,
or a full permission tree with per-resource/action checkboxes.

---

## 4. Resolution algorithm

```ts
type ActorContext =
  | { kind: 'tenant'; userId; clientId; moduleKey; membershipId; }
  | { kind: 'platform'; userId; clientId; moduleKey; mode: 'inspect' | 'support'; accessId; }

function effective(membershipId, seen = new Set(), depth = 0): Set<PermissionKey> {
  if (depth > 4 || seen.has(membershipId)) return new Set();
  seen.add(membershipId);

  const m = loadMembership(membershipId);
  if (!m || m.status !== 'active') return new Set();

  let granted = directGrants(m.id);                    // role_grants rows

  if (m.created_by_membership_id) {
    granted = intersect(granted, effective(m.created_by_membership_id, seen, depth + 1));
  }

  return intersect(granted, entitledPermissions(m.client_id));  // active modules + administration
}

function entitledPermissions(clientId): Set<PermissionKey> {
  const modules = activeModules(clientId);             // client_modules.status = 'active'
  return catalogKeys.filter(k =>
    modules.has(prefixOf(k)) || prefixOf(k) === 'administration');
}
```

Invariants:

1. **Delegation:** a creator can never grant more than they hold.
   `requested ⊆ effective(creator)` and `requested ⊆ entitled(client)`, otherwise
   `403 PERMISSION_ESCALATION`. Enforced on create **and** edit, server-side.
2. **Revocation propagation:** because effective permissions are recomputed from the chain on every
   request, revoking a grant from a creator also removes it from every descendant.
3. **No self-editing grants:** a membership cannot change its own permission set.
4. **Last client admin:** an active `client_admin` membership cannot be suspended, demoted, or deleted
   when it is the last one.
5. **Platform keys:** never appear in tenant pickers and are rejected by the delegation validator.
6. **Disabled modules:** contribute zero permissions. A suspended/archived module blocks all its routes.
7. **`permissions_hash`:** `sha256(sorted(effective)).slice(0, 16)` is included in the JWT for
   diagnostics, but authorization always recomputes from the database.

---

## 5. Super Admin module access (override)

```text
POST /api/platform/access/enter { client_id, module_key, mode, reason }
  → validates client + module exist and are not archived
  → platform_module_access row (expires_at = now + 30 min)
  → signed module-scoped token: { actor_type: 'platform', platform_override: true,
      client_id, module_key, mode, access_id, exp: 30m }
POST /api/platform/access/exit { access_id }
```

| Mode | Allowed | Audit |
| --- | --- | --- |
| `inspect` (default) | `GET`/`HEAD` on every module screen and record | Entry, exit, exports, and periodic access |
| `support` | `GET`/`HEAD` + mutations, reason required and displayed | Every mutation with `platform_override = true`, reason, before/after |

Rules:

- No membership row and no tenant grant is created or required.
- The token is scoped to one client + module; it is rejected by platform routes other than
  `/access/exit` and by any other module route.
- It cannot drop, delete, or deprovision a tenant database — those live only in the platform console.
- Inspect mode blocks writes with `403 FORBIDDEN` and `mode: "inspect"`.
- Archived modules open read-only in Inspect and show their status.

---

## 6. UI gating

- Navigation is filtered by `view` permission and module entitlement.
- Actions without permission render disabled with a tooltip explaining the missing key; they are never
  hidden in a way that makes the layout shift unexpectedly.
- Platform navigation is never rendered to tenant actors.
- Client route guards are convenience only. Every API request re-authorizes server-side.

---

## 7. Test matrix

| Test | Expected |
| --- | --- |
| Sub-admin requests a key the creator lacks | `403 PERMISSION_ESCALATION` |
| Sub-admin requests an entitled key the creator holds | `201`, grant materialized |
| Creator loses a key after creating a sub-admin | Sub-admin loses it on the next request |
| Product viewer calls `GET /invoices` | `403 FORBIDDEN` |
| Client A token uses Client B record id | `404` (query runs in A's database) |
| Disabled module request | `403 MODULE_NOT_ENABLED` |
| Provisioning module request | `503 MODULE_PROVISIONING` |
| Platform inspect `POST` | `403 FORBIDDEN` |
| Platform support `POST` | `200`, audit has `platform_override = true` |
| Platform module access creates memberships | None |
| Last client admin removed | `409 CONFLICT` |
| Sub-admin edits own grants | `403 FORBIDDEN` |

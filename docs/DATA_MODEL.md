# Lilac Office — Data Model

Two physical layers: the control plane database (`erp_platform`) and one database per client × module.
SQL lives in [`db/migrations`](../db/migrations). All money is `numeric(14,2)`, all rates `numeric(14,4)`,
all timestamps `timestamptz`, all primary keys `uuid` (except catalog keys).

Conventions applied to every business table:

```text
id uuid pk default gen_random_uuid()
client_id uuid not null
module_key text not null
created_by uuid
updated_by uuid
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
deleted_at timestamptz
```

`updated_at` is maintained by `set_updated_at()`. Tenant tables have RLS enabled and forced with a
policy `client_id = app.current_client_id()`. Soft-deleted rows are filtered by the API, never physically
removed except by explicit purge jobs.

---

## 1. Control plane (`erp_platform`)

### Identity and access

| Table | Key columns | Notes |
| --- | --- | --- |
| `platform_users` | `id`, `email citext unique`, `password_hash`, `mfa_secret_enc`, `mfa_enabled`, `status`, `must_change_password`, `failed_login_count`, `locked_until`, `last_login_at` | Super admins only. Separate realm from tenants. |
| `users` | `id`, `email citext unique`, `password_hash`, `full_name`, `status`, `mfa_enabled`, `mfa_secret_enc`, `must_change_password`, `failed_login_count`, `locked_until`, `invited_by`, `invite_expires_at` | Tenant identities. A user may hold memberships in several clients. |
| `sessions` | `id`, `actor_type`, `realm`, `user_id`, `refresh_token_hash`, `csrf_secret`, `expires_at`, `refresh_expires_at`, `revoked_at`, `ip`, `user_agent` | Refresh rotation and immediate revocation. |
| `invite_tokens` | `id`, `user_id`, `client_id`, `token_hash`, `expires_at`, `used_at`, `created_by` | Invite expiry; never store the raw token. |
| `platform_module_access` | `id`, `platform_user_id`, `client_id`, `module_key`, `mode check (inspect/support)`, `reason`, `started_at`, `ended_at`, `revoked_at`, `expires_at` | Scoped, time-boxed Super Admin access. |
| `impersonation_sessions` | `id`, `platform_user_id`, `target_user_id`, `client_id`, `reason`, `started_at`, `ended_at` | Explicit reason; blocked for destructive platform actions. |

### Tenancy and entitlements

| Table | Key columns | Notes |
| --- | --- | --- |
| `plans` | `id`, `key unique`, `name`, `max_users`, `max_branches`, `max_modules`, `storage_mb`, `price_pkr` | Limits read at provisioning time. |
| `clients` | `id`, `name`, `slug unique`, `status check (provisioning/active/suspended/archived)`, `plan_id`, `max_users`, `max_branches`, `created_by`, timestamps | `slug` is sanitized for DB names. |
| `modules` | `key pk`, `name`, `latest_version`, `migration_path`, `is_active` | `school`, `hr`, `retail`, `accounts`. |
| `client_modules` | `id`, `client_id`, `module_key`, `status`, `granted_by`, `db_name`, `db_secret_ref`, `schema_version`, `created_at` | Unique `(client_id, module_key)`. The only source of module entitlement. |
| `memberships` | `id`, `user_id`, `client_id`, `module_key`, `role`, `status`, `created_by`, `created_by_membership_id` | `created_by_membership_id` is the delegation chain. Unique `(user_id, client_id, module_key)`. |
| `roles` | `id`, `client_id`, `module_key`, `name`, `permissions_json`, `created_by`, `created_by_membership_id` | Templates only. |
| `permissions` | `key pk`, `module_key`, `resource`, `action`, `description` | Catalog seeded from `server/src/authz/catalog.ts`. |
| `role_grants` | `id`, `membership_id`, `permission_key fk permissions`, `role_id`, `granted_by`, `granted_at` | Materialized effective grants. Unique `(membership_id, permission_key)`. |

### Provisioning, registry, operations

| Table | Key columns | Notes |
| --- | --- | --- |
| `provisioning_jobs` | `id`, `client_id`, `module_key`, `step`, `status check (queued/running/succeeded/failed/cancelled)`, `attempts`, `last_error`, `steps jsonb`, `started_at`, `finished_at` | Idempotent; unique active job per `(client_id, module_key)`. |
| `db_registry` | `client_id`, `module_key`, `db_name unique`, `secret_ref`, `pool_config jsonb`, `health`, `schema_version`, `last_checked_at` | PK `(client_id, module_key)`. `secret_ref` is an encrypted connection string. |
| `usage_counters` | `client_id`, `module_key`, `metric`, `value`, `period_start` | Quotas and billing. |
| `audit_events` | `id`, `actor_type`, `actor_id`, `client_id`, `module_key`, `action`, `entity`, `entity_id`, `before jsonb`, `after jsonb`, `ip`, `user_agent`, `request_id`, `platform_override`, `created_at` | Append-only trigger. |
| `rate_limit_buckets` | `bucket_key`, `window_start`, `count` | Fixed-window limiter shared by replicas. |
| `platform_events` | `id`, `type`, `payload jsonb`, `created_at`, `processed_at` | Outbox seam for `module.provisioned`, audits, notifications. |
| `platform_migrations` | `version pk`, `checksum`, `applied_at` | Checksummed control-plane runner ledger. |

The control plane is a single service database, so tenant-style RLS does not apply to most tables; access
is limited to `lilac_platform_app` by grants. `audit_events` is additionally forced through RLS with
select/insert policies only, so it stays append-only even if a future grant is misconfigured.

---

## 2. Shared tenant tables (every module DB)

| Table | Columns | Purpose |
| --- | --- | --- |
| `tenant_meta` | `client_id`, `module_key`, `schema_version`, `created_at` | Singleton identity guard. |
| `module_users` | `id`, `user_id unique`, `display_name`, `email`, `role_label`, `status`, `created_at` | Opaque mirror of control-plane users for display and FK-free joins. |
| `module_settings` | `id`, `settings jsonb`, `updated_at` | Branch/warehouse defaults, currency, tax defaults, numbering series. |
| `module_audit` | `id`, `actor_id`, `actor_type`, `client_id`, `action`, `entity`, `entity_id`, `before jsonb`, `after jsonb`, `reason`, `platform_override`, `request_id`, `ip`, `created_at` | Append-only. |
| `__migrations` | `version`, `name`, `applied_at`, `checksum` | Runner idempotency. |
| `branches` | common columns + `code`, `name`, `address`, `is_default` | Every module. |
| `warehouses` | common columns + `branch_id`, `code`, `name`, `is_default` | Retail, school stores. |
| `tax_codes` | common columns + `code`, `name`, `rate`, `is_inclusive` | Retail/accounts. |
| `numbering_series` | common columns + `key`, `prefix`, `next_number`, `padding` | Invoice/ledger numbers. |

RLS: enabled and forced on every table above except `__migrations`; policy `client_id = app.current_client_id()`.
The migration runner connects as the migration role, sets `app.client_id` before seeding.

---

## 3. Retail module

```text
categories          id, name, parent_id, is_active
products            sku unique, name, category_id, unit, cost_price, sale_price,
                    tax_code_id, reorder_level, is_active
product_stock       product_id, branch_id, warehouse_id, quantity, unique(product,warehouse)
stock_movements     product_id, warehouse_id, type(in/out/adjust/transfer), quantity,
                    reference_type, reference_id, note
customers           code unique, name, phone, email, city, credit_limit,
                    opening_balance, balance, is_active
vendors             code unique, name, phone, email, terms_days, opening_balance,
                    balance, is_active
salesmen            name, phone, commission_rate, territory, is_active
invoices            number unique, customer_id, branch_id, warehouse_id, salesman_id,
                    date, subtotal, discount, tax, total, paid, balance,
                    status(draft/finalized/paid/void), created_by
invoice_lines       invoice_id, product_id, description, quantity, rate, discount,
                    tax, line_total
purchase_orders     number unique, vendor_id, warehouse_id, date, subtotal, tax,
                    total, status(draft/ordered/received/cancelled)
purchase_order_lines order_id, product_id, quantity, rate, tax, line_total
purchases           number unique, purchase_order_id, vendor_id, warehouse_id, date,
                    subtotal, tax, total, paid, balance, status(draft/received/paid/void)
purchase_lines      purchase_id, product_id, quantity, rate, tax, line_total
purchase_returns    number unique, purchase_id, vendor_id, date, total, reason,
                    status(pending/approved/rejected)
refunds             number unique, invoice_id, customer_id, date, total, method,
                    reason, status(pending/approved/rejected), approved_by
expenses            date, category, account_id, bank_id, amount, reference,
                    attachment_url, status(pending/approved/void), approved_by
banks               name, account_number, opening_balance, current_balance, is_active
bank_transactions   bank_id, date, type(deposit/withdrawal/transfer), amount,
                    reference, note
```

Critical flow (transactional):

```text
invoice create/finalize
  lock stock rows (SELECT ... FOR UPDATE)
  validate quantity available
  insert invoice + lines
  decrement product_stock, insert stock_movements (out)
  update customer balance when credit
  write module audit + platform audit

refund approve
  validate remaining refundable quantity per line
  increment stock, insert movement (in)
  reduce customer balance / record refund
  mark approved, audit both trails
```

---

## 4. HR module

```text
departments         name, code, head_employee_id, is_active
locations           name, address, timezone, country
employees           employee_no unique, first_name, last_name, email unique, phone,
                    dob, gender, address, department_id, title, manager_id,
                    location_id, employment_type, status, hire_date, exit_date,
                    salary_base, emergency_contact jsonb
attendance          employee_id, date, clock_in, clock_out, hours,
                    status(present/late/absent/remote), source, notes, unique(employee,date)
leave_types         name, code, annual_quota, is_paid
leave_balances      employee_id, leave_type_id, year, entitled, used, pending
leave_requests      employee_id, leave_type_id, start_date, end_date, days, reason,
                    status(pending/approved/rejected), approver_id, decided_at, comment
salary_structures   employee_id, base, allowances jsonb, deductions jsonb,
                    currency, effective_from
pay_runs            period_label, period_start, period_end, pay_date,
                    status(draft/processing/approved/paid), totals, approved_by
payslips            pay_run_id, employee_id, base, allowances, deductions, gross,
                    net, currency, payment_method, status
job_openings        title, department_id, location_id, type, status, hiring_manager_id,
                    opened_at, experience_level
candidates          job_id, name, email, phone, stage, source, rating,
                    applied_date, resume_url, notes
interviews          candidate_id, interviewer_id, scheduled_at, mode, meet_link, status
goals               employee_id, title, description, category, progress, due_date, status
review_cycles       name, period, status, due_date
reviews             cycle_id, employee_id, reviewer_id, rating, status, comments
documents           employee_id, type, name, file_url, uploaded_by, expires_at, status
```

HR dashboard: present today, headcount, on leave, open roles, payroll MTD, attendance rate,
leave by type, department distribution, pending approvals.

---

## 5. School module

```text
students            admission_no unique, first_name, last_name, dob, gender,
                    guardian_id, class_id, section_id, status, admitted_on
guardians           name, relation, phone, email, cnic, address
student_guardians   student_id, guardian_id, is_primary
classes             name, code, level, capacity
sections            class_id, name, class_teacher_id
subjects            name, code, class_id, is_elective
enrollments         student_id, class_id, section_id, academic_year, status
attendance          student_id, class_id, section_id, date, status, remarks
exams               name, term, starts_on, ends_on, class_id, status
grades              exam_id, student_id, subject_id, marks_obtained, max_marks, grade
fee_heads           name, code, amount, frequency, is_optional
fee_invoices        number unique, student_id, period, due_date, subtotal, discount,
                    total, paid, balance, status
fee_payments        invoice_id, student_id, date, amount, method, reference,
                    received_by, status
staff               employee_no, name, role, department, phone, email, status
timetable           class_id, section_id, subject_id, teacher_id, day_of_week,
                    start_time, end_time, room
transport_routes    name, vehicle_no, driver_name, driver_phone, capacity, fee
```

School dashboard: fee collection vs target, total students, present today, outstanding fees,
classes, upcoming exams, admissions pipeline, attendance trend, recent payments.

---

## 6. Accounts module

```text
chart_of_accounts   code unique, name, type(asset/liability/equity/income/expense),
                    parent_id, is_group, is_active
fiscal_periods      name, starts_on, ends_on, status(open/closed/locked)
journal_entries     number unique, date, period_id, memo, source,
                    status(draft/posted/void), posted_by, posted_at
journal_lines       journal_entry_id, account_id, debit, credit, description
bank_accounts       name, account_number, bank_name, opening_balance, current_balance
bank_reconciliations date, bank_account_id, statement_balance, ledger_balance,
                    status(open/reconciled), reconciled_by
ar_open_items       customer_ref, invoice_ref, date, due_date, original, paid, balance, bucket
ap_open_items       vendor_ref, bill_ref, date, due_date, original, paid, balance, bucket
```

Journal posting enforces `sum(debit) = sum(credit)` and a non-locked fiscal period.
Accounts dashboard: cash and bank position, revenue vs expense, AR/AP aging, trial balance, recent journals, tax liability.

---

## 7. Indexes that matter

- Control: `memberships(user_id, client_id)`, `role_grants(membership_id)`, `client_modules(status)`,
  `audit_events(client_id, created_at desc)`, `sessions(user_id, revoked_at)`,
  `platform_module_access(platform_user_id, started_at desc)`.
- Every tenant business table: `(client_id, deleted_at)`, plus natural lookups:
  `products(sku)`, `invoices(number)`, `customers(code)`, `attendance(employee_id, date)`,
  `leave_requests(status, start_date)`, `students(admission_no)`, `journal_entries(date)`.
- Partial indexes exclude soft-deleted rows where the table is large.

---

## 8. Seed shape

| Dataset | Volume |
| --- | --- |
| Platform | owner super admin, 3 plans |
| Clients | Northwind Studios (hr + retail), Beacon Academy (school), Meridian Traders (retail + accounts) |
| Retail | 60 products, 40 customers, 15 vendors, 3 warehouses, 120 invoices, 25 purchases, 12 refunds, 6 banks, 8 salesmen, 40 expenses, 12 months of sales |
| School | 300 students, 18 classes, 40 staff, 12 months of fee payments |
| HR | 48 employees, 30 days attendance, 20 leave requests, 3 pay runs |
| Accounts | chart of accounts, 100 journals, AR/AP open items |
| Scoped demo user | Products viewer with `retail.products.view` only |

Seeding is idempotent for the platform catalog and namespaced by fixed UUIDs for demo clients.

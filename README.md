# Lilac Office — Multi-tenant ERP

Lilac Office is a database-per-client-per-module ERP built with React/Vite and Node/Express/PostgreSQL. It has a platform control plane for Super Admins and permission-scoped client workspaces for HR, Retail, School, and Accounts.

Visual source of truth: [`design.md`](design.md). Delivery scope and acceptance criteria: [`BUILD_PROMPT_MULTITENANT.md`](BUILD_PROMPT_MULTITENANT.md). Current phase status: [`PHASES.md`](PHASES.md).

## Architecture

```text
Browser (React/Vite, port 3000)
  -> API (Express, port 3001)
     -> erp_platform         clients, modules, users, memberships, grants, jobs, audit
     -> tenant_<client>_<module>   isolated business data per enabled module

Platform realm: Super Admin, MFA required, module access is scoped and audited.
Tenant realm:   client users, permission-filtered routes/APIs, one active module per session.
```

The API resolves permissions server-side on every request. Client-side navigation only reflects the effective permissions returned by the API. A platform override never grants tenant membership; Inspect is read-only and Support requires a reason.

Key entry points:

- `src/App.tsx` — platform, auth, and workspace routes.
- `src/context/AuthContext.tsx` — realm/session state, MFA, password change, module access.
- `src/components/shell/AppShell.tsx` — platform/workspace shell and permission-filtered navigation.
- `src/pages/platform/PlatformPages.tsx` — control plane screens.
- `src/pages/workspace/` — workspace and admin screens.
- `server/src/index.ts` — API composition.
- `server/src/routes/` — platform, workspace, and auth endpoints.
- `server/src/authz/` — permission catalog and resolution.
- `server/src/provisioning/` — database create/migrate/deprovision jobs.
- `db/migrations/` — platform schema migrations.
- `server/src/modules/descriptors.ts` — generic CRUD resource descriptors.
- `server/src/scripts/seed.ts` — reproducible demo data.

## Local setup

Prerequisites: Node 20+, npm, Docker Desktop, and a PostgreSQL-compatible `pg_dump` or the seeded Docker container.

```powershell
npm install
Copy-Item .env.example .env
# Replace APP_SECRET and KMS_LOCAL_KEY with generated values in .env.
npm run db:up
npm run db:provision:setup
npm run db:setup
npm run dev:full
```

Open `http://localhost:3000`. Do not use `http://127.0.0.1:3000`; the API allows only the configured `APP_URL` origin.

Useful checks:

```powershell
npm run typecheck
npm test
npm run build:all
npm run security:gates
npm run db:provision:smoke
```

After a Docker volume reset, rerun `npm run db:provision:setup` before `npm run db:setup`. Detailed Windows notes are in [`docs/LOCAL_SETUP.md`](docs/LOCAL_SETUP.md).

## Demo accounts

`npm run db:setup` creates these users with the initial password `ChangeMe123!`:

| Email | Role | Scope |
| --- | --- | --- |
| `owner@lilacoffice.app` | Super Admin | Platform console; forced password change + MFA enrollment on first sign-in |
| `admin@northwindstudios.com` | Client Administrator | Northwind HR and Retail |
| `hr@northwindstudios.com` | HR Manager | Northwind HR |
| `retail@northwindstudios.com` | Retail Manager | Northwind Retail |
| `admin@beaconacademy.edu` | Client Administrator | Beacon Academy School |
| `registrar@beaconacademy.edu` | School Registrar | Beacon Academy School |
| `admin@meridiantraders.com` | Client Administrator | Meridian Accounts and Retail |
| `accounts@meridiantraders.com` | Accounts Manager | Meridian Accounts |
| `products.viewer@meridiantraders.com` | Products Viewer | Read-only Retail Products |

The Super Admin can open any client module from the platform console without being a member. Every entry is logged; Inspect is read-only and Support is a separate, reason-backed write mode.

## Provisioning

Enable a module from the platform console or `POST /api/platform/clients/:id/modules`. The control plane records a job, creates `tenant_<client>_<module>`, applies tenant migrations, registers encrypted credentials, seeds module data, then activates the module. Failed jobs leave no partial access and are retryable.

Deprovisioning is asynchronous: revoke sessions and access first, snapshot the database, then archive and drop it. Destructive operations are never handled from a workspace route. Run `npm run db:provision:worker` in production to process queued jobs; `npm run db:provision:smoke` performs a full local create/deprovision check.

## Adding a module

1. Add the key to `TenantModuleKey` in `server/src/authz/catalog.ts` and add its permission keys.
2. Add descriptor entries in `server/src/modules/descriptors.ts`.
3. Add tenant schema SQL under `db/migrations/<module>/` and upgrade logic in the provisioning service.
4. Add the module key to `MODULE_KEYS` in `src/App.tsx` and `src/pages/platform/PlatformPages.tsx`.
5. Add navigation in `src/lib/nav.ts` and screens under `src/pages/workspace/`.
6. Add seed data in `server/src/scripts/seed.ts` and integration coverage under `server/tests/`.
7. Rerun typecheck, tests, build, security gates, provisioning smoke, and the browser gate.

Keep permissions server-authoritative: UI gating is not an authorization boundary.

## Verification and code map

Phase 13 results and the acceptance-test 1–17 matrix are in [`docs/PHASE13_VERIFICATION.md`](docs/PHASE13_VERIFICATION.md).

For agents navigating the codebase, start with [`AGENTS.md`](AGENTS.md) and the committed Graphify outputs in `graphify-out/`:

- `graphify-out/wiki/index.md` — community-by-community map.
- `graphify-out/GRAPH_REPORT.md` — structure, bridge nodes, and suggested questions.
- `graphify-out/graph.html` — interactive graph.
- `graphify-out/erp-callflow.html` — request/call-flow diagrams.
- `graphify-out/graph.json` — raw graph for `graphify query`, `path`, and `explain`.

## Design

The Lavender Canvas design system uses a gradient app canvas, floating white sidebar, 24px borderless cards, one gradient hero per page, one black pill CTA, tabular numerals, and hatched empty states. See [`design.md`](design.md) and the Phase 13 visual checks in [`docs/PHASE13_VERIFICATION.md`](docs/PHASE13_VERIFICATION.md).

# Frontend Audit Report — Lilac Office ERP

**Repo:** `C:\Users\user1\Downloads\erp`
**Status:** Not a git repository (`.git` absent; git commands return `fatal: not a git repository`)
**Audit date:** 2026-11-21
**Scope:** Frontend only (`src/`, `vite.config.ts`, `tsconfig.json`, `package.json`). No source code changes were made. No screenshots were captured.

---

## 1. Stack & Build

| Area | Finding |
|------|---------|
| Framework | React 19.0.1 + React DOM 19.0.1 |
| Bundler | Vite 8.3.5 (`@tailwindcss/vite` ^4.3.3 plugin, `@vitejs/plugin-react` ^6.1.1) |
| Styling | Tailwind CSS 4.3.3 configured via `@tailwindcss/vite` Vite plugin (no `tailwind.config.js`, no `postcss.config.js`) |
| Routing | react-router-dom 7.18.5 (BrowserRouter) |
| Icons | lucide-react 0.546.0 |
| Charts | recharts 3.10.1 |
| Dates | date-fns 4.4.0 |
| Animation | motion 12.23.24 |
| CSS utils | clsx 2.1.1, tailwind-merge 3.7.0 |
| State | React context (`AppContext`, `AuthContext`) |
| HTTP client | Custom fetch wrapper (`src/api/client.ts`) with envelope parsing |
| Validation | zod 4.6.7 (server-side shared types) |
| Fonts | @fontsource/inter, @fontsource/ibm-plex-sans (loaded as CSS @import in `src/index.css`) |
| TypeScript | typescript ^7.0.2 (`tsconfig.json`, `tsconfig.server.json`) |
| Node | v24.12.0 |

**Build output:**
- `npm run build` — passes in 4.36s. One chunk-size warning: `index-Bn-jSws4.js` is 654.93 kB (minified), above the 500 kB default threshold. Suggested: dynamic `import()` for route-level code splitting.
- Largest app chunk by far: `ReportsPage` at 404.08 kB raw / 115.97 kB gzip — prime candidate for lazy loading.
- Font assets dominate raw size (~300 kB across ~40 font variants); gzip mitigates to ~13–15 kB for CSS.

**CSS entry:** `src/index.css` imports `@tailwindcss/vite` and `@fontsource/*`. No design tokens file found; spacing/colors/radius are hardcoded as arbitrary Tailwind values throughout components (e.g. `rounded-[24px]`, `bg-[#F4F3FB]`, `text-[#0E0E12]`).

---

## 2. Routing & Navigation

### Route map (`src/App.tsx`)

| Route | Component | Auth scope |
|-------|-----------|------------|
| `/login` | LoginPage | public |
| `/accept-invite` | AcceptInvitePage | public |
| `/forgot-password` | ForgotPasswordPage | public |
| `/platform/*` | PlatformRoute (RequireAuth scope=platform) | platform |
| `/platform` | PlatformOverviewPage | platform |
| `/platform/clients` | ClientsPage | platform |
| `/platform/clients/new` | ClientNewPage | platform |
| `/platform/clients/:clientId` | ClientDetailPage | platform |
| `/platform/modules` | ModulesPage | platform |
| `/platform/modules/instances` | ModuleInstancesPage | platform |
| `/platform/provisioning` | ProvisioningPage | platform |
| `/platform/plans` | PlansPage | platform |
| `/platform/access-log` | AccessLogPage | platform |
| `/platform/audit` | PlatformAuditPage | platform |
| `/platform/health` | PlatformHealthPage | platform |
| `/platform/platform-users` | PlatformUsersPage | platform |
| `/w/:module/*` | WorkspaceRoute (RequireAuth scope=workspace) | workspace |
| `/w/:module/dashboard` | WorkspaceDashboardPage | workspace |
| `/w/:module/administration/:adminSection` | WorkspaceAdminPage | workspace |
| `/w/:module/duplicate-bill` | DuplicateBillPage (retail only) | workspace |
| `/w/:module/employees` | HrPrototypeRoute → EmployeesPage | workspace (hr) |
| `/w/:module/org-chart` | HrPrototypeRoute → OrgChartPage | workspace (hr) |
| `/w/:module/onboarding` | HrPrototypeRoute → OnboardingPage | workspace (hr) |
| `/w/:module/attendance` | HrPrototypeRoute → AttendancePage | workspace (hr) |
| `/w/:module/leave` | HrPrototypeRoute → LeavePage | workspace (hr) |
| `/w/:module/payroll` | HrPrototypeRoute → PayrollPage | workspace (hr) |
| `/w/:module/recruitment` | HrPrototypeRoute → RecruitmentPage | workspace (hr) |
| `/w/:module/performance` | HrPrototypeRoute → PerformancePage | workspace (hr) |
| `/w/:module/workplace` | HrPrototypeRoute → WorkplacePage | workspace (hr) |
| `/w/:module/reports` | HrPrototypeRoute → ReportsPage | workspace (hr) |
| `/w/:module/settings` | (filtered out of HR_LEGACY_ROUTES) | — |
| `/w/:module/:resource` | ResourcePage (generic CRUD) | workspace |
| `/w/:module/employees/:id` | EmployeeDetailPage | workspace (hr) |
| `/employees/:id` | LegacyEmployeeAlias → `/w/hr/employees/:id` | redirect |
| `/*` (legacy screens) | LegacyAlias → `/w/hr/:screen` | redirect |
| `/*` (fallback) | Navigate to `/` | redirect |

**Module keys:** `hr`, `retail`, `school`, `accounts`.

### Navigation config (`src/lib/nav.ts`)
- `platformNav`: Control plane (Overview, Clients, Module catalog, All modules, Provisioning, Plans & usage) + Governance (Access log, Audit trail, System health, Platform users).
- `workspaceNav(module)`: per-module sections. HR has full section (People: Dashboard, Employees, Org chart, Onboarding, Attendance, Leave, Payroll, Recruitment, Performance, Workplace, Reports, Administration). Retail/School/Accounts generate resource routes from a `resource()` helper.
- Each nav item carries a `permission` string; `AppShell` filters items by `auth.can(permission)`.
- `HR_LEGACY_ROUTES`: legacy top-level paths that redirect to `/w/hr/<screen>`.

### Observations
- No lazy-loaded routes — all page components are statically imported, contributing to the large `index` chunk.
- No route-level `loader` or `action` (React Router data APIs unused); data fetching happens client-side via `useApiData` / `useApp`.
- The catch-all `*` redirects to `/`; no dedicated 404 page exists outside platform/workspace fallbacks (`PlatformFallbackPage`, `WorkspaceFallbackPage`).
- `HomeRedirect` checks auth status on every render; booting state shows a full-page `StatePanel`.

---

## 3. Layout & Shell

### `src/components/shell/AppShell.tsx`
Shared app shell used by both platform and workspace routes.

**Features:**
- Fixed max-width container (`max-w-[1680px]`, `mx-auto`, `gap-4`, `p-4`, `pb-24`).
- Sidebar: collapsible on mobile (hamburger), sticky on lg+, fixed width 272–280 px. Contains logo ("Lilac Office"), client name, nav sections, logout button.
- Role/module switcher modal (switch module, mode inspect/support, reason ticket) for platform users in workspace context.
- Platform mode banner (inspect/support) with "Exit access" button.
- Bottom mobile quick-nav bar (first 8 flattened nav items, fixed `bottom-2`, `lg:hidden`).
- Skip-to-content link (`sr-only`, focus-visible).
- `main` has `tabIndex={-1}` and auto-focus on route change (`mainRef.current?.focus()`).

**Role display logic** (`displayRole`):
- Platform realm → "Super Admin"
- Workspace mode platform → "Platform support/inspect mode"
- Else → membership role for active module, fallback "Workspace user"

### `src/components/layout/Sidebar.tsx`
Sidebar contains an embedded role simulator (hardcoded role toggles). This is a development aid that should be removed or gated behind a dev flag before production.

### `src/components/layout/CommandPalette.tsx`
Cmd+K / Ctrl+K command palette for global search. No visible evidence of backend search integration — appears to filter local nav items only.

### `src/components/layout/TopBar.tsx`
Topbar with search placeholder, workspace switcher button (workspace kind), user avatar + name + role.

### `src/components/layout/AppLayout.tsx`
Wraps `AppShell`; reads `kind` from route context.

---

## 4. Data & API Layer

### `src/api/client.ts`
Custom fetch wrapper (`apiRequest`) that:
- Reads base URL from `VITE_API_BASE` (defaults to `http://127.0.0.1:3001` in `vite.config.ts` proxy).
- Expects an `ApiEnvelope<T>` shape: `{ data, error, meta? }`.
- Throws `AppError` on non-ok responses with parsed error code/message.
- Attaches CSRF token and auth cookies (credentials: include).
- `get`, `post`, `put`, `patch`, `del` helpers.

### `src/api/types.ts`
- `ApiEnvelope<T>`: `{ data?: T; error?: { code, message, details? }; meta?: {...} }`
- `Realm`: `'platform' | 'tenant'`
- `ModuleKey`: `'hr' | 'retail' | 'school' | 'accounts'`
- `AppError`: `{ code, message, details? }`

### `src/components/common/Async.tsx`
- `useApiData<T>(key, fetcher, options)`: React Query-like wrapper (no actual React Query dependency — appears to be a lightweight custom hook). Handles loading/error/data states.
- `AsyncView`: render-prop component for loading/error/empty/data states.

### `src/components/common/Ui.tsx`
Shared primitives: `Card`, `PageHeader`, `StatePanel`, `PermissionGate`, `PillBadge`, `inputClass`.

### Mock data (`src/data/mockData.ts`, 2253 lines)
Large single file containing all mock entities: employees, departments, locations, attendance, leave, payroll, job openings, goals, performance reviews, recruitment, onboarding, documents, assets, announcements, audit logs, holidays, upcoming events. No separation by domain; file is large and mixes concerns.

### `src/data/dashboardModel.ts`
Computes dashboard KPIs from mock data: `presentToday`, `totalHeadcount`, `leaveDistribution`, `departmentBreakdown`, `openRoles`, `headcountTrend`, `recentActivity`, etc. Has a test file (`dashboardModel.test.ts`, 5 tests, all passing).

### `src/data/today.ts`
Fixed reference date `TODAY = new Date(2026, 10, 20)` (2026-11-20) used by dashboard and tests. `toDateKey()` helper.

### `src/context/AppContext.tsx`
`useApp()` provides employees, departments, locations, `addEmployee`, and dashboard model. Central client-side state for the HR workspace.

### `src/context/AuthContext.tsx`
`useAuth()` provides `status` (booting/authenticated/unauthenticated), `realm`, `user`, `workspace`, `can(permission)`, `logout()`, `enterAccess()`, `exitAccess()`. Manages auth cookies via the API client.

### Observations
- No React Query, SWR, or TanStack Query — data fetching is a thin custom wrapper.
- No OpenAPI / Swagger client generation; API shapes are hand-typed.
- No API versioning prefix beyond `/api/` on the server; frontend proxy routes `/api` to `http://127.0.0.1:3001`.
- No request retry, offline queue, or request deduplication evident.
- Mock data is used for dashboard; workspace pages appear to call the API client (proxy to backend) but some HR pages (`HrPrototypeRoute`) may still use mock data — unverified without running the dev server against a live backend.

---

## 5. Forms & Validation

### `src/components/ui/FormField.tsx`
`FormField` (label, required, error, help text) + `Select` (native `<select>` styled with Tailwind).

### `src/components/ui/Input.tsx`
Styled `<input>` with error states.

### `src/components/ui/Button.tsx`
Button with `variant` (primary/secondary/danger/ghost), `isLoading`, `disabled`, `asChild` support.

### `src/components/layout/AddEmployeeDrawer.tsx`
Large form drawer (314 lines) for adding employees. Fields: first/last name, email, phone, dob, gender, address, department, title, manager, location, employment type, status, hire date, salary, emergency contact.

**Validation (client-side, inline):**
- first_name, last_name, email (must include `@`), title, salary_base > 0 required.
- Errors stored in local `errors` state, displayed via `FormField error` prop.
- Submit uses `setTimeout(..., 300)` to simulate async; no actual API call in the drawer (calls `addEmployee` from `AppContext`, which is client-state only).
- Form resets after submit.

### Observations
- No form library (React Hook Form, Formik) — all forms are uncontrolled/controlled with manual `useState`.
- No schema validation (zod not used on frontend forms despite being a dependency).
- No async submission handling in `AddEmployeeDrawer` (fake timeout).
- No "unsaved changes" warning on navigation away from forms.

---

## 6. Tables & Lists

### `src/components/ui/Table.tsx`
Generic table component with header/body rows, sorting indicators, row selection, empty state.

### Empty states
`EmptyState` component used across pages for no-data scenarios.

### Pagination
`Pagination` component with prev/next, page buttons, ellipsis, page-size selector.

### Skeleton
`Skeleton` component for loading placeholders.

### Bulk actions
`BulkActionBar` for selected-row batch operations.

### Observations
- No virtual scrolling for large tables; all rows render in DOM.
- No server-side pagination/sorting — appears to be client-side only.
- No column resizing, reordering, or filtering UI evident.

---

## 7. Charts & Data Viz

### `recharts` (3.10.1)
Used in dashboard (leave distribution arcs, attendance bars, headcount trend) and reports page. Dashboard model (`dashboardModel.ts`) pre-computes chart-ready data (`leaveDistribution`, `departmentBreakdown`, `headcountTrend`, `attendanceDays`).

### Org chart
`OrgChartPage` — custom implementation (not a library) for HR org visualization.

### Observations
- No chart library abstraction layer; recharts used directly.
- Reports page is the largest chunk (404 kB) — likely chart-heavy; candidate for lazy loading.

---

## 8. Modals, Drawers, Overlays

### `src/components/ui/Modal.tsx`
Dialog/overlay component with `open`, `title`, `onClose`, focus trap (evidence: `role="alert"` on errors, modal markup).

### `src/components/ui/Drawer.tsx`
Slide-over drawer (`isOpen`, `title`, `description`, `size`, `footer`).

### `src/components/ui/Toast.tsx`
Toast notification system.

### Observations
- No `Dialog` from Radix/Headless UI — custom implementations.
- No confirm-dialog wrapper; confirmation logic is inline per action.
- No toast provider visible in App (may be rendered inside individual pages).

---

## 9. Accessibility

### Positive findings
- Skip-to-content link (`sr-only focus:not-sr-only ...`).
- `main#main-content` with `tabIndex={-1}` and auto-focus on route change.
- `aria-label` on sidebar sections, nav mobile menu, quick nav.
- `aria-expanded`/`aria-label` on hamburger button.
- `aria-hidden` on decorative icons.
- `role="alert"` on error messages.
- `inputClass` shared styling for form inputs (consistent focus states).
- Labels on `FormField` (proper association).
- Color contrast: dark text `#0E0E12` on white/light backgrounds; secondary text `#6B6A85`/`#9A99AA` (need contrast verification).

### Gaps / Concerns
- No automated a11y test suite in the frontend test command (tests only cover server + `dashboardModel.test.ts`).
- `axe-core` is a devDependency but not wired into any test or CI script.
- No `prefers-reduced-motion` handling evident despite `motion` dependency.
- Custom Modal/Drawer — focus trap and escape-key behavior not verified.
- No skip links for repeated nav on every page (only one global skip link).
- Tab order: `tabIndex={-1}` on main is correct for programmatic focus but no visible focus indicators custom-styled beyond Tailwind defaults.
- No `lang` attribute check on `<html>` (not inspected in `index.html`).

---

## 10. Responsive Design

- Tailwind 4 arbitrary values and breakpoints used (`sm:`, `md:`, `lg:`, `xl:`).
- Sidebar: hidden on mobile (`hidden`), `lg:flex`; hamburger toggle `lg:hidden`.
- Mobile bottom quick-nav: `lg:hidden`.
- Search field: `hidden sm:flex`.
- Main container: `lg:pb-4` vs `pb-24` (accounts for bottom nav on mobile).
- Grid layouts: `grid-cols-2`, `grid-cols-3` in forms — may cramp on 390px widths without responsive column counts.
- No explicit mobile-first media queries beyond Tailwind prefixes.

---

## 11. Motion & Animation

### `motion` (Framer Motion 12.23.24)
Installed as a dependency. Need to verify usage — likely page transitions or drawer/modal animations.

### Observations
- No `AnimatePresence` or layout animations verified in code read so far.
- No `prefers-reduced-motion` media query handling found.
- Tailwind `transition-colors` used on interactive elements (hover states).

---

## 12. Quality Assurance

All checks executed and passing:

| Check | Command | Result |
|-------|---------|--------|
| Lint (tsc --noEmit) | `npm run lint` | PASS — 0 errors |
| Typecheck API | `npm run typecheck:api` | PASS — 0 errors |
| Tests | `npm run test` | PASS — 61/61, 0 failures |
| Build | `npm run build` | PASS — 4.36s, 1 chunk-size warning |

**Test details:** 61 tests across `server/tests/*.test.ts` (auth, authz, platform, provisioning, security, upload, workspace, production) + `src/data/dashboardModel.test.ts`. All pass. Frontend component tests: none exist.

**Build warning:** `index-Bn-jSws4.js` (654.93 kB) exceeds 500 kB chunk limit. Recommend dynamic `import()` for `ReportsPage` and route-level splitting.

**Security audit:** `npm run security:audit` = `npm audit --omit=dev` → 0 vulnerabilities. `npm run security:scan` = secret scan script exists (`scripts/secret-scan.mjs`) but was not executed.

**Lint configuration:** No ESLint, Prettier, or biome config found. Only `tsc --noEmit` for typechecking. No formatting enforcement.

---

## 13. Findings & Recommendations

### Critical / High

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 1 | No lazy-loaded routes; 654 kB main chunk | `src/App.tsx`, all page imports | Add `React.lazy()` + `Suspense` per route; start with `ReportsPage` (404 kB). |
| 2 | No frontend form library or schema validation | `AddEmployeeDrawer.tsx`, all forms | Adopt React Hook Form + zod for validation; replace manual `useState` forms. |
| 3 | `Sidebar.tsx` has embedded role simulator | `src/components/layout/Sidebar.tsx` | Remove or gate behind `import.meta.env.DEV`. |
| 4 | No automated accessibility tests | `package.json` scripts | Add `axe-core` to frontend test command or CI step. |
| 5 | No ESLint/Prettier/biome | repo root | Add ESLint + Prettier; enforce formatting. |
| 6 | Hardcoded design tokens (colors, radius) | all components | Extract to Tailwind config / CSS variables; Tailwind 4 supports `@theme` in CSS. |
| 7 | Large mock data file (2253 lines) | `src/data/mockData.ts` | Split by domain; consider MSW or factory functions instead of one monolithic file. |
| 8 | No 404 page; catch-all redirects to `/` | `src/App.tsx` | Add dedicated `NotFoundPage`. |
| 9 | `tsconfig.server.json` typecheck separate from frontend | `package.json` | Consider unifying or documenting the split clearly. |

### Medium

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 10 | No React Query / data caching layer | `src/api/client.ts` | Evaluate TanStack Query for caching, dedup, retries. |
| 11 | No `prefers-reduced-motion` handling | `motion` usage | Add media-query guard around animations. |
| 12 | No virtual scrolling for tables | `src/components/ui/Table.tsx` | Add windowing for large datasets. |
| 13 | Font assets dominate raw bundle size | `dist/assets/*.woff2` | Subset fonts (only needed weights/chars) or use `font-display: swap` with system fallbacks. |

### Low

| # | Issue | Location | Recommendation |
|---|-------|----------|----------------|
| 14 | No `lang` attribute verified | `index.html` | Ensure `<html lang="en">`. |
| 15 | Legacy alias routes add indirection | `LegacyAlias`, `LegacyEmployeeAlias` | Deprecate; update external links. |
| 16 | `displayRole` logic complex | `AppShell.tsx:78-83` | Simplify with a helper function; add unit tests. |

### Evidence summary

- Lint: `tsc --noEmit` — clean.
- Typecheck API: `tsc -p tsconfig.server.json --noEmit` — clean.
- Tests: 61 pass, 0 fail (server + dashboard model).
- Build: passes, 4.36s, one chunk-size warning.
- Git: not a repository; no commit history available to audit.
- Dev server: `npm run dev` on port 3000; API proxy to `http://127.0.0.1:3001`.
- No live deployment; no production URL to audit against.

---

**Audit scope note:** This report covers frontend code quality, architecture, routing, forms, data layer, accessibility, responsiveness, motion, and QA. It does not include visual QA (no screenshots captured per scope), performance profiling (no Lighthouse run), or server-side code beyond typecheck. No source code was modified.

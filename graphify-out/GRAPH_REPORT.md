# Graph Report - erp  (2026-11-21)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1426 nodes · 4352 edges · 52 communities (44 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 77 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 45

## God Nodes (most connected - your core abstractions)
1. `AppError` - 117 edges
2. `createWorkspaceRouter()` - 50 edges
3. `cn()` - 46 edges
4. `react` - 46 edges
5. `apiRequest()` - 41 edges
6. `PlatformDb` - 39 edges
7. `errorMessage()` - 38 edges
8. `useApp()` - 37 edges
9. `createAuthRouter()` - 37 edges
10. `lucide-react` - 34 edges

## Surprising Connections (you probably didn't know these)
- `submit()` --indirect_call--> `clientId()`  [INFERRED]
  src/pages/platform/PlatformPages.tsx → server/src/scripts/seed.ts
- `save()` --indirect_call--> `text()`  [INFERRED]
  src/pages/workspace/AdminPages.tsx → server/src/workspace/resources.ts
- `PrimaryLink()` --calls--> `cn()`  [EXTRACTED]
  src/components/common/Ui.tsx → src/lib/utils.ts
- `createAuthRouter()` --indirect_call--> `requirePasswordChangeComplete()`  [INFERRED]
  server/src/auth/routes.ts → server/src/auth/middleware.ts
- `createPlatformRouter()` --indirect_call--> `requirePasswordChangeComplete()`  [INFERRED]
  server/src/routes/platform.ts → server/src/auth/middleware.ts

## Import Cycles
- None detected.

## Communities (52 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (137): apiDownload(), ApiError, apiRequest(), csrfFromCookie(), errorMessage(), issueCsrf(), perform(), readCookie() (+129 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (79): lucide-react, react, react-router-dom, AddEmployeeDrawer(), AppLayout(), CommandPalette(), Sidebar(), MOBILE_LINKS (+71 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (84): navGroups(), NavItem, ROLES, AppContext, AppContextType, AppProvider(), ToastMessage, useStorageState() (+76 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (62): invite_tokens, invite_tokens_user_idx, platform_users, platform_users_set_updated_at, sessions, sessions_refresh_expiry_idx, sessions_set_updated_at, sessions_user_active_idx (+54 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (52): bank_transactions, bank_transactions_bank_date_idx, banks, categories, customers, expenses, expenses_date_idx, invoice_lines (+44 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (45): argon2@^0.45.1, argon2, ARGON_OPTIONS, assertPasswordAllowed(), assertPasswordPolicy(), BreachChecker, DUMMY_PASSWORD_HASH, hashPassword() (+37 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (39): root, targets, main(), PATTERNS, ROOT, SKIP_DIRECTORIES, SKIP_FILES, TEXT_EXTENSIONS (+31 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (43): ProvisioningRequestResult, addDays(), BUSINESS_NAMES, clientId(), CLIENTS, ClientSeed, DEPENDENCY_NAMES, ensureClient() (+35 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (22): children, adapter, api(), ApiOptions, ApiResponse, cookieHeader(), extraPlatformUsers, Json (+14 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (35): accessCookieOptions(), AuthCookieNames, authCookieNames(), baseCookieOptions(), clearAuthCookies(), clearModuleAccessCookie(), csrfCookieOptions(), IssuedAuthCookies (+27 more)

### Community 10 - "Community 10"
Cohesion: 0.15
Nodes (23): dotenv@^17.2.3, dotenv, config, KmsError, KmsProvider, LocalKmsProvider, dropTenantAppRole(), dropTenantDatabase() (+15 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (26): express, AppDependencies, createApp(), BucketRow, consumeRateLimit(), rateKey(), RateLimitResult, asyncHandler() (+18 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (28): readErrorCode(), toAppError(), tenantDatabaseName(), isTenantModuleKey(), TenantModuleKey, appendStep(), assertModuleKey(), ClaimedJob (+20 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (31): devDependencies, autoprefixer@^10.4.21, axe-core@^4.14.1, esbuild@^0.28.2, tailwindcss@^4.3.3, tsx@^4.21.0, @types/cookie-parser@^1.4.9, @types/express@^4.17.21 (+23 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (32): dependencies, clsx@^2.1.1, cookie-parser@^1.4.7, date-fns@^4.4.0, express@^4.21.2, @fontsource/ibm-plex-sans@^5.3.0, @fontsource/inter@^5.3.0, glisse@^0.6.0 (+24 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (31): requirePasswordChangeComplete(), verifyModuleAccessToken(), actionFor(), actorMembershipId(), assertPermission(), beforeRow(), body(), BRANCHES (+23 more)

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (29): CI_APP_SECRET, CI_PLATFORM_APP_PASSWORD, CI_PLATFORM_MIGRATOR_PASSWORD, CI_POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, jobs (+21 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (24): CreatedSession, createSession(), CreateSessionInput, rotateRefreshSession(), SessionListRow, createRefreshToken(), hashRefreshToken(), isMembershipClaim() (+16 more)

### Community 18 - "Community 18"
Cohesion: 0.14
Nodes (28): attendance, attendance_employee_date_idx, candidates, candidates_job_stage_idx, departments, documents, documents_employee_idx, employees (+20 more)

### Community 19 - "Community 19"
Cohesion: 0.11
Nodes (23): pg, ActionFor, APPROVAL_RESOURCES, MODULE_KEYS, ModuleKey, OPERATIONAL_RESOURCES, PERMISSION_NAMESPACES, PermissionKey (+15 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (8): PlatformDb, assertTenantKey(), TenantPoolRegistry, checkPlatformDatabase(), listen(), main(), startedAt, main()

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (23): impersonationExpiresAt(), ImpersonationHandle, isImpersonationExpired(), loadActiveImpersonation(), startImpersonation(), StartImpersonationInput, APP_PUBLIC_ROUTES, AUTH_PASSWORD_CHANGE_EXEMPT_ROUTES (+15 more)

### Community 22 - "Community 22"
Cohesion: 0.07
Nodes (27): scripts, build, build:all, build:api, clean, db:down, db:migrate, db:migrate:tenant (+19 more)

### Community 23 - "Community 23"
Cohesion: 0.27
Nodes (21): assertTenantContext(), TenantContext, withTenantTx(), AppError, adjustStock(), approveExpense(), approvePayRun(), approvePurchaseReturn() (+13 more)

### Community 24 - "Community 24"
Cohesion: 0.08
Nodes (23): POSTGRES_DB, POSTGRES_INITDB_ARGS, POSTGRES_PASSWORD, POSTGRES_USER, TZ, interval, retries, start_period (+15 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (20): endImpersonation(), signModuleAccessToken(), findExistingJob(), lockClientModule(), requestDeprovisioning(), requestProvisioning(), retryProvisioningJob(), audit() (+12 more)

### Community 26 - "Community 26"
Cohesion: 0.15
Nodes (16): expandPermissionKeys(), PERMISSION_CATALOG, permissionsForPreset(), assertCanGrantPermissions(), assertClientAdminCanBeChanged(), CATALOG, EffectivePermissionSet, EntitlementRow (+8 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (14): zod@^4.6.7, zod, AppConfig, appUrl, base64KeyEnv, booleanEnv(), ConfigError, envSchema (+6 more)

### Community 28 - "Community 28"
Cohesion: 0.27
Nodes (17): attendance, classes, enrollments, exams, fee_heads, fee_invoices, fee_payments, grades (+9 more)

### Community 29 - "Community 29"
Cohesion: 0.16
Nodes (15): PlatformDbOptions, PoolRecord, readInt(), RegistryCacheEntry, RegistryRow, TenantPoolConfig, TenantPoolRegistryOptions, createLogger() (+7 more)

### Community 30 - "Community 30"
Cohesion: 0.21
Nodes (17): ResourceDescriptor, assertWritable(), buildWhere(), columnCache, createResource(), csvValue(), deleteResource(), ident() (+9 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+9 more)

### Community 32 - "Community 32"
Cohesion: 0.21
Nodes (16): ap_open_items, ap_open_items_due_idx, ar_open_items, ar_open_items_due_idx, bank_accounts, bank_reconciliations, bank_reconciliations_account_idx, chart_of_accounts (+8 more)

### Community 33 - "Community 33"
Cohesion: 0.22
Nodes (15): loadUserById(), enforceRateLimit(), buildClaims(), confirmMfa(), issueSession(), loadMembershipContext(), normalizeIp(), normalizeUserAgent() (+7 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (15): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution, noEmit (+7 more)

### Community 35 - "Community 35"
Cohesion: 0.35
Nodes (12): bearerToken(), moduleAccessToken(), readCookie(), attachSession(), named(), optionalRouteSession(), optionalSession(), requireRouteSession() (+4 more)

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (10): ACCOUNTS, BASE_SORT, DESCRIPTORS, getDescriptor(), HR, Options, ResourceAction, resourceNames() (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.33
Nodes (8): AuditJson, sanitize(), sanitizeAuditValue(), AuditEventInput, safeJson(), writeModuleAudit(), writePlatformAudit(), audit()

### Community 38 - "Community 38"
Cohesion: 0.42
Nodes (8): assertCsrf(), constantTimeEqual(), createCsrfNonce(), createCsrfToken(), csrfKey(), parseCsrfToken(), requireCsrf(), signature()

### Community 39 - "Community 39"
Cohesion: 0.25
Nodes (7): interval, updates, directory, open-pull-requests-limit, package-ecosystem, schedule, version

### Community 40 - "Community 40"
Cohesion: 0.25
Nodes (6): @tailwindcss/vite@^4.3.3, vite@^8.3.0, @vitejs/plugin-react@^6.1.1, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 41 - "Community 41"
Cohesion: 0.53
Nodes (5): decodeBase32(), encodeBase32(), generateTotpSecret(), totpCode(), verifyTotp()

### Community 42 - "Community 42"
Cohesion: 0.40
Nodes (4): routes, viewports, playwright@^1.65.1, playwright

### Community 43 - "Community 43"
Cohesion: 0.70
Nodes (4): configureEnv(), main(), quoteIdentifier(), setProvisionerRole()

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Community 1` to `Community 0`, `Community 2`, `Community 13`, `Community 14`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `createWorkspaceRouter()` (e.g. with `requirePasswordChangeComplete()` and `.query()`) actually correct?**
  _`createWorkspaceRouter()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.054094292803970226 - nodes in this community are weakly interconnected._
- **Why does `pg` connect `Community 19` to `Community 6`, `Community 7`, `Community 10`, `Community 43`, `Community 12`, `Community 13`, `Community 14`, `Community 23`, `Community 29`, `Community 30`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.10082174462705436 - nodes in this community are weakly interconnected._
- **Why does `AppError` connect `Community 23` to `Community 5`, `Community 6`, `Community 8`, `Community 9`, `Community 11`, `Community 12`, `Community 15`, `Community 17`, `Community 19`, `Community 20`, `Community 21`, `Community 25`, `Community 26`, `Community 29`, `Community 30`, `Community 33`, `Community 35`, `Community 37`, `Community 38`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05231724796942188 - nodes in this community are weakly interconnected._
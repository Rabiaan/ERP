import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { endImpersonation, loadActiveImpersonation, startImpersonation } from '../src/auth/impersonation';
import { hashPassword } from '../src/auth/password';
import { createAuthRouter } from '../src/auth/routes';
import {
  hashPermissions,
  resolveMembershipPermissions,
  resolveUserMembershipPermissionHashes,
} from '../src/authz/resolver';
import { generateTotpSecret, totpCode } from '../src/auth/totp';
import { config } from '../src/config';
import { PlatformDb } from '../src/db/platform';
import { TenantPoolRegistry } from '../src/db/registry';
import {
  AUTH_PASSWORD_CHANGE_EXEMPT_ROUTES,
  AUTH_PUBLIC_ROUTES,
  AUTH_SESSION_ROUTES,
  routeKey,
} from '../src/http/public-routes';
import { LocalKmsProvider } from '../src/kms/local';

type Json = Record<string, unknown>;

type ApiOptions = {
  method?: string;
  body?: unknown;
  jar?: Map<string, string>;
  csrf?: string;
  bearer?: string;
  headers?: Record<string, string>;
};

type ApiResponse = {
  status: number;
  body: Json;
  setCookies: string[];
};

const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
const tenantEmail = `tenant-${suffix}@example.test`;
const platformEmail = `platform-${suffix}@example.test`;
const mfaEmail = `mfa-${suffix}@example.test`;
const enrollEmail = `enroll-${suffix}@example.test`;
const lockEmail = `lock-${suffix}@example.test`;
const inviteEmail = `invite-${suffix}@example.test`;
const inviteOkEmail = `invite-ok-${suffix}@example.test`;
const forceEmail = `force-${suffix}@example.test`;
const changeEmail = `change-${suffix}@example.test`;
const password = 'CorrectHorseBattery!42';
const nextPassword = 'CorrectHorseBattery!43';

let platformDb: PlatformDb;
let registry: TenantPoolRegistry;
let kms: LocalKmsProvider;
let server: Server;
let baseUrl: string;
let clientId: string;
let planId: string;
let tenantUserId: string;
let platformUserId: string;
let mfaUserId: string;
let enrollUserId: string;
let lockUserId: string;
let inviteUserId: string;
let inviteOkUserId: string;
let forceUserId: string;
let changeUserId: string;
let mfaSecret: string;

function setCookies(headers: Headers): string[] {
  const withMethod = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof withMethod.getSetCookie === 'function') {
    return withMethod.getSetCookie();
  }
  const combined = headers.get('set-cookie');
  return combined ? [combined] : [];
}

function updateJar(jar: Map<string, string>, response: ApiResponse): void {
  for (const cookie of response.setCookies) {
    const pair = cookie.split(';', 1)[0] ?? '';
    const separator = pair.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const cleared = value === '' || /max-age=0/i.test(cookie) || /1970/i.test(cookie);
    if (cleared) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function api(path: string, options: ApiOptions = {}): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...options.headers };
  const jar = options.jar;

  if (jar && jar.size > 0) {
    headers.cookie = cookieHeader(jar);
  }
  if (options.csrf) {
    headers['x-csrf-token'] = options.csrf;
  }
  if (options.bearer) {
    headers.authorization = `Bearer ${options.bearer}`;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as Json) : {};
  const parsed: ApiResponse = {
    status: response.status,
    body,
    setCookies: setCookies(response.headers),
  };

  if (jar) {
    updateJar(jar, parsed);
  }

  return parsed;
}

function errorCode(body: Json): unknown {
  const error = body.error;
  return typeof error === 'object' && error !== null ? (error as Json).code : undefined;
}

function errorDetails(body: Json): Json {
  const error = body.error;
  if (typeof error === 'object' && error !== null) {
    const details = (error as Json).details;
    return typeof details === 'object' && details !== null ? (details as Json) : {};
  }
  return {};
}

async function loginTenant(jar: Map<string, string>, email = tenantEmail): Promise<ApiResponse> {
  return api('/api/auth/tenant/login', {
    jar,
    body: { email, password },
  });
}

async function loginPlatform(jar: Map<string, string>, email = platformEmail): Promise<ApiResponse> {
  return api('/api/auth/platform/login', {
    jar,
    body: { email, password },
  });
}

async function createTenantUser(input: {
  email: string;
  status?: 'active' | 'invited';
  withMembership?: boolean;
  mustChangePassword?: boolean;
}): Promise<string> {
  const fullName = `Tenant ${input.email.split('@')[0]}`;
  const passwordHash = input.status === 'invited' ? null : await hashPassword(password);
  const result = await platformDb.query<{ id: string }>(
    `INSERT INTO users (
       email,
       full_name,
       password_hash,
       status,
       must_change_password,
       invite_expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id::text`,
    [
      input.email,
      fullName,
      passwordHash,
      input.status ?? 'active',
      input.mustChangePassword ?? false,
      input.status === 'invited' ? new Date(Date.now() + 86400000) : null,
    ],
  );
  const id = result.rows[0]!.id;

  if (input.withMembership !== false) {
    await platformDb.query(
      `INSERT INTO memberships (user_id, client_id, module_key, role, status)
       VALUES ($1, $2, 'retail', 'client_admin', 'active')`,
      [id, clientId],
    );
  }

  return id;
}

async function createPlatformUser(input: {
  email: string;
  mfaEnabled?: boolean;
  mfaSecret?: string;
}): Promise<string> {
  const secret = input.mfaSecret ? await kms.encrypt(input.mfaSecret) : null;
  const result = await platformDb.query<{ id: string }>(
    `INSERT INTO platform_users (
       email,
       full_name,
       password_hash,
       status,
       mfa_enabled,
       mfa_secret_enc,
       must_change_password
     )
     VALUES ($1, $2, $3, 'active', $4, $5, false)
     RETURNING id::text`,
    [input.email, 'Platform Tester', await hashPassword(password), input.mfaEnabled ?? false, secret],
  );
  return result.rows[0]!.id;
}

before(async () => {
  platformDb = new PlatformDb({
    connectionString: config.platformDatabaseUrl,
    max: 6,
    connectionTimeoutMillis: 5000,
  });
  kms = new LocalKmsProvider(config.kmsLocalKey);
  registry = new TenantPoolRegistry({
    platformDb,
    kms,
    maxPerTenant: 2,
    globalMax: 4,
    idleMs: 1000,
    cacheTtlMs: 1000,
    connectionTimeoutMs: 5000,
    defaultStatementTimeoutMs: 5000,
  });

  await platformDb.ping();

  const plan = await platformDb.query<{ id: string }>(
    `INSERT INTO plans (key, name, max_users, max_modules)
     VALUES ($1, 'Auth test plan', 20, 4)
     RETURNING id::text`,
    [`auth-test-${suffix}`],
  );
  planId = plan.rows[0]!.id;

  const client = await platformDb.query<{ id: string }>(
    `INSERT INTO clients (name, slug, status, plan_id)
     VALUES ($1, $2, 'active', $3)
     RETURNING id::text`,
    [`Auth Test ${suffix}`, `auth-test-${suffix}`, planId],
  );
  clientId = client.rows[0]!.id;

  await platformDb.query(
    `INSERT INTO client_modules (
       client_id,
       module_key,
       status,
       db_name,
       db_secret_ref,
       schema_version
     )
     VALUES ($1, 'retail', 'active', $2, 'test-secret-ref', '1.0.0')`,
    [clientId, `tenant_auth_test_${suffix}`],
  );

  tenantUserId = await createTenantUser({ email: tenantEmail });
  lockUserId = await createTenantUser({ email: lockEmail });
  inviteUserId = await createTenantUser({ email: inviteEmail, status: 'invited' });
  inviteOkUserId = await createTenantUser({ email: inviteOkEmail, status: 'invited' });
  forceUserId = await createTenantUser({ email: forceEmail, mustChangePassword: true });
  changeUserId = await createTenantUser({ email: changeEmail });
  platformUserId = await createPlatformUser({ email: platformEmail });
  mfaSecret = generateTotpSecret();
  mfaUserId = await createPlatformUser({ email: mfaEmail, mfaEnabled: true, mfaSecret });
  enrollUserId = await createPlatformUser({ email: enrollEmail });

  const app = createApp({
    platformDb,
    registry,
    kms,
    startedAt: Date.now(),
    version: 'test',
  });

  await new Promise<void>((resolvePromise, reject) => {
    server = app.listen(0, '127.0.0.1', () => resolvePromise());
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  const userIds = [
    tenantUserId,
    lockUserId,
    inviteUserId,
    inviteOkUserId,
    forceUserId,
    changeUserId,
    platformUserId,
    mfaUserId,
    enrollUserId,
  ].filter(Boolean);

  if (userIds.length > 0) {
    await platformDb.query('DELETE FROM sessions WHERE user_id = ANY($1::uuid[])', [userIds]);
  }
  if (clientId) {
    await platformDb.query('DELETE FROM clients WHERE id = $1', [clientId]);
  }
  if (userIds.length > 0) {
    await platformDb.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    await platformDb.query('DELETE FROM platform_users WHERE id = ANY($1::uuid[])', [userIds]);
  }
  if (planId) {
    await platformDb.query('DELETE FROM plans WHERE id = $1', [planId]);
  }

  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  await registry.closeAll();
  await platformDb.end();
});

test('CSRF endpoint issues a readable signed cookie', async () => {
  const response = await api('/api/auth/csrf', { method: 'POST' });
  const csrf = response.setCookies.find((cookie) => cookie.startsWith('lilac_csrf='));

  assert.equal(response.status, 200);
  assert.ok(csrf);
  assert.match(csrf, /SameSite=Lax/);
  assert.doesNotMatch(csrf, /HttpOnly/i);
  assert.doesNotMatch(csrf, /Secure/i);
});

test('tenant login, me, CSRF-protected logout, and refresh rotation', async () => {
  const jar = new Map<string, string>();
  const login = await loginTenant(jar);

  assert.equal(login.status, 200, JSON.stringify(login.body));
  const data = login.body.data as Json;
  const user = data.user as Json;
  assert.equal(user.realm, 'tenant');
  assert.equal(user.client_id, clientId);
  assert.equal(user.active_module, 'retail');

  const access = login.setCookies.find((cookie) => cookie.startsWith('lilac_tenant_at='));
  assert.ok(access);
  assert.match(access, /HttpOnly/);
  assert.match(access, /SameSite=Lax/);

  const me = await api('/api/auth/tenant/me', { jar });
  assert.equal(me.status, 200);
  assert.equal((me.body.data as Json).user instanceof Object, true);

  const noCsrf = await api('/api/auth/tenant/logout', { method: 'POST', jar });
  assert.equal(noCsrf.status, 403);
  assert.equal(errorCode(noCsrf.body), 'FORBIDDEN');

  const csrf = jar.get('lilac_csrf')!;
  const logout = await api('/api/auth/tenant/logout', { method: 'POST', jar, csrf });
  assert.equal(logout.status, 200);

  const afterLogout = await api('/api/auth/tenant/me', { jar });
  assert.equal(afterLogout.status, 401);

  const refreshJar = new Map<string, string>();
  const refreshedLogin = await loginTenant(refreshJar);
  assert.equal(refreshedLogin.status, 200);
  const oldJar = new Map(refreshJar);
  const oldRefresh = oldJar.get('lilac_tenant_rt');
  const refreshCsrf = refreshJar.get('lilac_csrf')!;

  const rotated = await api('/api/auth/tenant/refresh', {
    method: 'POST',
    jar: refreshJar,
    csrf: refreshCsrf,
  });
  assert.equal(rotated.status, 200, JSON.stringify(rotated.body));
  assert.notEqual(refreshJar.get('lilac_tenant_rt'), oldRefresh);

  const replay = await api('/api/auth/tenant/refresh', {
    method: 'POST',
    jar: oldJar,
    csrf: refreshCsrf,
  });
  assert.equal(replay.status, 401);
});

test('platform and tenant tokens are rejected across realms', async () => {
  const tenantJar = new Map<string, string>();
  assert.equal((await loginTenant(tenantJar)).status, 200);
  const tenantToken = tenantJar.get('lilac_tenant_at')!;

  const tenantOnPlatform = await api('/api/auth/platform/me', { bearer: tenantToken });
  assert.equal(tenantOnPlatform.status, 403);
  assert.equal(errorCode(tenantOnPlatform.body), 'FORBIDDEN');

  const platformJar = new Map<string, string>();
  assert.equal((await loginPlatform(platformJar)).status, 200);
  const platformToken = platformJar.get('lilac_platform_at')!;

  const platformOnTenant = await api('/api/auth/tenant/me', { bearer: platformToken });
  assert.equal(platformOnTenant.status, 403);
  assert.equal(errorCode(platformOnTenant.body), 'FORBIDDEN');
});

test('account locks after repeated failures and rejects the correct password', async () => {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const failed = await api('/api/auth/tenant/login', {
      body: { email: lockEmail, password: 'WrongPassword!123' },
    });
    assert.equal(failed.status, 401);
    assert.equal(errorCode(failed.body), 'UNAUTHENTICATED');
  }

  const locked = await api('/api/auth/tenant/login', {
    body: { email: lockEmail, password: 'WrongPassword!123' },
  });
  assert.equal(locked.status, 423);
  assert.equal(errorCode(locked.body), 'ACCOUNT_LOCKED');

  const correct = await api('/api/auth/tenant/login', {
    body: { email: lockEmail, password },
  });
  assert.equal(correct.status, 423);
});

test('TOTP verifies an MFA login challenge', async () => {
  const challenge = await api('/api/auth/platform/login', {
    body: { email: mfaEmail, password },
  });
  assert.equal(challenge.status, 401);
  assert.equal(errorCode(challenge.body), 'MFA_REQUIRED');

  const token = errorDetails(challenge.body).challenge_token;
  assert.equal(typeof token, 'string');

  const jar = new Map<string, string>();
  const verified = await api('/api/auth/platform/mfa/verify', {
    jar,
    body: { challenge_token: token, code: totpCode(mfaSecret) },
  });

  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.ok(jar.get('lilac_platform_at'));

  const me = await api('/api/auth/platform/me', { jar });
  assert.equal(me.status, 200);
});

test('MFA enrollment uses a signed session and enables challenge on next login', async () => {
  const jar = new Map<string, string>();
  const login = await loginPlatform(jar, enrollEmail);
  assert.equal(login.status, 200, JSON.stringify(login.body));

  const csrf = jar.get('lilac_csrf')!;
  const enroll = await api('/api/auth/platform/mfa/enroll', {
    method: 'POST',
    jar,
    csrf,
  });
  assert.equal(enroll.status, 200);
  const uri = (enroll.body.data as Json).otpauth_uri;
  assert.equal(typeof uri, 'string');

  const secret = new URL(uri as string).searchParams.get('secret');
  assert.ok(secret);

  const confirm = await api('/api/auth/platform/mfa/confirm', {
    jar,
    csrf,
    body: { code: totpCode(secret!) },
  });
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));

  const nextLogin = await api('/api/auth/platform/login', {
    body: { email: enrollEmail, password },
  });
  assert.equal(nextLogin.status, 401);
  assert.equal(errorCode(nextLogin.body), 'MFA_REQUIRED');
});

test('expired invite tokens are rejected', async () => {
  const token = randomBytes(32).toString('base64url');
  await platformDb.query(
    `INSERT INTO invite_tokens (user_id, client_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() - interval '1 hour')`,
    [
      inviteUserId,
      clientId,
      createHash('sha256').update(token, 'utf8').digest('hex'),
    ],
  );

  const response = await api('/api/auth/invite/accept', {
    body: { token, password: 'AnotherStrongPass!42', full_name: 'Invite Tester' },
  });

  assert.equal(response.status, 400);
  assert.equal(errorCode(response.body), 'BAD_REQUEST');
});

test('health response includes CSP, frame-ancestors, and referrer policy', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  const body = (await response.json()) as Json;
  assert.equal(typeof (body as Json).status, 'string');
  assert.equal('platformDatabaseUrl' in body, false);
  assert.equal('appSecret' in body, false);
});

test('strict CORS rejects an unknown origin', async () => {
  const response = await api('/api/health', {
    headers: { origin: 'https://evil.example' },
  });
  assert.equal(response.status, 403);
  assert.equal(errorCode(response.body), 'FORBIDDEN');
});

test('auth router catalogues public vs session routes', () => {
  const router = createAuthRouter(platformDb, kms);
  const layers = (router as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: { name: string } }>;
      };
    }>;
  }).stack;

  const found = new Set<string>();
  const publicSet = new Set<string>(AUTH_PUBLIC_ROUTES);
  const sessionSet = new Set<string>(AUTH_SESSION_ROUTES);
  const exemptSet = new Set<string>(AUTH_PASSWORD_CHANGE_EXEMPT_ROUTES);

  for (const layer of layers) {
    if (!layer.route) {
      continue;
    }

    const names = layer.route.stack.map((item) => item.handle.name);
    for (const [method, enabled] of Object.entries(layer.route.methods)) {
      if (!enabled || method === '_all') {
        continue;
      }

      const key = routeKey(method, layer.route.path);
      found.add(key);

      if (sessionSet.has(key)) {
        assert.ok(names.includes('requireRouteSession'), key);
        if (!exemptSet.has(key)) {
          assert.ok(names.includes('requirePasswordChangeComplete'), key);
        }
      } else {
        assert.ok(publicSet.has(key), `unlisted auth route ${key}`);
        assert.equal(names.includes('requireRouteSession'), false, key);
      }
    }
  }

  for (const key of [...AUTH_PUBLIC_ROUTES, ...AUTH_SESSION_ROUTES]) {
    assert.ok(found.has(key), `missing auth route ${key}`);
  }
});

test('forced password change blocks guarded routes until the password is updated', async () => {
  const jar = new Map<string, string>();
  const login = await loginTenant(jar, forceEmail);
  assert.equal(login.status, 200, JSON.stringify(login.body));

  const csrf = jar.get('lilac_csrf')!;
  const sessions = await api('/api/auth/tenant/sessions', { jar });
  assert.equal(sessions.status, 403);
  assert.equal(errorCode(sessions.body), 'FORBIDDEN');

  const me = await api('/api/auth/tenant/me', { jar });
  assert.equal(me.status, 200);

  const changed = await api('/api/auth/tenant/password/change', {
    jar,
    csrf,
    body: { current_password: password, new_password: nextPassword },
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));

  const listed = await api('/api/auth/tenant/sessions', { jar });
  assert.equal(listed.status, 200);
});

test('password change revokes other sessions', async () => {
  const first = new Map<string, string>();
  const second = new Map<string, string>();
  assert.equal((await loginTenant(first, changeEmail)).status, 200);
  assert.equal((await loginTenant(second, changeEmail)).status, 200);

  const listed = await api('/api/auth/tenant/sessions', { jar: first });
  assert.equal(listed.status, 200);
  const sessions = (listed.body.data as unknown[]).filter(
    (row) => typeof row === 'object' && row !== null,
  );
  assert.ok(sessions.length >= 2);

  const csrf = first.get('lilac_csrf')!;
  const tooShort = await api('/api/auth/tenant/password/change', {
    jar: first,
    csrf,
    body: { current_password: password, new_password: 'short-pass' },
  });
  assert.equal(tooShort.status, 422);
  assert.equal(errorCode(tooShort.body), 'VALIDATION_ERROR');

  const changed = await api('/api/auth/tenant/password/change', {
    jar: first,
    csrf,
    body: { current_password: password, new_password: nextPassword },
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));

  const secondMe = await api('/api/auth/tenant/me', { jar: second });
  assert.equal(secondMe.status, 401);
});

test('session list can revoke a selected session', async () => {
  const jar = new Map<string, string>();
  assert.equal((await loginTenant(jar)).status, 200);
  const extra = new Map<string, string>();
  assert.equal((await loginTenant(extra)).status, 200);

  const listed = await api('/api/auth/tenant/sessions', { jar });
  const rows = listed.body.data as Array<Json>;
  const other = rows.find((row) => row.current !== true);
  assert.ok(other && typeof other.id === 'string');

  const csrf = jar.get('lilac_csrf')!;
  const revoked = await api(`/api/auth/tenant/sessions/${other!.id}`, {
    method: 'DELETE',
    jar,
    csrf,
  });
  assert.equal(revoked.status, 200);

  const extraMe = await api('/api/auth/tenant/me', { jar: extra });
  assert.equal(extraMe.status, 401);
});

test('valid invite tokens can be accepted and used to sign in', async () => {
  const token = randomBytes(32).toString('base64url');
  await platformDb.query(
    `INSERT INTO invite_tokens (user_id, client_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '1 day')`,
    [
      inviteOkUserId,
      clientId,
      createHash('sha256').update(token, 'utf8').digest('hex'),
    ],
  );

  const accepted = await api('/api/auth/invite/accept', {
    body: { token, password, full_name: 'Invite Success' },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

  const jar = new Map<string, string>();
  const login = await loginTenant(jar, inviteOkEmail);
  assert.equal(login.status, 200, JSON.stringify(login.body));
});

test('impersonation requires a reason, is time-boxed, and writes audit events', async () => {
  await assert.rejects(
    () =>
      startImpersonation(platformDb, {
        platformUserId,
        targetUserId: tenantUserId,
        clientId,
        reason: 'no',
      }),
    (error: unknown) => error instanceof Error && error.message.includes('reason'),
  );

  const started = await startImpersonation(platformDb, {
    platformUserId,
    targetUserId: tenantUserId,
    clientId,
    reason: 'Investigate payroll discrepancy',
    requestId: 'auth-test-impersonation',
  });

  assert.ok(started.id);
  assert.equal(
    started.expiresAt.getTime() - started.startedAt.getTime(),
    config.impersonationTtlMinutes * 60_000,
  );

  const active = await loadActiveImpersonation(platformDb, started.id, platformUserId);
  assert.ok(active);

  await endImpersonation(platformDb, {
    id: started.id,
    platformUserId,
    requestId: 'auth-test-impersonation-end',
  });

  const closed = await loadActiveImpersonation(platformDb, started.id, platformUserId);
  assert.equal(closed, null);

  const audit = await platformDb.query<{ action: string }>(
    `SELECT action
       FROM audit_events
      WHERE entity_id = $1
      ORDER BY created_at`,
    [started.id],
  );
  assert.deepEqual(
    audit.rows.map((row) => row.action),
    ['impersonation.start', 'impersonation.end'],
  );
});

test('effective permissions are re-evaluated through the creator chain after revocation', async () => {
  const memberships = await platformDb.query<{
    id: string;
    user_id: string;
  }>(
    `SELECT id::text, user_id::text
       FROM memberships
      WHERE user_id = ANY($1::uuid[])
        AND client_id = $2
        AND module_key = 'retail'`,
    [[tenantUserId, lockUserId], clientId],
  );
  const creator = memberships.rows.find((row) => row.user_id === tenantUserId);
  const subordinate = memberships.rows.find((row) => row.user_id === lockUserId);
  assert.ok(creator && subordinate);

  await platformDb.query(
    `UPDATE memberships
        SET created_by_membership_id = $2
      WHERE id = $1`,
    [subordinate.id, creator.id],
  );
  await platformDb.query('DELETE FROM role_grants WHERE membership_id = ANY($1::uuid[])', [
    [creator.id, subordinate.id],
  ]);
  await platformDb.query(
    `INSERT INTO role_grants (membership_id, permission_key)
     VALUES
       ($1, 'retail.products.view'),
       ($2, 'retail.products.view'),
       ($2, 'retail.products.create')`,
    [creator.id, subordinate.id],
  );

  const beforeRevocation = await resolveMembershipPermissions(platformDb, {
    userId: lockUserId,
    clientId,
    moduleKey: 'retail',
  });
  assert.deepEqual([...beforeRevocation.permissions], ['retail.products.view']);
  const loginHashes = await resolveUserMembershipPermissionHashes(platformDb, lockUserId);
  assert.equal(loginHashes.get(subordinate.id), beforeRevocation.hash);

  await platformDb.query(
    `DELETE FROM role_grants
      WHERE membership_id = $1
        AND permission_key = 'retail.products.view'`,
    [creator.id],
  );
  const afterRevocation = await resolveMembershipPermissions(platformDb, {
    userId: lockUserId,
    clientId,
    moduleKey: 'retail',
  });
  assert.deepEqual([...afterRevocation.permissions], []);
  const updatedLoginHashes = await resolveUserMembershipPermissionHashes(platformDb, lockUserId);
  assert.equal(updatedLoginHashes.get(subordinate.id), hashPermissions([]));
});

test('permission resolution blocks disabled modules and memberships in another client', async () => {
  await platformDb.query(
    `UPDATE client_modules
        SET status = 'disabled'
      WHERE client_id = $1
        AND module_key = 'retail'`,
    [clientId],
  );
  try {
    await assert.rejects(
      () =>
        resolveMembershipPermissions(platformDb, {
          userId: tenantUserId,
          clientId,
          moduleKey: 'retail',
        }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'MODULE_NOT_ENABLED',
    );
  } finally {
    await platformDb.query(
      `UPDATE client_modules
          SET status = 'active'
        WHERE client_id = $1
          AND module_key = 'retail'`,
      [clientId],
    );
  }

  const otherClient = await platformDb.query<{ id: string }>(
    `INSERT INTO clients (name, slug, status, plan_id)
     VALUES ($1, $2, 'active', $3)
     RETURNING id::text`,
    [`Other Authz ${suffix}`, `other-authz-${suffix}`, planId],
  );
  const otherClientId = otherClient.rows[0]!.id;
  try {
    await platformDb.query(
      `INSERT INTO client_modules (
         client_id, module_key, status, db_name, db_secret_ref, schema_version
       )
       VALUES ($1, 'retail', 'active', $2, 'test-secret-ref', '1.0.0')`,
      [otherClientId, `tenant_other_authz_${suffix}`],
    );

    await assert.rejects(
      () =>
        resolveMembershipPermissions(platformDb, {
          userId: tenantUserId,
          clientId: otherClientId,
          moduleKey: 'retail',
        }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'FORBIDDEN',
    );
  } finally {
    await platformDb.query('DELETE FROM clients WHERE id = $1', [otherClientId]);
  }
});

test('production cookie options are Secure, HttpOnly, and SameSite=Lax', () => {
  const cookiesModule = pathToFileURL(resolve('server/src/auth/cookies.ts')).href;
  const script = `
    import { accessCookieOptions, refreshCookieOptions, csrfCookieOptions } from ${JSON.stringify(cookiesModule)};
    console.log(JSON.stringify({
      access: accessCookieOptions(),
      refresh: refreshCookieOptions(),
      csrf: csrfCookieOptions()
    }));
  `;
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), '--eval', script],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        APP_URL: 'https://office.example.test',
        COOKIE_SECURE: 'true',
        MFA_REQUIRED_PLATFORM: 'true',
        APP_SECRET: randomBytes(48).toString('hex'),
        KMS_LOCAL_KEY: randomBytes(32).toString('base64'),
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const options = JSON.parse(result.stdout.trim()) as {
    access: { secure: boolean; httpOnly: boolean; sameSite: string };
    refresh: { secure: boolean; httpOnly: boolean; sameSite: string };
    csrf: { secure: boolean; httpOnly: boolean; sameSite: string };
  };
  for (const value of [options.access, options.refresh]) {
    assert.equal(value.secure, true);
    assert.equal(value.httpOnly, true);
    assert.equal(value.sameSite, 'lax');
  }
  assert.equal(options.csrf.secure, true);
  assert.equal(options.csrf.httpOnly, false);
  assert.equal(options.csrf.sameSite, 'lax');
});

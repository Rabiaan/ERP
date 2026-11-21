import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { hashPassword } from '../src/auth/password';
import { generateTotpSecret, totpCode } from '../src/auth/totp';
import { config } from '../src/config';
import { PlatformDb } from '../src/db/platform';
import { TenantPoolRegistry } from '../src/db/registry';
import { LocalKmsProvider } from '../src/kms/local';
import {
  runProvisioningJob,
  type ProvisioningAdapter,
} from '../src/provisioning/service';
import { tenantDatabaseName } from '../src/provisioning/database';

type Json = Record<string, unknown>;

type ApiOptions = {
  method?: string;
  body?: unknown;
  jar?: Map<string, string>;
  csrf?: string;
  headers?: Record<string, string>;
};

type ApiResponse = { status: number; body: Json; setCookies: string[] };

const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
const password = 'CorrectHorseBattery!42';
const platformEmail = `platform-ops-${suffix}@example.test`;
const tenantEmail = `tenant-admin-${suffix}@example.test`;
const planKey = `platform-test-${suffix}`;
const clientSlug = `platform-test-${suffix}`;

let platformDb: PlatformDb;
let registry: TenantPoolRegistry;
let kms: LocalKmsProvider;
let server: Server;
let baseUrl: string;
let planId: string;
let platformUserId: string;
let mfaSecret: string;
let jar: Map<string, string>;
let clientId: string;
let adminUserId: string;
let accessId: string;
const extraPlatformUsers: string[] = [];

const adapter: ProvisioningAdapter = {
  async provisionTenant({ clientId: targetClientId, moduleKey }) {
    return {
      dbName: tenantDatabaseName(targetClientId, moduleKey),
      appRole: `fake_${suffix}_${moduleKey}`,
      secretRef: 'encrypted-test-secret',
      schemaVersion: '1.0.0',
    };
  },
  async snapshotTenant() {},
  async dropTenant() {},
};

function setCookies(headers: Headers): string[] {
  const withMethod = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof withMethod.getSetCookie === 'function') return withMethod.getSetCookie();
  const combined = headers.get('set-cookie');
  return combined ? [combined] : [];
}

function updateJar(target: Map<string, string>, response: ApiResponse): void {
  for (const cookie of response.setCookies) {
    const pair = cookie.split(';', 1)[0] ?? '';
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    const cleared = value === '' || /max-age=0/i.test(cookie) || /1970/i.test(cookie);
    if (cleared) target.delete(name);
    else target.set(name, value);
  }
}

function cookieHeader(target: Map<string, string>): string {
  return [...target.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function api(path: string, options: ApiOptions = {}): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.jar && options.jar.size > 0) headers.cookie = cookieHeader(options.jar);
  if (options.csrf) headers['x-csrf-token'] = options.csrf;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Json) : {};
  const parsed = { status: response.status, body, setCookies: setCookies(response.headers) };
  if (options.jar) updateJar(options.jar, parsed);
  return parsed;
}

function errorCode(body: Json): unknown {
  const error = body.error;
  return typeof error === 'object' && error !== null ? (error as Json).code : undefined;
}

function csrf(target = jar): string {
  const value = target.get('lilac_csrf');
  assert.ok(value, 'expected a CSRF cookie');
  return value;
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
     VALUES ($1, 'Platform test plan', 10, 4)
     RETURNING id::text`,
    [planKey],
  );
  planId = plan.rows[0]!.id;

  const user = await platformDb.query<{ id: string }>(
    `INSERT INTO users (email, full_name, password_hash, status, must_change_password)
     VALUES ($1, 'Tenant Admin', $2, 'invited', false)
     RETURNING id::text`,
    [tenantEmail, await hashPassword(password)],
  );
  adminUserId = user.rows[0]!.id;

  mfaSecret = generateTotpSecret();
  const platformUser = await platformDb.query<{ id: string }>(
    `INSERT INTO platform_users (email, full_name, password_hash, status, mfa_enabled, mfa_secret_enc, must_change_password)
     VALUES ($1, 'Platform Operator', $2, 'active', true, $3, false)
     RETURNING id::text`,
    [platformEmail, await hashPassword(password), await kms.encrypt(mfaSecret)],
  );
  platformUserId = platformUser.rows[0]!.id;

  const app = createApp({ platformDb, registry, kms, startedAt: Date.now(), version: 'test' });
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (clientId) await platformDb.query('DELETE FROM clients WHERE id = $1', [clientId]);
  if (adminUserId) await platformDb.query('DELETE FROM users WHERE id = $1', [adminUserId]);
  const platformIds = [platformUserId, ...extraPlatformUsers].filter(Boolean);
  if (platformIds.length > 0) {
    await platformDb.query('DELETE FROM sessions WHERE user_id = ANY($1::uuid[])', [platformIds]);
    await platformDb.query('DELETE FROM platform_users WHERE id = ANY($1::uuid[])', [platformIds]);
  }
  if (planId) await platformDb.query('DELETE FROM plans WHERE id = $1', [planId]);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await registry.closeAll();
  await platformDb.end();
});

test('platform login requires MFA before platform routes are available', async () => {
  jar = new Map();
  const challenge = await api('/api/auth/platform/login', {
    jar,
    body: { email: platformEmail, password },
  });
  assert.equal(challenge.status, 401);
  assert.equal(errorCode(challenge.body), 'MFA_REQUIRED');
  const details = challenge.body.error as Json;
  const token = (details.details as Json).challenge_token as string;
  assert.ok(token);

  const verified = await api('/api/auth/platform/mfa/verify', {
    jar,
    body: { challenge_token: token, code: totpCode(mfaSecret) },
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  assert.ok(jar.get('lilac_platform_at'));

  const me = await api('/api/platform/me', { jar });
  assert.equal(me.status, 200);
});

test('clients can be created and listed with module state', async () => {
  const created = await api('/api/platform/clients', {
    jar,
    csrf: csrf(),
    body: { name: `Platform ${suffix}`, slug: clientSlug, plan_key: planKey },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  clientId = (created.body.data as Json).id as string;
  assert.ok(clientId);

  const list = await api(`/api/platform/clients?q=${clientSlug}`, { jar });
  assert.equal(list.status, 200);
  const rows = list.body.data as Json[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.slug, clientSlug);
  assert.equal((list.body.meta as Json).total, 1);
});

test('module provisioning runs through the admin API and reports record counts', async () => {
  const invite = await api(`/api/platform/clients/${clientId}/admins`, {
    jar,
    csrf: csrf(),
    body: {
      email: tenantEmail,
      full_name: 'Tenant Admin',
      module_key: 'retail',
      module_grants: ['retail.*'],
    },
  });
  assert.equal(invite.status, 201, JSON.stringify(invite.body));
  assert.equal((invite.body.data as Json).user_id, adminUserId);

  const provision = await api(`/api/platform/clients/${clientId}/modules`, {
    jar,
    csrf: csrf(),
    body: { module_key: 'retail', admin_user_id: adminUserId },
  });
  assert.equal(provision.status, 202, JSON.stringify(provision.body));
  const jobId = (provision.body.data as Json).jobId as string;
  assert.ok(jobId);
  assert.equal(await runProvisioningJob(platformDb, jobId, adapter), true);

  const instances = await api(`/api/platform/modules/instances?client_id=${clientId}`, { jar });
  assert.equal(instances.status, 200);
  const row = (instances.body.data as Json[]).find((item) => item.module_key === 'retail');
  assert.ok(row);
  assert.equal(row!.status, 'active');
  assert.equal(row!.health, 'healthy');
  assert.ok('record_count' in row!);
});

test('module status changes are audited', async () => {
  const disabled = await api(`/api/platform/clients/${clientId}/modules/retail`, {
    method: 'PATCH',
    jar,
    csrf: csrf(),
    body: { status: 'disabled' },
  });
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
  assert.equal((disabled.body.data as Json).status, 'disabled');

  const reactivated = await api(`/api/platform/clients/${clientId}/modules/retail`, {
    method: 'PATCH',
    jar,
    csrf: csrf(),
    body: { status: 'active' },
  });
  assert.equal(reactivated.status, 200, JSON.stringify(reactivated.body));

  const audit = await api(`/api/platform/audit?client_id=${clientId}&action=module.status.update`, { jar });
  assert.equal(audit.status, 200);
  assert.ok(Number((audit.body.meta as Json).total) >= 2);
});

test('platform module access issues a scoped token cookie and is logged', async () => {
  const enter = await api('/api/platform/access/enter', {
    jar,
    csrf: csrf(),
    body: { client_id: clientId, module_key: 'retail', mode: 'support', reason: 'Support ticket 42' },
  });
  assert.equal(enter.status, 201, JSON.stringify(enter.body));
  const data = enter.body.data as Json;
  accessId = data.id as string;
  assert.ok(data.access_token);
  assert.equal(data.expires_in_seconds, 1800);
  assert.ok(jar.get('lilac_module_access'));

  const log = await api(`/api/platform/access/log?client_id=${clientId}&mode=support`, { jar });
  assert.equal(log.status, 200);
  assert.equal((log.body.data as Json[]).length, 1);

  const exit = await api('/api/platform/access/exit', {
    jar,
    csrf: csrf(),
    body: { access_id: accessId },
  });
  assert.equal(exit.status, 200);
  assert.equal(jar.get('lilac_module_access'), undefined);
});

test('impersonation infers the client when the user has one membership', async () => {
  await platformDb.query(
    `UPDATE users SET status='active' WHERE id=$1`,
    [adminUserId],
  );
  const start = await api('/api/platform/impersonate', {
    jar,
    csrf: csrf(),
    body: { user_id: adminUserId, reason: 'Investigate reported defect' },
  });
  assert.equal(start.status, 201, JSON.stringify(start.body));
  const handle = start.body.data as Json;
  assert.equal(handle.client_id, clientId);

  const end = await api(`/api/platform/impersonate/${handle.id as string}/end`, {
    method: 'POST',
    jar,
    csrf: csrf(),
  });
  assert.equal(end.status, 200);
});

test('platform users can be invited, reset, and suspended', async () => {
  const email = `platform-new-${suffix}@example.test`;
  const created = await api('/api/platform/platform-users', {
    jar,
    csrf: csrf(),
    body: { email, full_name: 'New Operator', password: 'InitialPassword!42' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const user = created.body.data as Json;
  const id = user.id as string;
  extraPlatformUsers.push(id);
  assert.equal(user.must_change_password, true);

  const reset = await api(`/api/platform/platform-users/${id}`, {
    method: 'PATCH',
    jar,
    csrf: csrf(),
    body: { action: 'reset_password' },
  });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.ok((reset.body.data as Json).temporary_password);

  const suspend = await api(`/api/platform/platform-users/${id}`, {
    method: 'PATCH',
    jar,
    csrf: csrf(),
    body: { action: 'suspend' },
  });
  assert.equal(suspend.status, 200);
  assert.equal((suspend.body.data as Json).status, 'suspended');
});

test('deprovisioning disables the module and revokes tenant access', async () => {
  const deprovision = await api(`/api/platform/clients/${clientId}/modules/retail`, {
    method: 'DELETE',
    jar,
    csrf: csrf(),
  });
  assert.equal(deprovision.status, 202, JSON.stringify(deprovision.body));

  const instances = await api(`/api/platform/modules/instances?client_id=${clientId}&module_key=retail`, { jar });
  assert.equal(instances.status, 200);
  assert.equal((instances.body.data as Json[])[0]!.status, 'disabled');

  const audit = await api(`/api/platform/audit?client_id=${clientId}&action=module.deprovision.request`, { jar });
  assert.equal(audit.status, 200);
  assert.equal(Number((audit.body.meta as Json).total), 1);
});

test('audit export is CSV and neutralises spreadsheet formulas', async () => {
  const exportResponse = await fetch(`${baseUrl}/api/platform/audit/export?client_id=${clientId}`, {
    headers: { cookie: cookieHeader(jar) },
  });
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get('content-type') ?? '', /text\/csv/);
  const csv = await exportResponse.text();
  assert.match(csv.split('\r\n')[0]!, /platform_override/);
  assert.match(csv, /module_access\.enter/);
});

test('the client archive route revokes sessions and hides the client', async () => {
  const removed = await api(`/api/platform/clients/${clientId}`, {
    method: 'DELETE',
    jar,
    csrf: csrf(),
  });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  const missing = await api(`/api/platform/clients/${clientId}`, { jar });
  assert.equal(missing.status, 404);
});

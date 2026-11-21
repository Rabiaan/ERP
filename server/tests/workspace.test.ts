import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app';
import { hashPassword } from '../src/auth/password';
import { signModuleAccessToken } from '../src/auth/tokens';
import { generateTotpSecret, totpCode } from '../src/auth/totp';
import { config } from '../src/config';
import { PlatformDb } from '../src/db/platform';
import { TenantPoolRegistry } from '../src/db/registry';
import { withTenantTx } from '../src/db/tenant';
import { LocalKmsProvider } from '../src/kms/local';
import {
  dropTenantAppRole,
  dropTenantDatabase,
  provisionTenantDatabase,
} from '../src/provisioning/database';

type Json = Record<string, unknown>;

type ApiOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  bearer?: string;
  jar?: Map<string, string>;
};

type ApiResponse = { status: number; body: Json; text: string; setCookies: string[] };

const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
const password = 'CorrectHorseBattery!42';
const tenantEmail = `ws-tenant-${suffix}@example.test`;
const platformEmail = `ws-platform-${suffix}@example.test`;

let platformDb: PlatformDb;
let registry: TenantPoolRegistry;
let kms: LocalKmsProvider;
let server: Server;
let baseUrl: string;
let planId: string;
let clientId: string;
let otherClientId: string;
let otherProductId: string;
let tenantUserId: string;
let membershipId: string;
let platformUserId: string;
let mfaSecret: string;
let tenantBearer: string;
let accountsBearer: string;
let platformBearer: string;
let productId: string;
let customerId: string;
let invoiceId: string;
let refundId: string;
let journalId: string;
let unbalancedJournalId: string;

const databases: string[] = [];
const roles: string[] = [];

function setCookies(headers: Headers): string[] {
  const withMethod = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof withMethod.getSetCookie === 'function') return withMethod.getSetCookie();
  const combined = headers.get('set-cookie');
  return combined ? [combined] : [];
}

function updateJar(jar: Map<string, string>, response: ApiResponse): void {
  for (const cookie of response.setCookies) {
    const pair = cookie.split(';', 1)[0] ?? '';
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (value === '' || /max-age=0/i.test(cookie) || /1970/i.test(cookie)) jar.delete(name);
    else jar.set(name, value);
  }
}

async function api(path: string, options: ApiOptions = {}): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.bearer) headers.authorization = `Bearer ${options.bearer}`;
  if (options.jar && options.jar.size > 0) {
    headers.cookie = [...options.jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') && text ? (JSON.parse(text) as Json) : {};
  const parsed: ApiResponse = { status: response.status, body, text, setCookies: setCookies(response.headers) };
  if (options.jar) updateJar(options.jar, parsed);
  return parsed;
}

function cookieValue(response: ApiResponse, name: string): string {
  const cookie = response.setCookies.find((item) => item.startsWith(`${name}=`));
  assert.ok(cookie, `expected ${name} cookie`);
  return cookie.split(';', 1)[0]!.slice(name.length + 1);
}

function errorCode(body: Json): unknown {
  const error = body.error;
  return typeof error === 'object' && error !== null ? (error as Json).code : undefined;
}

function data(response: ApiResponse): Json {
  return response.body.data as Json;
}

before(async () => {
  platformDb = new PlatformDb({
    connectionString: config.platformDatabaseUrl,
    max: 8,
    connectionTimeoutMillis: 5000,
  });
  kms = new LocalKmsProvider(config.kmsLocalKey);
  registry = new TenantPoolRegistry({
    platformDb,
    kms,
    maxPerTenant: 4,
    globalMax: 8,
    idleMs: 1000,
    cacheTtlMs: 1000,
    connectionTimeoutMs: 5000,
    defaultStatementTimeoutMs: 10000,
  });
  await platformDb.ping();

  const plan = await platformDb.query<{ id: string }>(
    `INSERT INTO plans (key, name, max_users, max_modules)
     VALUES ($1, 'Workspace test plan', 20, 4) RETURNING id::text`,
    [`ws-plan-${suffix}`],
  );
  planId = plan.rows[0]!.id;

  const client = await platformDb.query<{ id: string }>(
    `INSERT INTO clients (name, slug, status, plan_id)
     VALUES ($1, $2, 'active', $3) RETURNING id::text`,
    [`Workspace ${suffix}`, `ws-${suffix}`, planId],
  );
  clientId = client.rows[0]!.id;

  const otherClient = await platformDb.query<{ id: string }>(
    `INSERT INTO clients (name, slug, status, plan_id)
      VALUES ($1, $2, 'active', $3) RETURNING id::text`,
    [`Other Workspace ${suffix}`, `ws-other-${suffix}`, planId],
  );
  otherClientId = otherClient.rows[0]!.id;

  const user = await platformDb.query<{ id: string }>(
    `INSERT INTO users (email, full_name, password_hash, status, must_change_password)
     VALUES ($1, 'Workspace Admin', $2, 'active', false) RETURNING id::text`,
    [tenantEmail, await hashPassword(password)],
  );
  tenantUserId = user.rows[0]!.id;

  for (const moduleKey of ['retail', 'accounts'] as const) {
    const provisioned = await provisionTenantDatabase({ clientId, moduleKey }, kms);
    databases.push(provisioned.dbName);
    roles.push(provisioned.appRole);
    await platformDb.query(
      `INSERT INTO client_modules (client_id, module_key, status, db_name, db_secret_ref, schema_version)
       VALUES ($1, $2, 'active', $3, $4, $5)`,
      [clientId, moduleKey, provisioned.dbName, provisioned.secretRef, provisioned.schemaVersion],
    );
    await platformDb.query(
      `INSERT INTO db_registry (client_id, module_key, db_name, secret_ref, schema_version, health)
       VALUES ($1, $2, $3, $4, $5, 'healthy')`,
      [clientId, moduleKey, provisioned.dbName, provisioned.secretRef, provisioned.schemaVersion],
    );
  }

  const otherProvisioned = await provisionTenantDatabase(
    { clientId: otherClientId, moduleKey: 'retail' },
    kms,
  );
  databases.push(otherProvisioned.dbName);
  roles.push(otherProvisioned.appRole);
  await platformDb.query(
    `INSERT INTO client_modules (client_id, module_key, status, db_name, db_secret_ref, schema_version)
     VALUES ($1, 'retail', 'active', $2, $3, $4)`,
    [otherClientId, otherProvisioned.dbName, otherProvisioned.secretRef, otherProvisioned.schemaVersion],
  );
  await platformDb.query(
    `INSERT INTO db_registry (client_id, module_key, db_name, secret_ref, schema_version, health)
     VALUES ($1, 'retail', $2, $3, $4, 'healthy')`,
    [otherClientId, otherProvisioned.dbName, otherProvisioned.secretRef, otherProvisioned.schemaVersion],
  );
  const otherPool = await registry.getPool(otherClientId, 'retail');
  otherProductId = await withTenantTx(
    otherPool,
    { clientId: otherClientId, moduleKey: 'retail' },
    async (client) => {
      const product = await client.query<{ id: string }>(
        `INSERT INTO products (client_id, module_key, sku, name, cost_price, sale_price, reorder_level)
         VALUES ($1, 'retail', $2, $3, 40, 100, 5) RETURNING id::text`,
        [otherClientId, `OTHER-${suffix}`, 'Other Tenant Widget'],
      );
      return product.rows[0]!.id;
    },
  );

  const membership = await platformDb.query<{ id: string }>(
    `INSERT INTO memberships (user_id, client_id, module_key, role, status, created_by)
     VALUES ($1, $2, 'retail', 'client_admin', 'active', $1) RETURNING id::text`,
    [tenantUserId, clientId],
  );
  membershipId = membership.rows[0]!.id;
  await platformDb.query(
    `INSERT INTO role_grants (membership_id, permission_key, granted_by)
     SELECT $1, key, $2 FROM permissions
      WHERE module_key IN ('retail', 'accounts', 'administration')`,
     [membershipId, tenantUserId],
  );

  const accountsMembership = await platformDb.query<{ id: string }>(
    `INSERT INTO memberships (user_id, client_id, module_key, role, status, created_by)
     VALUES ($1, $2, 'accounts', 'client_admin', 'active', $1) RETURNING id::text`,
    [tenantUserId, clientId],
  );
  await platformDb.query(
    `INSERT INTO role_grants (membership_id, permission_key, granted_by)
     SELECT $1, key, $2 FROM permissions
      WHERE module_key IN ('retail', 'accounts', 'administration')`,
    [accountsMembership.rows[0]!.id, tenantUserId],
  );

  mfaSecret = generateTotpSecret();
  const platformUser = await platformDb.query<{ id: string }>(
    `INSERT INTO platform_users (
       email, full_name, password_hash, status, mfa_enabled, mfa_secret_enc, must_change_password
     ) VALUES ($1, 'Workspace Operator', $2, 'active', true, $3, false) RETURNING id::text`,
    [platformEmail, await hashPassword(password), await kms.encrypt(mfaSecret)],
  );
  platformUserId = platformUser.rows[0]!.id;

  const retailPool = await registry.getPool(clientId, 'retail');
  const seed = await withTenantTx(retailPool, { clientId, moduleKey: 'retail' }, async (client) => {
    const product = await client.query<{ id: string }>(
      `INSERT INTO products (client_id, module_key, sku, name, cost_price, sale_price, reorder_level)
       VALUES ($1, 'retail', $2, $3, 40, 100, 5) RETURNING id::text`,
      [clientId, `WS-${suffix}`, 'Test Widget'],
    );
    const customer = await client.query<{ id: string }>(
      `INSERT INTO customers (client_id, module_key, code, name)
       VALUES ($1, 'retail', $2, 'Test Customer') RETURNING id::text`,
      [clientId, `C-${suffix}`],
    );
    const warehouse = await client.query<{ id: string }>(
      `SELECT id::text FROM warehouses WHERE is_default = true AND deleted_at IS NULL LIMIT 1`,
    );
    await client.query(
      `INSERT INTO product_stock (client_id, module_key, product_id, warehouse_id, quantity)
       VALUES ($1, 'retail', $2, $3, 10)`,
      [clientId, product.rows[0]!.id, warehouse.rows[0]!.id],
    );
    const invoice = await client.query<{ id: string }>(
      `INSERT INTO invoices (client_id, module_key, number, customer_id, warehouse_id, status)
       VALUES ($1, 'retail', $2, $3, $4, 'draft') RETURNING id::text`,
      [clientId, `INV-${suffix}`, customer.rows[0]!.id, warehouse.rows[0]!.id],
    );
    await client.query(
      `INSERT INTO invoice_lines (
         client_id, module_key, invoice_id, product_id, description, quantity, rate, discount, tax, line_total
       ) VALUES ($1, 'retail', $2, $3, 'Test Widget', 2, 100, 0, 0, 200)`,
      [clientId, invoice.rows[0]!.id, product.rows[0]!.id],
    );
    const refund = await client.query<{ id: string }>(
      `INSERT INTO refunds (client_id, module_key, number, invoice_id, customer_id, total, status)
       VALUES ($1, 'retail', $2, $3, $4, 50, 'pending') RETURNING id::text`,
      [clientId, `REF-${suffix}`, invoice.rows[0]!.id, customer.rows[0]!.id],
    );
    return {
      productId: product.rows[0]!.id,
      customerId: customer.rows[0]!.id,
      invoiceId: invoice.rows[0]!.id,
      refundId: refund.rows[0]!.id,
    };
  });
  productId = seed.productId;
  customerId = seed.customerId;
  invoiceId = seed.invoiceId;
  refundId = seed.refundId;

  const accountsPool = await registry.getPool(clientId, 'accounts');
  const accountSeed = await withTenantTx(accountsPool, { clientId, moduleKey: 'accounts' }, async (client) => {
    const cash = await client.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (client_id, module_key, code, name, type)
       VALUES ($1, 'accounts', $2, 'Cash', 'asset') RETURNING id::text`,
      [clientId, `CASH-${suffix}`],
    );
    const equity = await client.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (client_id, module_key, code, name, type)
       VALUES ($1, 'accounts', $2, 'Equity', 'equity') RETURNING id::text`,
      [clientId, `EQ-${suffix}`],
    );
    const period = await client.query<{ id: string }>(
      `INSERT INTO fiscal_periods (client_id, module_key, name, starts_on, ends_on, status)
       VALUES ($1, 'accounts', $2, current_date - 1, current_date + 30, 'open') RETURNING id::text`,
      [clientId, `FY-${suffix}`],
    );
    const balanced = await client.query<{ id: string }>(
      `INSERT INTO journal_entries (client_id, module_key, number, period_id, status)
       VALUES ($1, 'accounts', $2, $3, 'draft') RETURNING id::text`,
      [clientId, `JV-${suffix}`, period.rows[0]!.id],
    );
    await client.query(
      `INSERT INTO journal_lines (client_id, module_key, journal_entry_id, account_id, debit, credit)
       VALUES ($1, 'accounts', $2, $3, 100, 0), ($1, 'accounts', $2, $4, 0, 100)`,
      [clientId, balanced.rows[0]!.id, cash.rows[0]!.id, equity.rows[0]!.id],
    );
    const unbalanced = await client.query<{ id: string }>(
      `INSERT INTO journal_entries (client_id, module_key, number, period_id, status)
       VALUES ($1, 'accounts', $2, $3, 'draft') RETURNING id::text`,
      [clientId, `JVX-${suffix}`, period.rows[0]!.id],
    );
    await client.query(
      `INSERT INTO journal_lines (client_id, module_key, journal_entry_id, account_id, debit, credit)
       VALUES ($1, 'accounts', $2, $3, 100, 0), ($1, 'accounts', $2, $4, 0, 90)`,
      [clientId, unbalanced.rows[0]!.id, cash.rows[0]!.id, equity.rows[0]!.id],
    );
    return { balanced: balanced.rows[0]!.id, unbalanced: unbalanced.rows[0]!.id };
  });
  journalId = accountSeed.balanced;
  unbalancedJournalId = accountSeed.unbalanced;

  const app = createApp({ platformDb, registry, kms, startedAt: Date.now(), version: 'workspace-test' });
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const tenantJar = new Map<string, string>();
  const login = await api('/api/auth/tenant/login', {
    jar: tenantJar,
    body: { email: tenantEmail, password, module_key: 'retail' },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  tenantBearer = cookieValue(login, 'lilac_tenant_at');

  const accountsJar = new Map<string, string>();
  const accountsLogin = await api('/api/auth/tenant/login', {
    jar: accountsJar,
    body: { email: tenantEmail, password, module_key: 'accounts' },
  });
  assert.equal(accountsLogin.status, 200, JSON.stringify(accountsLogin.body));
  accountsBearer = cookieValue(accountsLogin, 'lilac_tenant_at');

  const platformJar = new Map<string, string>();
  const challenge = await api('/api/auth/platform/login', {
    jar: platformJar,
    body: { email: platformEmail, password },
  });
  assert.equal(challenge.status, 401);
  const challengeToken = ((challenge.body.error as Json).details as Json).challenge_token as string;
  const verified = await api('/api/auth/platform/mfa/verify', {
    jar: platformJar,
    body: { challenge_token: challengeToken, code: totpCode(mfaSecret) },
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  platformBearer = cookieValue(verified, 'lilac_platform_at');
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (registry) await registry.closeAll();
  for (const database of databases) await dropTenantDatabase(database).catch(() => undefined);
  for (const role of roles) await dropTenantAppRole(role).catch(() => undefined);
  if (clientId) await platformDb.query('DELETE FROM clients WHERE id = $1', [clientId]).catch(() => undefined);
  if (otherClientId) await platformDb.query('DELETE FROM clients WHERE id = $1', [otherClientId]).catch(() => undefined);
  if (tenantUserId) await platformDb.query('DELETE FROM users WHERE id = $1', [tenantUserId]).catch(() => undefined);
  if (platformUserId) {
    await platformDb.query('DELETE FROM sessions WHERE user_id = $1', [platformUserId]).catch(() => undefined);
    await platformDb.query('DELETE FROM platform_users WHERE id = $1', [platformUserId]).catch(() => undefined);
  }
  if (planId) await platformDb.query('DELETE FROM plans WHERE id = $1', [planId]).catch(() => undefined);
  if (platformDb) await platformDb.end();
});

test('tenant workspace exposes scoped context, dashboard, and resources', async () => {
  const me = await api('/api/workspace/me', { bearer: tenantBearer });
  assert.equal(me.status, 200, JSON.stringify(me.body));
  assert.equal(data(me).mode, 'tenant');
  assert.equal(data(me).activeModule, 'retail');
  assert.ok(((data(me).permissions as string[]).includes('retail.products.create')));

  const dashboard = await api('/api/workspace/retail/dashboard', { bearer: tenantBearer });
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  assert.ok((data(dashboard).cards as Json[]).some((card) => card.key === 'low_stock'));

  const resources = await api('/api/workspace/retail/resources', { bearer: tenantBearer });
  assert.equal(resources.status, 200);
  assert.ok((data(resources).resources as string[]).includes('purchase-returns'));
});

test('guessed tenant IDs cannot read or mutate another client resource', async () => {
  const read = await api(`/api/workspace/retail/products/${otherProductId}`, { bearer: tenantBearer });
  assert.equal(read.status, 404);
  assert.equal(errorCode(read.body), 'NOT_FOUND');
  assert.doesNotMatch(read.text, /Other Tenant Widget/);

  const update = await api(`/api/workspace/retail/products/${otherProductId}`, {
    bearer: tenantBearer,
    method: 'PATCH',
    body: { name: 'Stolen widget' },
  });
  assert.equal(update.status, 404);
  assert.equal(errorCode(update.body), 'NOT_FOUND');

  const remove = await api(`/api/workspace/retail/products/${otherProductId}`, {
    bearer: tenantBearer,
    method: 'DELETE',
  });
  assert.equal(remove.status, 404);
  assert.equal(errorCode(remove.body), 'NOT_FOUND');

  const otherPool = await registry.getPool(otherClientId, 'retail');
  const preserved = await withTenantTx(
    otherPool,
    { clientId: otherClientId, moduleKey: 'retail' },
    async (client) => {
      const result = await client.query<{ name: string }>(
        'SELECT name FROM products WHERE id = $1',
        [otherProductId],
      );
      return result.rows[0]?.name;
    },
  );
  assert.equal(preserved, 'Other Tenant Widget');
});

test('mutations write before/after audit rows in both trails', async () => {
  const created = await api('/api/workspace/retail/products', {
    bearer: tenantBearer,
    method: 'POST',
    body: { sku: `AUD-${suffix}`, name: 'Audit Widget', cost_price: 10, sale_price: 25, reorder_level: 1 },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const targetId = data(created).id as string;

  const patched = await api(`/api/workspace/retail/products/${targetId}`, {
    bearer: tenantBearer,
    method: 'PATCH',
    body: { name: 'Audited Widget' },
  });
  assert.equal(patched.status, 200, JSON.stringify(patched.body));

  const platformAudit = await platformDb.query<{
    before: Json;
    after: Json;
    actor_type: string;
    entity_id: string;
    platform_override: boolean;
  }>(
    `SELECT before, after, actor_type, entity_id, platform_override
       FROM audit_events
      WHERE entity_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [targetId],
  );
  assert.equal(platformAudit.rows.length, 1);
  assert.equal(platformAudit.rows[0]!.actor_type, 'tenant');
  assert.equal(platformAudit.rows[0]!.entity_id, targetId);
  assert.equal(platformAudit.rows[0]!.platform_override, false);
  assert.ok(platformAudit.rows[0]!.before);
  assert.equal(platformAudit.rows[0]!.after.name, 'Audited Widget');

  const tenantPool = await registry.getPool(clientId, 'retail');
  const tenantAudit = await withTenantTx(
    tenantPool,
    { clientId, moduleKey: 'retail' },
    async (client) => {
      const result = await client.query<{ before: Json; after: Json; platform_override: boolean }>(
        `SELECT before, after, platform_override
           FROM module_audit
          WHERE entity_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [targetId],
      );
      return result.rows[0];
    },
  );
  assert.ok(tenantAudit);
  assert.ok(tenantAudit.before);
  assert.equal(tenantAudit.after.name, 'Audited Widget');
  assert.equal(tenantAudit.platform_override, false);
});

test('generic CRUD is tenant scoped, audited, and exports formula-safe CSV', async () => {
  const created = await api('/api/workspace/retail/products', {
    bearer: tenantBearer,
    method: 'POST',
    body: { sku: `CSV-${suffix}`, name: '=SUM(1+1)', cost_price: 10, sale_price: 25, reorder_level: 1 },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const newId = data(created).id as string;

  const patched = await api(`/api/workspace/retail/products/${newId}`, {
    bearer: tenantBearer,
    method: 'PATCH',
    body: { name: '=SUM(2+2)' },
  });
  assert.equal(patched.status, 200, JSON.stringify(patched.body));

  const list = await api(`/api/workspace/retail/products?q=${encodeURIComponent('=SUM')}`, { bearer: tenantBearer });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(data(list)));

  const exported = await api(`/api/workspace/retail/products/export?q=${encodeURIComponent('=SUM')}`, { bearer: tenantBearer });
  assert.equal(exported.status, 200);
  assert.match(exported.text, /'=SUM/);

  const audit = await api('/api/workspace/retail/admin/audit', { bearer: tenantBearer });
  assert.equal(audit.status, 200, JSON.stringify(audit.body));
  assert.ok(Array.isArray(data(audit)));

  const removed = await api(`/api/workspace/retail/products/${newId}`, {
    bearer: tenantBearer,
    method: 'DELETE',
  });
  assert.equal(removed.status, 204);
});

test('invoice finalize, duplicate, and refund approval maintain stock and balances', async () => {
  const retailPool = await registry.getPool(clientId, 'retail');
  const readStock = async (): Promise<number> => withTenantTx(retailPool, { clientId, moduleKey: 'retail' }, async (client) => {
    const result = await client.query<{ quantity: string }>(
      'SELECT quantity::text FROM product_stock WHERE product_id = $1',
      [productId],
    );
    return Number(result.rows[0]!.quantity);
  });
  const readBalance = async (): Promise<number> => withTenantTx(retailPool, { clientId, moduleKey: 'retail' }, async (client) => {
    const result = await client.query<{ balance: string }>('SELECT balance::text FROM customers WHERE id = $1', [customerId]);
    return Number(result.rows[0]!.balance);
  });

  const beforeStock = await readStock();
  const finalize = await api(`/api/workspace/retail/invoices/${invoiceId}/finalize`, {
    bearer: tenantBearer,
    method: 'POST',
    body: {},
  });
  assert.equal(finalize.status, 200, JSON.stringify(finalize.body));
  assert.equal(data(finalize).status, 'finalized');
  assert.equal(await readStock(), beforeStock - 2);
  assert.equal(await readBalance(), 200);

  const duplicate = await api(`/api/workspace/retail/invoices/${invoiceId}/duplicate`, {
    bearer: tenantBearer,
    method: 'POST',
    body: { number: `DUP-${suffix}` },
  });
  assert.equal(duplicate.status, 200, JSON.stringify(duplicate.body));
  assert.equal(data(duplicate).status, 'draft');

  const refund = await api(`/api/workspace/retail/refunds/${refundId}/approve`, {
    bearer: tenantBearer,
    method: 'POST',
    body: {},
  });
  assert.equal(refund.status, 200, JSON.stringify(refund.body));
  assert.equal(data(refund).status, 'approved');
  assert.equal(await readStock(), beforeStock);
  assert.equal(await readBalance(), 150);
});

test('accounts journal posting enforces balanced entries', async () => {
  const rejected = await api(`/api/workspace/accounts/journals/${unbalancedJournalId}/post`, {
    bearer: accountsBearer,
    method: 'POST',
    body: {},
  });
  assert.equal(rejected.status, 422, JSON.stringify(rejected.body));

  const posted = await api(`/api/workspace/accounts/journals/${journalId}/post`, {
    bearer: accountsBearer,
    method: 'POST',
    body: {},
  });
  assert.equal(posted.status, 200, JSON.stringify(posted.body));
  assert.equal(data(posted).status, 'posted');
});

test('admin endpoints manage users and roles with delegated permissions', async () => {
  const invite = await api('/api/workspace/retail/admin/users', {
    bearer: tenantBearer,
    method: 'POST',
    body: {
      email: `ws-invite-${suffix}@example.test`,
      fullName: 'Invited Operator',
      role: 'operator',
    },
  });
  assert.equal(invite.status, 201, JSON.stringify(invite.body));
  assert.ok(data(invite).inviteToken);

  const role = await api('/api/workspace/retail/admin/roles', {
    bearer: tenantBearer,
    method: 'POST',
    body: { name: `Auditor ${suffix}`, permissions: ['retail.products.view', 'retail.sales.view'] },
  });
  assert.equal(role.status, 201, JSON.stringify(role.body));

  const branches = await api('/api/workspace/retail/admin/branches', {
    bearer: tenantBearer,
    method: 'POST',
    body: { code: `B-${suffix}`, name: 'Secondary Branch', is_default: false },
  });
  assert.equal(branches.status, 201, JSON.stringify(branches.body));
});

test('platform module override is mode-aware and fully audited', async () => {
  const access = await platformDb.query<{ id: string }>(
    `INSERT INTO platform_module_access (platform_user_id, client_id, module_key, mode, reason)
     VALUES ($1, $2, 'retail', 'inspect', $3) RETURNING id::text`,
    [platformUserId, clientId, `workspace test ${suffix}`],
  );
  const accessId = access.rows[0]!.id;
  const token = await signModuleAccessToken({
    platformUserId,
    accessId,
    clientId,
    moduleKey: 'retail',
    mode: 'inspect',
    reason: `workspace test ${suffix}`,
  });
  const headers = { 'x-module-access-token': token };

  const me = await api('/api/workspace/me', { bearer: platformBearer, headers });
  assert.equal(me.status, 200, JSON.stringify(me.body));
  assert.equal(data(me).mode, 'platform');

  const read = await api('/api/workspace/retail/products', { bearer: platformBearer, headers });
  assert.equal(read.status, 200, JSON.stringify(read.body));

  const write = await api('/api/workspace/retail/products', {
    bearer: platformBearer,
    headers,
    method: 'POST',
    body: { sku: `OVR-${suffix}`, name: 'Inspect should be read only', sale_price: 10 },
  });
  assert.equal(write.status, 403);
  assert.equal(errorCode(write.body), 'FORBIDDEN');

  const crossModule = await api('/api/workspace/accounts/products', { bearer: platformBearer, headers });
  assert.equal(crossModule.status, 403);

  const supportAccess = await platformDb.query<{ id: string }>(
    `INSERT INTO platform_module_access (platform_user_id, client_id, module_key, mode, reason)
     VALUES ($1, $2, 'retail', 'support', $3) RETURNING id::text`,
    [platformUserId, clientId, `workspace support ${suffix}`],
  );
  const supportToken = await signModuleAccessToken({
    platformUserId,
    accessId: supportAccess.rows[0]!.id,
    clientId,
    moduleKey: 'retail',
    mode: 'support',
    reason: `workspace support ${suffix}`,
  });
  const supportHeaders = { 'x-module-access-token': supportToken };
  const supportWrite = await api(`/api/workspace/retail/products/${productId}`, {
    bearer: platformBearer,
    headers: supportHeaders,
    method: 'PATCH',
    body: { name: 'Support updated widget' },
  });
  assert.equal(supportWrite.status, 200, JSON.stringify(supportWrite.body));

  const platformAudit = await platformDb.query<{ platform_override: boolean }>(
    `SELECT platform_override FROM audit_events
      WHERE client_id = $1 AND module_key = 'retail' AND platform_override = true LIMIT 1`,
    [clientId],
  );
  assert.equal(platformAudit.rows.length, 1);
});

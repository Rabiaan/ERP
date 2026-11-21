import 'dotenv/config';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { hashPassword } from '../auth/password';
import { resolveMembershipPermissions } from '../authz/resolver';
import { permissionsForPreset, type ModuleKey, type PermissionKey } from '../authz/catalog';
import { config } from '../config';
import { PlatformDb } from '../db/platform';
import { TenantPoolRegistry } from '../db/registry';
import { withTenantTx } from '../db/tenant';
import { LocalKmsProvider } from '../kms/local';
import type { TenantModuleKey } from '../provisioning/migrate';
import { createPgDumpSnapshotter } from '../provisioning/snapshot';
import {
  createProvisioningAdapter,
  requestProvisioning,
  retryProvisioningJob,
  runProvisioningJob,
  type ProvisioningRequestResult,
} from '../provisioning/service';

const DEMO_PASSWORD = 'ChangeMe123!';
const OWNER_EMAIL = 'owner@lilacoffice.app';
const UUID_NAMESPACE = 'lilac-office-demo-v1';
const SEED_YEAR = 2026;
const SEED_MONTH = 9;
const SEED_DAY = 31;

type SqlValue = string | number | boolean | null;

type UserSeed = {
  key: string;
  email: string;
  fullName: string;
  roleLabel: string;
};

type PlanSeed = {
  key: string;
  name: string;
  maxUsers: number;
  maxBranches: number;
  maxModules: number;
  storageMb: number;
  pricePkr: number;
};

type SubAdminSeed = {
  userKey: string;
  moduleKey: TenantModuleKey;
  role: 'module_admin' | 'manager' | 'viewer';
  roleLabel: string;
  grants?: readonly string[];
};

type ClientSeed = {
  key: string;
  name: string;
  slug: string;
  planKey: string;
  modules: readonly TenantModuleKey[];
  adminKey: string;
  subAdmins: readonly SubAdminSeed[];
};

const USERS: readonly UserSeed[] = [
  { key: 'owner', email: OWNER_EMAIL, fullName: 'Tariq Mansoor', roleLabel: 'Super Admin' },
  {
    key: 'northwind-admin',
    email: 'admin@northwindstudios.com',
    fullName: 'Tariq Mansoor',
    roleLabel: 'Client Administrator',
  },
  {
    key: 'northwind-hr',
    email: 'hr@northwindstudios.com',
    fullName: 'Ayesha Khan',
    roleLabel: 'HR Manager',
  },
  {
    key: 'northwind-retail',
    email: 'retail@northwindstudios.com',
    fullName: 'Zain Malik',
    roleLabel: 'Retail Manager',
  },
  {
    key: 'beacon-admin',
    email: 'admin@beaconacademy.edu',
    fullName: 'Sara Ahmed',
    roleLabel: 'Client Administrator',
  },
  {
    key: 'beacon-school',
    email: 'registrar@beaconacademy.edu',
    fullName: 'Bilal Hassan',
    roleLabel: 'School Registrar',
  },
  {
    key: 'meridian-admin',
    email: 'admin@meridiantraders.com',
    fullName: 'Omar Siddiqui',
    roleLabel: 'Client Administrator',
  },
  {
    key: 'meridian-accounts',
    email: 'accounts@meridiantraders.com',
    fullName: 'Sana Babar',
    roleLabel: 'Accounts Manager',
  },
  {
    key: 'meridian-products-viewer',
    email: 'products.viewer@meridiantraders.com',
    fullName: 'Products Viewer',
    roleLabel: 'Products Viewer',
  },
];

const PLANS: readonly PlanSeed[] = [
  {
    key: 'starter',
    name: 'Starter',
    maxUsers: 10,
    maxBranches: 1,
    maxModules: 1,
    storageMb: 1024,
    pricePkr: 4999,
  },
  {
    key: 'growth',
    name: 'Growth',
    maxUsers: 50,
    maxBranches: 10,
    maxModules: 4,
    storageMb: 20480,
    pricePkr: 24999,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    maxUsers: 500,
    maxBranches: 100,
    maxModules: 4,
    storageMb: 204800,
    pricePkr: 99999,
  },
];

const CLIENTS: readonly ClientSeed[] = [
  {
    key: 'northwind',
    name: 'Northwind Studios',
    slug: 'northwind-studios',
    planKey: 'growth',
    modules: ['hr', 'retail'],
    adminKey: 'northwind-admin',
    subAdmins: [
      {
        userKey: 'northwind-hr',
        moduleKey: 'hr',
        role: 'manager',
        roleLabel: 'HR Manager',
      },
      {
        userKey: 'northwind-retail',
        moduleKey: 'retail',
        role: 'manager',
        roleLabel: 'Retail Manager',
      },
    ],
  },
  {
    key: 'beacon',
    name: 'Beacon Academy',
    slug: 'beacon-academy',
    planKey: 'growth',
    modules: ['school'],
    adminKey: 'beacon-admin',
    subAdmins: [
      {
        userKey: 'beacon-school',
        moduleKey: 'school',
        role: 'manager',
        roleLabel: 'School Registrar',
      },
    ],
  },
  {
    key: 'meridian',
    name: 'Meridian Traders',
    slug: 'meridian-traders',
    planKey: 'growth',
    modules: ['retail', 'accounts'],
    adminKey: 'meridian-admin',
    subAdmins: [
      {
        userKey: 'meridian-accounts',
        moduleKey: 'accounts',
        role: 'manager',
        roleLabel: 'Accounts Manager',
      },
      {
        userKey: 'meridian-products-viewer',
        moduleKey: 'retail',
        role: 'viewer',
        roleLabel: 'Products Viewer',
        grants: ['retail.products.view'],
      },
    ],
  },
];

const FIRST_NAMES = [
  'Ayesha',
  'Bilal',
  'Zain',
  'Sara',
  'Omar',
  'Sana',
  'Tariq',
  'Hira',
  'Usman',
  'Mahnoor',
  'Farhan',
  'Rabia',
  'Saad',
  'Amina',
  'Kamran',
  'Laiba',
  'Shahzaib',
  'Waleed',
  'Natasha',
  'Faiza',
] as const;

const LAST_NAMES = [
  'Khan',
  'Ahmed',
  'Malik',
  'Hassan',
  'Siddiqui',
  'Babar',
  'Mansoor',
  'Noor',
  'Mirza',
  'Tariq',
  'Saleem',
  'Anwer',
  'Iqbal',
  'Sheikh',
  'Bhatti',
  'Mustafa',
  'Afridi',
  'Akram',
  'Ali',
  'Ilyas',
] as const;

const BUSINESS_NAMES = [
  'Alpha Supplies',
  'Bright Traders',
  'Cedar Stores',
  'Delta Foods',
  'Evergreen Goods',
  'Falcon Distributors',
  'Golden Valley',
  'Harbor Point',
  'Ibn e Sina Traders',
  'Jasmine Mart',
  'Khyber Supplies',
  'Lumen Electronics',
  'Metro Corner',
  'Nile Commercial',
  'Orchard Retail',
] as const;

const DEPENDENCY_NAMES = [
  'Sunrise Groups',
  'Pak Merchants',
  'Prime Vendors',
  'Quality House',
  'Rapid Supply',
  'Silver Star',
  'Trusted Source',
  'United Distributors',
  'Value Point',
  'Westline',
  'Yasir Traders',
  'Zenith Supply',
  'Apex Mercantile',
  'Blue Ocean',
  'Crestline',
] as const;

const EXPENSE_CATEGORIES = [
  'Rent',
  'Utilities',
  'Salaries',
  'Transport',
  'Marketing',
  'Supplies',
  'Maintenance',
  'Software',
] as const;

function requireValue<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}

function seedUuid(label: string): string {
  const digest = createHash('sha256').update(`${UUID_NAMESPACE}:${label}`).digest('hex');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `a${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}

function userId(key: string): string {
  return seedUuid(`user:${key}`);
}

function planId(key: string): string {
  return seedUuid(`plan:${key}`);
}

function clientId(key: string): string {
  return seedUuid(`client:${key}`);
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seedNumber(label: string): number {
  return Number.parseInt(createHash('sha256').update(label).digest('hex').slice(0, 8), 16) >>> 0;
}

function int(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function money(value: number): string {
  return value.toFixed(2);
}

function quantity(value: number): string {
  return value.toFixed(3);
}

function personName(index: number): string {
  const first = requireValue(FIRST_NAMES[index % FIRST_NAMES.length], 'Missing seed first name');
  const last = requireValue(
    LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length],
    'Missing seed last name',
  );
  return `${first} ${last}`;
}

function pad(value: number, size: number): string {
  return String(value).padStart(size, '0');
}

function monthStart(monthsAgo: number): Date {
  const date = new Date(Date.UTC(SEED_YEAR, SEED_MONTH, 1));
  date.setUTCMonth(date.getUTCMonth() - monthsAgo);
  return date;
}

function monthDate(monthsAgo: number, day: number): string {
  const date = monthStart(monthsAgo);
  date.setUTCDate(day);
  return date.toISOString().slice(0, 10);
}

function monthEnd(monthsAgo: number): string {
  const date = monthStart(monthsAgo);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function insertRows(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly SqlValue[])[],
  chunkSize = 500,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values: SqlValue[] = [];
    const tuples = chunk.map((row) => {
      if (row.length !== columns.length) {
        throw new Error(`Seed row width mismatch for ${table}`);
      }
      values.push(...row);
      return `(${columns.map((_, index) => `$${values.length - row.length + index + 1}`).join(', ')})`;
    });
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT DO NOTHING`;
    await client.query(sql, values);
  }
}

async function platformOne<T extends Record<string, unknown>>(
  platformDb: PlatformDb,
  text: string,
  values: readonly unknown[] = [],
): Promise<T> {
  const result = await platformDb.query<T>(text, values as unknown[]);
  return requireValue(result.rows[0], 'Required platform seed row was not found.');
}

async function tenantOne<T extends Record<string, unknown>>(
  client: PoolClient,
  text: string,
  values: readonly unknown[] = [],
): Promise<T> {
  const result = await client.query<T>(text, values as unknown[]);
  return requireValue(result.rows[0], 'Required tenant seed row was not found.');
}

async function ensurePlatformOwner(platformDb: PlatformDb): Promise<string> {
  const owner = requireValue(USERS.find((entry) => entry.key === 'owner'), 'Owner seed is missing.');
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const row = await platformOne<{ id: string }>(
    platformDb,
    `INSERT INTO platform_users (
       id, email, full_name, password_hash, mfa_enabled, must_change_password, status
     )
     VALUES ($1, $2, $3, $4, false, true, 'active')
     ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            updated_at = now()
     RETURNING id::text`,
    [userId(owner.key), owner.email, owner.fullName, passwordHash],
  );
  return row.id;
}

async function ensureTenantUser(platformDb: PlatformDb, user: UserSeed): Promise<string> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const row = await platformOne<{ id: string }>(
    platformDb,
    `INSERT INTO users (
       id, email, full_name, password_hash, status, must_change_password, last_login_at
     )
     VALUES ($1, $2, $3, $4, 'active', true, NULL)
     ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            status = EXCLUDED.status,
            updated_at = now()
     RETURNING id::text`,
    [userId(user.key), user.email, user.fullName, passwordHash],
  );
  return row.id;
}

async function ensurePlans(platformDb: PlatformDb, createdBy: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const plan of PLANS) {
    const row = await platformOne<{ id: string }>(
      platformDb,
      `INSERT INTO plans (
         id, key, name, max_users, max_branches, max_modules, storage_mb, price_pkr, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       ON CONFLICT (key) DO UPDATE
          SET name = EXCLUDED.name,
              max_users = EXCLUDED.max_users,
              max_branches = EXCLUDED.max_branches,
              max_modules = EXCLUDED.max_modules,
              storage_mb = EXCLUDED.storage_mb,
              price_pkr = EXCLUDED.price_pkr,
              is_active = true,
              updated_at = now()
       RETURNING id::text`,
      [
        planId(plan.key),
        plan.key,
        plan.name,
        plan.maxUsers,
        plan.maxBranches,
        plan.maxModules,
        plan.storageMb,
        plan.pricePkr,
      ],
    );
    ids.set(plan.key, row.id);
  }
  void createdBy;
  return ids;
}

async function ensureClient(
  platformDb: PlatformDb,
  seed: ClientSeed,
  plans: Map<string, string>,
  ownerId: string,
): Promise<string> {
  const plan = requireValue(plans.get(seed.planKey), `Plan ${seed.planKey} was not seeded.`);
  const row = await platformOne<{ id: string }>(
    platformDb,
    `INSERT INTO clients (id, name, slug, status, plan_id, created_by)
     VALUES ($1, $2, $3, 'active', $4, $5)
     ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name,
            status = 'active',
            plan_id = EXCLUDED.plan_id,
            updated_at = now()
     RETURNING id::text`,
    [clientId(seed.key), seed.name, seed.slug, plan, ownerId],
  );
  return row.id;
}

async function processProvisioning(
  platformDb: PlatformDb,
  adapter: ReturnType<typeof createProvisioningAdapter>,
  ownerId: string,
  target: {
    clientKey: string;
    clientDbId: string;
    moduleKey: TenantModuleKey;
    adminUserId: string;
  },
): Promise<void> {
  const result: ProvisioningRequestResult = await requestProvisioning(platformDb, {
    clientId: target.clientDbId,
    moduleKey: target.moduleKey,
    adminUserId: target.adminUserId,
    createdBy: ownerId,
    initialGrants: [`${target.moduleKey}.*`, 'administration.*'],
  });

  const module = await platformOne<{ status: string }>(
    platformDb,
    `SELECT status
       FROM client_modules
      WHERE client_id = $1
        AND module_key = $2`,
    [target.clientDbId, target.moduleKey],
  );
  if (module.status === 'active') {
    return;
  }
  if (!result.jobId) {
    throw new Error(
      `Provisioning ${target.clientKey}/${target.moduleKey} did not create a job and module is ${module.status}.`,
    );
  }

  let job = await platformOne<{
    status: string;
    last_error: string | null;
    attempts: number;
  }>(
    platformDb,
    `SELECT status, last_error, attempts
       FROM provisioning_jobs
      WHERE id = $1`,
    [result.jobId],
  );
  if (job.status === 'succeeded') {
    return;
  }
  if (job.status === 'running') {
    throw new Error(`Provisioning job ${result.jobId} is stuck in running state.`);
  }
  if (job.status === 'failed') {
    const retried = await retryProvisioningJob(platformDb, result.jobId);
    if (!retried) {
      throw new Error(
        `Provisioning job ${result.jobId} failed permanently: ${job.last_error ?? 'unknown error'}`,
      );
    }
    job = await platformOne<{ status: string; last_error: string | null; attempts: number }>(
      platformDb,
      `SELECT status, last_error, attempts
         FROM provisioning_jobs
        WHERE id = $1`,
      [result.jobId],
    );
  }
  if (job.status === 'queued') {
    await runProvisioningJob(platformDb, result.jobId, adapter);
  }

  const activated = await platformOne<{ status: string }>(
    platformDb,
    `SELECT status
       FROM client_modules
      WHERE client_id = $1
        AND module_key = $2`,
    [target.clientDbId, target.moduleKey],
  );
  if (activated.status !== 'active') {
    throw new Error(`Provisioning ${target.clientKey}/${target.moduleKey} did not activate.`);
  }
}

async function ensureMembership(
  platformDb: PlatformDb,
  input: {
    userId: string;
    clientDbId: string;
    moduleKey: TenantModuleKey;
    role: 'client_admin' | 'module_admin' | 'manager' | 'viewer';
    createdByMembershipId: string | null;
    grants: readonly string[];
    grantedBy: string;
  },
): Promise<string> {
  const membership = await platformOne<{ id: string }>(
    platformDb,
    `INSERT INTO memberships (
       user_id, client_id, module_key, role, status, created_by, created_by_membership_id
     )
     VALUES ($1, $2, $3, $4, 'active', $5, $6)
     ON CONFLICT (user_id, client_id, module_key) DO UPDATE
        SET role = EXCLUDED.role,
            status = 'active',
            created_by = EXCLUDED.created_by,
            created_by_membership_id = EXCLUDED.created_by_membership_id,
            updated_at = now()
     RETURNING id::text`,
    [
      input.userId,
      input.clientDbId,
      input.moduleKey,
      input.role,
      input.grantedBy,
      input.createdByMembershipId,
    ],
  );
  await platformDb.query('DELETE FROM role_grants WHERE membership_id = $1', [membership.id]);
  if (input.grants.length > 0) {
    await platformDb.query(
      `INSERT INTO role_grants (membership_id, permission_key, granted_by)
       SELECT $1, permission_key, $3
         FROM unnest($2::text[]) AS permissions(permission_key)`,
      [membership.id, [...input.grants], input.grantedBy],
    );
  }
  return membership.id;
}

async function seedRetail(
  client: PoolClient,
  clientKey: string,
  adminId: string,
): Promise<void> {
  const c = clientId(clientKey);
  const rng = makeRng(seedNumber(`retail:${clientKey}`));
  const mainBranch = await tenantOne<{ id: string }>(
    client,
    `SELECT id::text FROM branches WHERE client_id = $1 AND module_key = 'retail' AND code = 'MAIN'`,
    [c],
  );
  await insertRows(
    client,
    'warehouses',
    ['id', 'client_id', 'module_key', 'branch_id', 'code', 'name', 'is_default'],
    [
      [
        seedUuid(`retail:${clientKey}:warehouse:02`),
        c,
        'retail',
        mainBranch.id,
        'WH02',
        'North Warehouse',
        false,
      ],
      [
        seedUuid(`retail:${clientKey}:warehouse:03`),
        c,
        'retail',
        mainBranch.id,
        'WH03',
        'South Warehouse',
        false,
      ],
    ],
  );
  const warehouseResult = await client.query<{ id: string }>(
    `SELECT id::text
       FROM warehouses
      WHERE client_id = $1
        AND module_key = 'retail'
        AND code IN ('MAIN', 'WH02', 'WH03')
      ORDER BY code`,
    [c],
  );
  const warehouses = warehouseResult.rows.map((row) => row.id);
  const tax = await tenantOne<{ id: string }>(
    client,
    `SELECT id::text FROM tax_codes WHERE client_id = $1 AND module_key = 'retail' AND code = 'ST17'`,
    [c],
  );
  const categoryResult = await client.query<{ id: string }>(
    `SELECT id::text
       FROM categories
      WHERE client_id = $1
        AND module_key = 'retail'
        AND name IN ('General', 'Beverages', 'Groceries', 'Electronics')
      ORDER BY name`,
    [c],
  );
  const categories = categoryResult.rows.map((row) => row.id);

  const productRows: SqlValue[][] = [];
  const stockRows: SqlValue[][] = [];
  const productPrices: number[] = [];
  for (let index = 0; index < 60; index += 1) {
    const id = seedUuid(`retail:${clientKey}:product:${index + 1}`);
    const cost = Number(money(int(rng, 120, 3800) + rng()));
    const sale = Number(money(cost * (1.15 + rng() * 0.35)));
    productPrices.push(sale);
    productRows.push([
      id,
      c,
      'retail',
      adminId,
      adminId,
      `SKU-${pad(index + 1, 4)}`,
      `${requireValue(BUSINESS_NAMES[index % BUSINESS_NAMES.length], 'Missing product name')} Item ${pad(index + 1, 3)}`,
      requireValue(categories[index % categories.length], 'Missing retail category'),
      'pcs',
      money(cost),
      money(sale),
      tax.id,
      quantity(int(rng, 5, 40)),
      true,
    ]);
    for (const warehouseId of warehouses) {
      stockRows.push([
        seedUuid(`retail:${clientKey}:stock:${index + 1}:${warehouseId}`),
        c,
        'retail',
        adminId,
        adminId,
        id,
        mainBranch.id,
        warehouseId,
        quantity(int(rng, 20, 400)),
      ]);
    }
  }
  await insertRows(
    client,
    'products',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'sku',
      'name',
      'category_id',
      'unit',
      'cost_price',
      'sale_price',
      'tax_code_id',
      'reorder_level',
      'is_active',
    ],
    productRows,
  );
  await insertRows(
    client,
    'product_stock',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'product_id',
      'branch_id',
      'warehouse_id',
      'quantity',
    ],
    stockRows,
  );

  const customerRows: SqlValue[][] = [];
  for (let index = 0; index < 40; index += 1) {
    customerRows.push([
      seedUuid(`retail:${clientKey}:customer:${index + 1}`),
      c,
      'retail',
      adminId,
      adminId,
      `CUST-${pad(index + 1, 4)}`,
      requireValue(BUSINESS_NAMES[index % BUSINESS_NAMES.length], 'Missing customer name'),
      `0300${pad(int(rng, 1000000, 9999999), 7)}`,
      `customer${index + 1}@example.test`,
      index % 2 === 0 ? 'Karachi' : 'Lahore',
      money(int(rng, 50000, 500000)),
      money(int(rng, 0, 25000)),
      money(int(rng, 0, 25000)),
      true,
    ]);
  }
  await insertRows(
    client,
    'customers',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'code',
      'name',
      'phone',
      'email',
      'city',
      'credit_limit',
      'opening_balance',
      'balance',
      'is_active',
    ],
    customerRows,
  );

  const vendorRows: SqlValue[][] = [];
  for (let index = 0; index < 15; index += 1) {
    vendorRows.push([
      seedUuid(`retail:${clientKey}:vendor:${index + 1}`),
      c,
      'retail',
      adminId,
      adminId,
      `VEND-${pad(index + 1, 4)}`,
      requireValue(DEPENDENCY_NAMES[index % DEPENDENCY_NAMES.length], 'Missing vendor name'),
      `0301${pad(int(rng, 1000000, 9999999), 7)}`,
      `vendor${index + 1}@example.test`,
      int(rng, 0, 45),
      money(int(rng, 0, 30000)),
      money(int(rng, 0, 30000)),
      true,
    ]);
  }
  await insertRows(
    client,
    'vendors',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'code',
      'name',
      'phone',
      'email',
      'terms_days',
      'opening_balance',
      'balance',
      'is_active',
    ],
    vendorRows,
  );

  const salesmanRows: SqlValue[][] = [];
  for (let index = 0; index < 8; index += 1) {
    salesmanRows.push([
      seedUuid(`retail:${clientKey}:salesman:${index + 1}`),
      c,
      'retail',
      adminId,
      adminId,
      personName(index + 20),
      `0302${pad(int(rng, 1000000, 9999999), 7)}`,
      money(1 + rng() * 4),
      index % 2 === 0 ? 'Karachi Central' : 'Lahore North',
      true,
    ]);
  }
  await insertRows(
    client,
    'salesmen',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'name',
      'phone',
      'commission_rate',
      'territory',
      'is_active',
    ],
    salesmanRows,
  );

  const extraBankRows: SqlValue[][] = [];
  for (let index = 3; index <= 6; index += 1) {
    extraBankRows.push([
      seedUuid(`retail:${clientKey}:bank:${index}`),
      c,
      'retail',
      adminId,
      adminId,
      `Branch Bank ${index}`,
      `ACC-${pad(index, 4)}`,
      money(int(rng, 100000, 900000)),
      money(int(rng, 100000, 900000)),
      true,
    ]);
  }
  await insertRows(
    client,
    'banks',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'name',
      'account_number',
      'opening_balance',
      'current_balance',
      'is_active',
    ],
    extraBankRows,
  );
  const bankResult = await client.query<{ id: string }>(
    `SELECT id::text FROM banks WHERE client_id = $1 AND module_key = 'retail' ORDER BY account_number`,
    [c],
  );
  const banks = bankResult.rows.map((row) => row.id);

  const invoiceRows: SqlValue[][] = [];
  const invoiceLineRows: SqlValue[][] = [];
  const invoiceTotals: number[] = [];
  for (let index = 0; index < 120; index += 1) {
    const invoiceNo = pad(index + 1, 5);
    const invoiceId = seedUuid(`retail:${clientKey}:invoice:${invoiceNo}`);
    const month = 11 - Math.floor(index / 10);
    const date = monthDate(month, 1 + (index % 10) * 2);
    const lineCount = 2 + (index % 3);
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const productNumber = (index * 3 + lineIndex * 7) % 60;
      const rate = requireValue(productPrices[productNumber], 'Missing product price');
      const qty = int(rng, 1, 6);
      const lineDiscount = Number(money(rate * qty * (0.02 + rng() * 0.08)));
      const lineTax = Number(money((rate * qty - lineDiscount) * 0.17));
      const lineTotal = Number(money(rate * qty - lineDiscount + lineTax));
      subtotal += rate * qty - lineDiscount;
      discountTotal += lineDiscount;
      taxTotal += lineTax;
      invoiceLineRows.push([
        seedUuid(`retail:${clientKey}:invoice-line:${invoiceNo}:${lineIndex + 1}`),
        c,
        'retail',
        adminId,
        adminId,
        invoiceId,
        seedUuid(`retail:${clientKey}:product:${productNumber + 1}`),
        `Item ${pad(productNumber + 1, 4)}`,
        quantity(qty),
        money(rate),
        money(lineDiscount),
        money(lineTax),
        money(lineTotal),
      ]);
    }
    const total = Number(money(subtotal + taxTotal));
    invoiceTotals.push(total);
    const status = index % 11 === 0 ? 'draft' : index % 4 === 0 ? 'paid' : 'finalized';
    const paid = status === 'paid' ? total : status === 'draft' ? 0 : Number(money(total * 0.6));
    invoiceRows.push([
      invoiceId,
      c,
      'retail',
      adminId,
      adminId,
      `INV-${invoiceNo}`,
      seedUuid(`retail:${clientKey}:customer:${(index % 40) + 1}`),
      mainBranch.id,
      requireValue(warehouses[index % warehouses.length], 'Missing warehouse'),
      seedUuid(`retail:${clientKey}:salesman:${(index % 8) + 1}`),
      date,
      money(subtotal),
      money(discountTotal),
      money(taxTotal),
      money(total),
      money(paid),
      money(Number(money(total - paid))),
      status,
    ]);
  }
  await insertRows(
    client,
    'invoices',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'number',
      'customer_id',
      'branch_id',
      'warehouse_id',
      'salesman_id',
      'date',
      'subtotal',
      'discount',
      'tax',
      'total',
      'paid',
      'balance',
      'status',
    ],
    invoiceRows,
  );
  await insertRows(
    client,
    'invoice_lines',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'invoice_id',
      'product_id',
      'description',
      'quantity',
      'rate',
      'discount',
      'tax',
      'line_total',
    ],
    invoiceLineRows,
  );

  const purchaseRows: SqlValue[][] = [];
  const purchaseLineRows: SqlValue[][] = [];
  for (let index = 0; index < 25; index += 1) {
    const purchaseNo = pad(index + 1, 5);
    const purchaseId = seedUuid(`retail:${clientKey}:purchase:${purchaseNo}`);
    const date = monthDate(11 - Math.floor(index / 3), 3 + (index % 7) * 3);
    const lineCount = 1 + (index % 3);
    let subtotal = 0;
    let taxTotal = 0;
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const productNumber = (index * 5 + lineIndex * 11) % 60;
      const rate = Number(money(requireValue(productPrices[productNumber], 'Missing product price') * 0.7));
      const qty = int(rng, 2, 12);
      const lineTax = Number(money(rate * qty * 0.17));
      subtotal += rate * qty;
      taxTotal += lineTax;
      purchaseLineRows.push([
        seedUuid(`retail:${clientKey}:purchase-line:${purchaseNo}:${lineIndex + 1}`),
        c,
        'retail',
        adminId,
        adminId,
        purchaseId,
        seedUuid(`retail:${clientKey}:product:${productNumber + 1}`),
        quantity(qty),
        money(rate),
        money(lineTax),
        money(Number(money(rate * qty + lineTax))),
      ]);
    }
    const total = Number(money(subtotal + taxTotal));
    const status = index % 5 === 0 ? 'paid' : 'received';
    purchaseRows.push([
      purchaseId,
      c,
      'retail',
      adminId,
      adminId,
      `PUR-${purchaseNo}`,
      null,
      seedUuid(`retail:${clientKey}:vendor:${(index % 15) + 1}`),
      requireValue(warehouses[index % warehouses.length], 'Missing warehouse'),
      date,
      money(subtotal),
      money(taxTotal),
      money(total),
      status === 'paid' ? money(total) : money(Number(money(total * 0.5))),
      status === 'paid' ? '0.00' : money(Number(money(total * 0.5))),
      status,
    ]);
  }
  await insertRows(
    client,
    'purchases',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'number',
      'purchase_order_id',
      'vendor_id',
      'warehouse_id',
      'date',
      'subtotal',
      'tax',
      'total',
      'paid',
      'balance',
      'status',
    ],
    purchaseRows,
  );
  await insertRows(
    client,
    'purchase_lines',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'purchase_id',
      'product_id',
      'quantity',
      'rate',
      'tax',
      'line_total',
    ],
    purchaseLineRows,
  );

  const refundRows: SqlValue[][] = [];
  for (let index = 0; index < 12; index += 1) {
    const invoiceNumber = index + 1;
    const total = Number(money(requireValue(invoiceTotals[index], 'Missing invoice total') * 0.12));
    refundRows.push([
      seedUuid(`retail:${clientKey}:refund:${index + 1}`),
      c,
      'retail',
      adminId,
      adminId,
      `REF-${pad(index + 1, 5)}`,
      seedUuid(`retail:${clientKey}:invoice:${pad(invoiceNumber, 5)}`),
      seedUuid(`retail:${clientKey}:customer:${(index % 40) + 1}`),
      monthDate(11 - index, 12),
      money(total),
      index % 2 === 0 ? 'cash' : 'bank',
      'Demo return',
      'approved',
      adminId,
    ]);
  }
  await insertRows(
    client,
    'refunds',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'number',
      'invoice_id',
      'customer_id',
      'date',
      'total',
      'method',
      'reason',
      'status',
      'approved_by',
    ],
    refundRows,
  );

  const expenseRows: SqlValue[][] = [];
  for (let index = 0; index < 40; index += 1) {
    expenseRows.push([
      seedUuid(`retail:${clientKey}:expense:${index + 1}`),
      c,
      'retail',
      adminId,
      adminId,
      monthDate(11 - (index % 12), 4 + (index % 20)),
      requireValue(EXPENSE_CATEGORIES[index % EXPENSE_CATEGORIES.length], 'Missing expense category'),
      null,
      requireValue(banks[index % banks.length], 'Missing bank'),
      money(int(rng, 1500, 85000)),
      `EXP-REF-${pad(index + 1, 4)}`,
      null,
      index % 5 === 0 ? 'pending' : 'approved',
      index % 5 === 0 ? null : adminId,
    ]);
  }
  await insertRows(
    client,
    'expenses',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'date',
      'category',
      'account_id',
      'bank_id',
      'amount',
      'reference',
      'attachment_url',
      'status',
      'approved_by',
    ],
    expenseRows,
  );
}

async function seedSchool(client: PoolClient, clientKey: string, adminId: string): Promise<void> {
  const c = clientId(clientKey);
  const rng = makeRng(seedNumber(`school:${clientKey}`));
  const extraClassRows: SqlValue[][] = [];
  const extraClassCodes = ['G11', 'G12', 'SCI1', 'SCI2', 'COMM1'];
  const extraClassNames = ['Grade 11', 'Grade 12', 'Science I', 'Science II', 'Commerce I'];
  for (let index = 0; index < extraClassCodes.length; index += 1) {
    extraClassRows.push([
      seedUuid(`school:${clientKey}:class:${extraClassCodes[index]}`),
      c,
      'school',
      adminId,
      adminId,
      requireValue(extraClassNames[index], 'Missing class name'),
      requireValue(extraClassCodes[index], 'Missing class code'),
      13 + index,
      40,
    ]);
  }
  await insertRows(
    client,
    'classes',
    ['id', 'client_id', 'module_key', 'created_by', 'updated_by', 'name', 'code', 'level', 'capacity'],
    extraClassRows,
  );
  const classResult = await client.query<{ id: string; code: string }>(
    `SELECT id::text, code
       FROM classes
      WHERE client_id = $1
        AND module_key = 'school'
      ORDER BY level, code`,
    [c],
  );
  const classes = classResult.rows;
  const sectionRows: SqlValue[][] = classes.map((entry) => [
    seedUuid(`school:${clientKey}:section:${entry.code}:A`),
    c,
    'school',
    adminId,
    adminId,
    entry.id,
    'A',
  ]);
  await insertRows(
    client,
    'sections',
    ['id', 'client_id', 'module_key', 'created_by', 'updated_by', 'class_id', 'name'],
    sectionRows,
  );
  const sectionResult = await client.query<{ id: string; class_id: string }>(
    `SELECT id::text, class_id::text
       FROM sections
      WHERE client_id = $1
        AND module_key = 'school'
        AND name = 'A'`,
    [c],
  );
  const sections = new Map(sectionResult.rows.map((row) => [row.class_id, row.id]));

  const guardianRows: SqlValue[][] = [];
  for (let index = 0; index < 100; index += 1) {
    guardianRows.push([
      seedUuid(`school:${clientKey}:guardian:${index + 1}`),
      c,
      'school',
      adminId,
      adminId,
      personName(index + 60),
      index % 2 === 0 ? 'Father' : 'Mother',
      `0303${pad(int(rng, 1000000, 9999999), 7)}`,
      `guardian${index + 1}@example.test`,
      null,
      'Karachi',
    ]);
  }
  await insertRows(
    client,
    'guardians',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'name',
      'relation',
      'phone',
      'email',
      'cnic',
      'address',
    ],
    guardianRows,
  );

  const studentRows: SqlValue[][] = [];
  const studentGuardianRows: SqlValue[][] = [];
  const enrollmentRows: SqlValue[][] = [];
  for (let index = 0; index < 300; index += 1) {
    const studentId = seedUuid(`school:${clientKey}:student:${index + 1}`);
    const classEntry = requireValue(classes[index % classes.length], 'Missing class');
    const guardianId = seedUuid(`school:${clientKey}:guardian:${(index % 100) + 1}`);
    const sectionId = sections.get(classEntry.id) ?? null;
    studentRows.push([
      studentId,
      c,
      'school',
      adminId,
      adminId,
      `ADM-${pad(index + 1, 4)}`,
      personName(index + 100),
      requireValue(LAST_NAMES[index % LAST_NAMES.length], 'Missing last name'),
      `${2012 + (index % 8)}-0${1 + (index % 9)}-1${index % 9}`,
      index % 3 === 0 ? 'male' : 'female',
      guardianId,
      classEntry.id,
      sectionId,
      'active',
      monthDate(11 - (index % 12), 6),
    ]);
    studentGuardianRows.push([
      seedUuid(`school:${clientKey}:student-guardian:${index + 1}`),
      c,
      'school',
      adminId,
      adminId,
      studentId,
      guardianId,
      true,
    ]);
    enrollmentRows.push([
      seedUuid(`school:${clientKey}:enrollment:${index + 1}`),
      c,
      'school',
      adminId,
      adminId,
      studentId,
      classEntry.id,
      sectionId,
      '2025-2026',
      'active',
    ]);
  }
  await insertRows(
    client,
    'students',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'admission_no',
      'first_name',
      'last_name',
      'dob',
      'gender',
      'guardian_id',
      'class_id',
      'section_id',
      'status',
      'admitted_on',
    ],
    studentRows,
  );
  await insertRows(
    client,
    'student_guardians',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'student_id',
      'guardian_id',
      'is_primary',
    ],
    studentGuardianRows,
  );
  await insertRows(
    client,
    'enrollments',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'student_id',
      'class_id',
      'section_id',
      'academic_year',
      'status',
    ],
    enrollmentRows,
  );

  const staffRows: SqlValue[][] = [];
  for (let index = 0; index < 40; index += 1) {
    staffRows.push([
      seedUuid(`school:${clientKey}:staff:${index + 1}`),
      c,
      'school',
      adminId,
      adminId,
      `STF-${pad(index + 1, 4)}`,
      personName(index + 200),
      index % 6 === 0 ? 'Principal' : index % 3 === 0 ? 'Teacher' : 'Operations',
      index % 2 === 0 ? 'Academics' : 'Administration',
      `0304${pad(int(rng, 1000000, 9999999), 7)}`,
      `staff${index + 1}@example.test`,
      'active',
    ]);
  }
  await insertRows(
    client,
    'staff',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'employee_no',
      'name',
      'role',
      'department',
      'phone',
      'email',
      'status',
    ],
    staffRows,
  );

  const feeInvoiceRows: SqlValue[][] = [];
  const feePaymentRows: SqlValue[][] = [];
  for (let month = 0; month < 12; month += 1) {
    const dueDate = monthDate(month, 8);
    const paidDate = monthDate(month, 5);
    const period = dueDate.slice(0, 7);
    for (let index = 0; index < 30; index += 1) {
      const studentNumber = (month * 30 + index) % 300 + 1;
      const number = `FEE-${month + 1}-${pad(index + 1, 3)}`;
      const invoiceId = seedUuid(`school:${clientKey}:fee-invoice:${number}`);
      const total = 5000 + (studentNumber % 3) * 1500;
      feeInvoiceRows.push([
        invoiceId,
        c,
        'school',
        adminId,
        adminId,
        number,
        seedUuid(`school:${clientKey}:student:${studentNumber}`),
        period,
        dueDate,
        money(total),
        '0.00',
        money(total),
        money(total),
        '0.00',
        'paid',
      ]);
      feePaymentRows.push([
        seedUuid(`school:${clientKey}:fee-payment:${number}`),
        c,
        'school',
        adminId,
        adminId,
        invoiceId,
        seedUuid(`school:${clientKey}:student:${studentNumber}`),
        paidDate,
        money(total),
        index % 3 === 0 ? 'bank' : 'cash',
        `FEEPAY-${number}`,
        adminId,
        'completed',
      ]);
    }
  }
  await insertRows(
    client,
    'fee_invoices',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'number',
      'student_id',
      'period',
      'due_date',
      'subtotal',
      'discount',
      'total',
      'paid',
      'balance',
      'status',
    ],
    feeInvoiceRows,
  );
  await insertRows(
    client,
    'fee_payments',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'invoice_id',
      'student_id',
      'date',
      'amount',
      'method',
      'reference',
      'received_by',
      'status',
    ],
    feePaymentRows,
  );
}

async function seedHr(client: PoolClient, clientKey: string, adminId: string): Promise<void> {
  const c = clientId(clientKey);
  const rng = makeRng(seedNumber(`hr:${clientKey}`));
  const departmentResult = await client.query<{ id: string; code: string }>(
    `SELECT id::text, code
       FROM departments
      WHERE client_id = $1
        AND module_key = 'hr'
      ORDER BY code`,
    [c],
  );
  const departments = departmentResult.rows.map((row) => row.id);
  const location = await tenantOne<{ id: string }>(
    client,
    `SELECT id::text
       FROM locations
      WHERE client_id = $1
        AND module_key = 'hr'
        AND name = 'Head Office'`,
    [c],
  );
  const leaveTypeResult = await client.query<{ id: string; code: string }>(
    `SELECT id::text, code
       FROM leave_types
      WHERE client_id = $1
        AND module_key = 'hr'
      ORDER BY code`,
    [c],
  );
  const leaveTypes = leaveTypeResult.rows.map((row) => row.id);

  const employeeRows: SqlValue[][] = [];
  for (let index = 0; index < 48; index += 1) {
    employeeRows.push([
      seedUuid(`hr:${clientKey}:employee:${index + 1}`),
      c,
      'hr',
      adminId,
      adminId,
      `EMP-${pad(index + 1, 4)}`,
      personName(index + 300),
      requireValue(LAST_NAMES[(index + 3) % LAST_NAMES.length], 'Missing last name'),
      `employee${index + 1}@northwindstudios.com`,
      `0305${pad(int(rng, 1000000, 9999999), 7)}`,
      `${1985 + (index % 20)}-0${1 + (index % 9)}-1${index % 9}`,
      index % 3 === 0 ? 'male' : 'female',
      'Karachi',
      requireValue(departments[index % departments.length], 'Missing department'),
      index % 4 === 0 ? 'Engineering' : index % 4 === 1 ? 'Sales' : 'Operations',
      index === 0 ? null : seedUuid(`hr:${clientKey}:employee:1`),
      location.id,
      index % 7 === 0 ? 'contract' : 'full_time',
      index % 13 === 0 ? 'probation' : 'active',
      monthDate(24 - (index % 20), 1),
      null,
      money(85000 + (index % 12) * 12500),
      '{}',
    ]);
  }
  await insertRows(
    client,
    'employees',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'employee_no',
      'first_name',
      'last_name',
      'email',
      'phone',
      'dob',
      'gender',
      'address',
      'department_id',
      'title',
      'manager_id',
      'location_id',
      'employment_type',
      'status',
      'hire_date',
      'exit_date',
      'salary_base',
      'emergency_contact',
    ],
    employeeRows,
  );

  const salaryStructureRows: SqlValue[][] = [];
  const attendanceRows: SqlValue[][] = [];
  const anchor = `${SEED_YEAR}-${pad(SEED_MONTH + 1, 2)}-${pad(SEED_DAY, 2)}`;
  for (let index = 0; index < 48; index += 1) {
    const employeeId = seedUuid(`hr:${clientKey}:employee:${index + 1}`);
    salaryStructureRows.push([
      seedUuid(`hr:${clientKey}:salary:${index + 1}`),
      c,
      'hr',
      adminId,
      adminId,
      employeeId,
      money(85000 + (index % 12) * 12500),
      JSON.stringify([{ name: 'Housing', amount: 12000 }]),
      JSON.stringify([{ name: 'Provident Fund', amount: 4000 }]),
      'PKR',
      '2025-01-01',
    ]);
    for (let day = 0; day < 30; day += 1) {
      const date = addDays(anchor, -(29 - day));
      const status = (index + day) % 19 === 0 ? 'absent' : (index + day) % 11 === 0 ? 'late' : 'present';
      const clockInHour = status === 'late' ? 10 : 9;
      const hours = status === 'absent' ? 0 : status === 'late' ? 7.5 : 8;
      attendanceRows.push([
        seedUuid(`hr:${clientKey}:attendance:${index + 1}:${date}`),
        c,
        'hr',
        adminId,
        adminId,
        employeeId,
        date,
        status === 'absent' ? null : `${date}T0${clockInHour}:05:00Z`,
        status === 'absent' ? null : `${date}T17:${status === 'late' ? '35' : '05'}:00Z`,
        quantity(hours),
        status,
        'seed',
        null,
      ]);
    }
  }
  await insertRows(
    client,
    'salary_structures',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'employee_id',
      'base',
      'allowances',
      'deductions',
      'currency',
      'effective_from',
    ],
    salaryStructureRows,
  );
  await insertRows(
    client,
    'attendance',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'employee_id',
      'date',
      'clock_in',
      'clock_out',
      'hours',
      'status',
      'source',
      'notes',
    ],
    attendanceRows,
  );

  const leaveRequestRows: SqlValue[][] = [];
  for (let index = 0; index < 20; index += 1) {
    const startDate = addDays(anchor, -25 + index);
    const endDate = addDays(startDate, 1 + (index % 4));
    const status = index % 5 === 0 ? 'pending' : index % 7 === 0 ? 'rejected' : 'approved';
    leaveRequestRows.push([
      seedUuid(`hr:${clientKey}:leave-request:${index + 1}`),
      c,
      'hr',
      adminId,
      adminId,
      seedUuid(`hr:${clientKey}:employee:${(index % 48) + 1}`),
      requireValue(leaveTypes[index % leaveTypes.length], 'Missing leave type'),
      startDate,
      endDate,
      quantity(1 + (index % 4)),
      index % 2 === 0 ? 'Annual leave' : 'Personal leave',
      status,
      seedUuid(`hr:${clientKey}:employee:1`),
      status === 'pending' ? null : `${endDate}T09:00:00Z`,
      status === 'rejected' ? 'Coverage unavailable' : null,
    ]);
  }
  await insertRows(
    client,
    'leave_requests',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'employee_id',
      'leave_type_id',
      'start_date',
      'end_date',
      'days',
      'reason',
      'status',
      'approver_id',
      'decided_at',
      'comment',
    ],
    leaveRequestRows,
  );

  const payRunRows: SqlValue[][] = [];
  const payslipRows: SqlValue[][] = [];
  for (let month = 0; month < 3; month += 1) {
    const monthsAgo = 2 - month;
    const periodStart = monthStart(monthsAgo).toISOString().slice(0, 10);
    const periodEnd = monthEnd(monthsAgo);
    const label = monthStart(monthsAgo).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const payRunId = seedUuid(`hr:${clientKey}:pay-run:${month + 1}`);
    let grossTotal = 0;
    let netTotal = 0;
    for (let index = 0; index < 48; index += 1) {
      const base = 85000 + (index % 12) * 12500;
      const allowances = 12000 + (index % 4) * 2500;
      const deductions = 4000 + (index % 3) * 1000;
      const gross = base + allowances;
      const net = gross - deductions;
      grossTotal += gross;
      netTotal += net;
      payslipRows.push([
        seedUuid(`hr:${clientKey}:payslip:${month + 1}:${index + 1}`),
        c,
        'hr',
        adminId,
        adminId,
        payRunId,
        seedUuid(`hr:${clientKey}:employee:${index + 1}`),
        money(base),
        money(allowances),
        money(deductions),
        money(gross),
        money(net),
        'PKR',
        index % 3 === 0 ? 'bank' : 'cash',
        'paid',
      ]);
    }
    payRunRows.push([
      payRunId,
      c,
      'hr',
      adminId,
      adminId,
      label,
      periodStart,
      periodEnd,
      periodEnd,
      'paid',
      JSON.stringify({ employees: 48, gross: money(grossTotal), net: money(netTotal) }),
      seedUuid(`hr:${clientKey}:employee:1`),
    ]);
  }
  await insertRows(
    client,
    'pay_runs',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'period_label',
      'period_start',
      'period_end',
      'pay_date',
      'status',
      'totals',
      'approved_by',
    ],
    payRunRows,
  );
  await insertRows(
    client,
    'payslips',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'pay_run_id',
      'employee_id',
      'base',
      'allowances',
      'deductions',
      'gross',
      'net',
      'currency',
      'payment_method',
      'status',
    ],
    payslipRows,
  );
}

async function seedAccounts(
  client: PoolClient,
  clientKey: string,
  adminId: string,
): Promise<void> {
  const c = clientId(clientKey);
  const rng = makeRng(seedNumber(`accounts:${clientKey}`));
  const codes = ['1010', '1020', '1100', '2010', '4010', '5010', '5020', '5030'];
  const accountResult = await client.query<{ id: string; code: string }>(
    `SELECT id::text, code
       FROM chart_of_accounts
      WHERE client_id = $1
        AND module_key = 'accounts'
        AND code = ANY($2::text[])`,
    [c, codes],
  );
  const accounts = new Map(accountResult.rows.map((row) => [row.code, row.id]));
  const fiscal = await tenantOne<{ id: string }>(
    client,
    `SELECT id::text
       FROM fiscal_periods
      WHERE client_id = $1
        AND module_key = 'accounts'
      ORDER BY starts_on
      LIMIT 1`,
    [c],
  );
  const bank = await tenantOne<{ id: string }>(
    client,
    `SELECT id::text
       FROM bank_accounts
      WHERE client_id = $1
        AND module_key = 'accounts'
        AND account_number = '0001'`,
    [c],
  );
  void bank;

  const journalRows: SqlValue[][] = [];
  const journalLineRows: SqlValue[][] = [];
  for (let index = 0; index < 100; index += 1) {
    const number = `JV-${pad(index + 1, 5)}`;
    const date = monthDate(11 - Math.floor(index / 9), 2 + (index % 9) * 3);
    const amount = Number(money(int(rng, 5000, 250000)));
    const journalId = seedUuid(`accounts:${clientKey}:journal:${number}`);
    const debitCode = index % 3 === 0 ? '5010' : index % 3 === 1 ? '5020' : '1010';
    const creditCode = index % 4 === 0 ? '2010' : '4010';
    const debitAccount = requireValue(accounts.get(debitCode), `Missing account ${debitCode}`);
    const creditAccount = requireValue(accounts.get(creditCode), `Missing account ${creditCode}`);
    journalRows.push([
      journalId,
      c,
      'accounts',
      adminId,
      adminId,
      number,
      date,
      fiscal.id,
      index % 2 === 0 ? 'Monthly sales entry' : 'Monthly expense entry',
      'seed',
      'posted',
      adminId,
      `${date}T10:00:00Z`,
    ]);
    journalLineRows.push([
      seedUuid(`accounts:${clientKey}:journal-line:${number}:1`),
      c,
      'accounts',
      adminId,
      adminId,
      journalId,
      debitAccount,
      money(amount),
      '0.00',
      'Demo debit line',
    ]);
    journalLineRows.push([
      seedUuid(`accounts:${clientKey}:journal-line:${number}:2`),
      c,
      'accounts',
      adminId,
      adminId,
      journalId,
      creditAccount,
      '0.00',
      money(amount),
      'Demo credit line',
    ]);
  }
  await insertRows(
    client,
    'journal_entries',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'number',
      'date',
      'period_id',
      'memo',
      'source',
      'status',
      'posted_by',
      'posted_at',
    ],
    journalRows,
  );
  await insertRows(
    client,
    'journal_lines',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'journal_entry_id',
      'account_id',
      'debit',
      'credit',
      'description',
    ],
    journalLineRows,
  );

  const arRows: SqlValue[][] = [];
  for (let index = 0; index < 30; index += 1) {
    const original = int(rng, 15000, 450000);
    const paid = index % 4 === 0 ? original : Math.round(original * (0.2 + rng() * 0.5));
    const date = monthDate(11 - (index % 12), 4 + (index % 10));
    const dueDate = addDays(date, 30 + (index % 4) * 30);
    arRows.push([
      seedUuid(`accounts:${clientKey}:ar:${index + 1}`),
      c,
      'accounts',
      adminId,
      adminId,
      `CUST-${pad((index % 40) + 1, 4)}`,
      `INV-${pad(index + 1, 5)}`,
      date,
      dueDate,
      money(original),
      money(paid),
      money(original - paid),
      paid === original ? 'paid' : index % 3 === 0 ? '61-90' : index % 3 === 1 ? '31-60' : '0-30',
    ]);
  }
  await insertRows(
    client,
    'ar_open_items',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'customer_ref',
      'invoice_ref',
      'date',
      'due_date',
      'original',
      'paid',
      'balance',
      'bucket',
    ],
    arRows,
  );

  const apRows: SqlValue[][] = [];
  for (let index = 0; index < 20; index += 1) {
    const original = int(rng, 10000, 300000);
    const paid = index % 5 === 0 ? original : Math.round(original * (0.15 + rng() * 0.45));
    const date = monthDate(11 - (index % 12), 6 + (index % 10));
    const dueDate = addDays(date, 30 + (index % 3) * 30);
    apRows.push([
      seedUuid(`accounts:${clientKey}:ap:${index + 1}`),
      c,
      'accounts',
      adminId,
      adminId,
      `VEND-${pad((index % 15) + 1, 4)}`,
      `BILL-${pad(index + 1, 5)}`,
      date,
      dueDate,
      money(original),
      money(paid),
      money(original - paid),
      paid === original ? 'paid' : index % 2 === 0 ? '31-60' : '0-30',
    ]);
  }
  await insertRows(
    client,
    'ap_open_items',
    [
      'id',
      'client_id',
      'module_key',
      'created_by',
      'updated_by',
      'vendor_ref',
      'bill_ref',
      'date',
      'due_date',
      'original',
      'paid',
      'balance',
      'bucket',
    ],
    apRows,
  );
}

async function seedModuleUsers(
  client: PoolClient,
  input: {
    clientDbId: string;
    moduleKey: TenantModuleKey;
    users: readonly { userId: string; email: string; displayName: string; roleLabel: string }[];
  },
): Promise<void> {
  await insertRows(
    client,
    'module_users',
    ['id', 'client_id', 'module_key', 'created_by', 'user_id', 'display_name', 'email', 'role_label', 'status'],
    input.users.map((user) => [
      seedUuid(`module-user:${input.clientDbId}:${input.moduleKey}:${user.userId}`),
      input.clientDbId,
      input.moduleKey,
      user.userId,
      user.userId,
      user.displayName,
      user.email,
      user.roleLabel,
      'active',
    ]),
  );
  await insertRows(
    client,
    'module_settings',
    ['id', 'client_id', 'module_key', 'created_by', 'settings'],
    [
      [
        seedUuid(`module-settings:${input.clientDbId}:${input.moduleKey}`),
        input.clientDbId,
        input.moduleKey,
        input.users[0]?.userId ?? null,
        JSON.stringify({ seeded: true, ownerEmail: OWNER_EMAIL, seedVersion: 1 }),
      ],
    ],
  );
}

async function verifySeed(
  platformDb: PlatformDb,
  registry: TenantPoolRegistry,
  ids: {
    ownerId: string;
    viewerUserId: string;
    meridianDbId: string;
  },
): Promise<void> {
  const owner = await platformOne<{ must_change_password: boolean; mfa_enabled: boolean }>(
    platformDb,
    `SELECT must_change_password, mfa_enabled
       FROM platform_users
      WHERE id = $1`,
    [ids.ownerId],
  );
  if (!owner.must_change_password || owner.mfa_enabled) {
    throw new Error('Seed owner is not configured for password change and MFA enrollment.');
  }

  const counts = await platformOne<{
    plans: number;
    clients: number;
    modules: number;
    users: number;
  }>(
    platformDb,
    `SELECT
       (SELECT count(*)::int FROM plans WHERE key = ANY($1::text[])) AS plans,
       (SELECT count(*)::int FROM clients WHERE slug = ANY($2::text[])) AS clients,
       (SELECT count(*)::int FROM client_modules WHERE status = 'active') AS modules,
       (SELECT count(*)::int FROM users WHERE id = ANY($3::uuid[])) AS users`,
    [
      PLANS.map((plan) => plan.key),
      CLIENTS.map((client) => client.slug),
      USERS.filter((user) => user.key !== 'owner').map((user) => userId(user.key)),
    ],
  );
  if (counts.plans !== 3 || counts.clients !== 3 || counts.modules !== 5 || counts.users !== 8) {
    throw new Error(`Platform seed verification failed: ${JSON.stringify(counts)}`);
  }

  const viewer = await resolveMembershipPermissions(platformDb, {
    userId: ids.viewerUserId,
    clientId: ids.meridianDbId,
    moduleKey: 'retail' as ModuleKey,
  });
  const granted = [...viewer.permissions];
  if (granted.length !== 1 || granted[0] !== 'retail.products.view') {
    throw new Error(`Products viewer permissions are incorrect: ${granted.join(', ')}`);
  }
  const forbidden: PermissionKey[] = [
    'retail.invoices.view' as PermissionKey,
    'retail.banks.view' as PermissionKey,
  ];
  if (forbidden.some((permission) => viewer.permissions.has(permission))) {
    throw new Error('Products viewer received forbidden retail permissions.');
  }

  const expectedCounts: {
    clientKey: string;
    moduleKey: TenantModuleKey;
    checks: readonly { sql: string; expected: number | string }[];
  }[] = [
    {
      clientKey: 'northwind',
      moduleKey: 'retail',
      checks: [
        { sql: 'SELECT count(*)::int AS value FROM products WHERE deleted_at IS NULL', expected: 60 },
        { sql: 'SELECT count(*)::int AS value FROM customers WHERE deleted_at IS NULL', expected: 40 },
        { sql: 'SELECT count(*)::int AS value FROM vendors WHERE deleted_at IS NULL', expected: 15 },
        { sql: 'SELECT count(*)::int AS value FROM warehouses WHERE deleted_at IS NULL', expected: 3 },
        { sql: 'SELECT count(*)::int AS value FROM invoices WHERE deleted_at IS NULL', expected: 120 },
        { sql: 'SELECT count(*)::int AS value FROM purchases WHERE deleted_at IS NULL', expected: 25 },
        { sql: 'SELECT count(*)::int AS value FROM refunds WHERE deleted_at IS NULL', expected: 12 },
        { sql: 'SELECT count(*)::int AS value FROM banks WHERE deleted_at IS NULL', expected: 6 },
        { sql: 'SELECT count(*)::int AS value FROM salesmen WHERE deleted_at IS NULL', expected: 8 },
        { sql: 'SELECT count(*)::int AS value FROM expenses WHERE deleted_at IS NULL', expected: 40 },
        {
          sql: `SELECT count(DISTINCT date_trunc('month', date))::int AS value
                  FROM invoices
                 WHERE deleted_at IS NULL`,
          expected: 12,
        },
      ],
    },
    {
      clientKey: 'beacon',
      moduleKey: 'school',
      checks: [
        { sql: 'SELECT count(*)::int AS value FROM students WHERE deleted_at IS NULL', expected: 300 },
        { sql: 'SELECT count(*)::int AS value FROM classes WHERE deleted_at IS NULL', expected: 18 },
        { sql: 'SELECT count(*)::int AS value FROM staff WHERE deleted_at IS NULL', expected: 40 },
        { sql: 'SELECT count(*)::int AS value FROM fee_payments WHERE deleted_at IS NULL', expected: 360 },
        {
          sql: `SELECT count(DISTINCT date_trunc('month', date))::int AS value
                  FROM fee_payments
                 WHERE deleted_at IS NULL`,
          expected: 12,
        },
      ],
    },
    {
      clientKey: 'northwind',
      moduleKey: 'hr',
      checks: [
        { sql: 'SELECT count(*)::int AS value FROM employees WHERE deleted_at IS NULL', expected: 48 },
        { sql: 'SELECT count(*)::int AS value FROM attendance WHERE deleted_at IS NULL', expected: 1440 },
        { sql: 'SELECT count(*)::int AS value FROM leave_requests WHERE deleted_at IS NULL', expected: 20 },
        { sql: 'SELECT count(*)::int AS value FROM pay_runs WHERE deleted_at IS NULL', expected: 3 },
      ],
    },
    {
      clientKey: 'meridian',
      moduleKey: 'accounts',
      checks: [
        { sql: 'SELECT count(*)::int AS value FROM journal_entries WHERE deleted_at IS NULL', expected: 100 },
        { sql: 'SELECT count(*)::int AS value FROM ar_open_items WHERE deleted_at IS NULL', expected: 30 },
        { sql: 'SELECT count(*)::int AS value FROM ap_open_items WHERE deleted_at IS NULL', expected: 20 },
      ],
    },
    {
      clientKey: 'meridian',
      moduleKey: 'retail',
      checks: [
        { sql: 'SELECT count(*)::int AS value FROM products WHERE deleted_at IS NULL', expected: 60 },
        { sql: 'SELECT count(*)::int AS value FROM invoices WHERE deleted_at IS NULL', expected: 120 },
      ],
    },
  ];

  for (const target of expectedCounts) {
    const pool = await registry.getPool(clientId(target.clientKey), target.moduleKey);
    await withTenantTx(
      pool,
      { clientId: clientId(target.clientKey), moduleKey: target.moduleKey },
      async (tenantClient) => {
        for (const check of target.checks) {
          const result = await tenantClient.query<{ value: number }>(check.sql);
          const value = Number(result.rows[0]?.value ?? -1);
          if (value !== check.expected) {
            throw new Error(
              `${target.clientKey}/${target.moduleKey} verification failed: ${check.sql} returned ${value}, expected ${check.expected}`,
            );
          }
        }
      },
    );
  }
}

async function main(): Promise<void> {
  if (config.nodeEnv === 'production') {
    throw new Error('Demo seeding is not allowed in production.');
  }
  if (!config.provisioningDatabaseUrl) {
    throw new Error('PROVISIONING_DATABASE_URL must be configured for demo seeding.');
  }

  const platformDb = new PlatformDb({
    connectionString: config.platformDatabaseUrl,
    max: config.platformPoolMax,
    connectionTimeoutMillis: config.platformConnectionTimeoutMs,
  });
  const kms = new LocalKmsProvider(config.kmsLocalKey);
  const registry = new TenantPoolRegistry({
    platformDb,
    kms,
    maxPerTenant: config.tenantPoolMax,
    globalMax: config.tenantPoolGlobalMax,
    idleMs: config.tenantPoolIdleMs,
    cacheTtlMs: config.tenantRegistryCacheTtlMs,
    connectionTimeoutMs: config.tenantConnectionTimeoutMs,
    defaultStatementTimeoutMs: config.tenantStatementTimeoutMs,
  });
  const adapter = createProvisioningAdapter(kms, createPgDumpSnapshotter(kms));
  const userIds = new Map<string, string>();
  const clientDbIds = new Map<string, string>();

  try {
    await platformDb.ping();
    const ownerId = await ensurePlatformOwner(platformDb);
    for (const user of USERS) {
      if (user.key !== 'owner') {
        userIds.set(user.key, await ensureTenantUser(platformDb, user));
      }
    }
    const plans = await ensurePlans(platformDb, ownerId);
    for (const clientSeed of CLIENTS) {
      clientDbIds.set(clientSeed.key, await ensureClient(platformDb, clientSeed, plans, ownerId));
    }

    for (const clientSeed of CLIENTS) {
      const clientDbId = requireValue(clientDbIds.get(clientSeed.key), 'Missing client ID.');
      const adminUserId = requireValue(userIds.get(clientSeed.adminKey), 'Missing client admin ID.');
      for (const moduleKey of clientSeed.modules) {
        await processProvisioning(platformDb, adapter, ownerId, {
          clientKey: clientSeed.key,
          clientDbId,
          moduleKey,
          adminUserId,
        });
      }
    }

    const adminMemberships = new Map<string, string>();
    for (const clientSeed of CLIENTS) {
      const clientDbId = requireValue(clientDbIds.get(clientSeed.key), 'Missing client ID.');
      for (const moduleKey of clientSeed.modules) {
        const adminUserId = requireValue(userIds.get(clientSeed.adminKey), 'Missing client admin ID.');
        const membershipId = await ensureMembership(platformDb, {
          userId: adminUserId,
          clientDbId,
          moduleKey,
          role: 'client_admin',
          createdByMembershipId: null,
          grants: permissionsForPreset('client_admin', clientSeed.modules),
          grantedBy: ownerId,
        });
        adminMemberships.set(`${clientSeed.key}:${moduleKey}`, membershipId);
      }
    }

    const moduleUserMap = new Map<string, { userId: string; email: string; displayName: string; roleLabel: string }[]>();
    for (const clientSeed of CLIENTS) {
      const clientDbId = requireValue(clientDbIds.get(clientSeed.key), 'Missing client ID.');
      for (const moduleKey of clientSeed.modules) {
        const admin = requireValue(
          USERS.find((user) => user.key === clientSeed.adminKey),
          'Missing admin user seed.',
        );
        const users = [
          {
            userId: requireValue(userIds.get(clientSeed.adminKey), 'Missing client admin ID.'),
            email: admin.email,
            displayName: admin.fullName,
            roleLabel: admin.roleLabel,
          },
        ];
        moduleUserMap.set(`${clientSeed.key}:${moduleKey}`, users);
      }
    }

    for (const clientSeed of CLIENTS) {
      const clientDbId = requireValue(clientDbIds.get(clientSeed.key), 'Missing client ID.');
      for (const subAdmin of clientSeed.subAdmins) {
        const subAdminUser = requireValue(
          USERS.find((user) => user.key === subAdmin.userKey),
          'Missing sub-admin user seed.',
        );
        const parentMembershipId = requireValue(
          adminMemberships.get(`${clientSeed.key}:${subAdmin.moduleKey}`),
          'Missing parent admin membership.',
        );
        const grants = subAdmin.grants
          ? [...subAdmin.grants]
          : permissionsForPreset('manager', [subAdmin.moduleKey]);
        await ensureMembership(platformDb, {
          userId: requireValue(userIds.get(subAdmin.userKey), 'Missing sub-admin ID.'),
          clientDbId,
          moduleKey: subAdmin.moduleKey,
          role: subAdmin.role,
          createdByMembershipId: parentMembershipId,
          grants,
          grantedBy: ownerId,
        });
        const users = requireValue(
          moduleUserMap.get(`${clientSeed.key}:${subAdmin.moduleKey}`),
          'Missing module user list.',
        );
        users.push({
          userId: requireValue(userIds.get(subAdmin.userKey), 'Missing sub-admin ID.'),
          email: subAdminUser.email,
          displayName: subAdminUser.fullName,
          roleLabel: subAdmin.roleLabel,
        });
      }
    }

    for (const clientSeed of CLIENTS) {
      const clientDbId = requireValue(clientDbIds.get(clientSeed.key), 'Missing client ID.');
      for (const moduleKey of clientSeed.modules) {
        const adminId = requireValue(userIds.get(clientSeed.adminKey), 'Missing client admin ID.');
        const pool = await registry.getPool(clientDbId, moduleKey);
        const users = requireValue(
          moduleUserMap.get(`${clientSeed.key}:${moduleKey}`),
          'Missing module user list.',
        );
        await withTenantTx(pool, { clientId: clientDbId, moduleKey }, async (tenantClient) => {
          await seedModuleUsers(tenantClient, {
            clientDbId,
            moduleKey,
            users,
          });
          if (moduleKey === 'retail') {
            await seedRetail(tenantClient, clientSeed.key, adminId);
          } else if (moduleKey === 'school') {
            await seedSchool(tenantClient, clientSeed.key, adminId);
          } else if (moduleKey === 'hr') {
            await seedHr(tenantClient, clientSeed.key, adminId);
          } else if (moduleKey === 'accounts') {
            await seedAccounts(tenantClient, clientSeed.key, adminId);
          }
        });
      }
    }

    await verifySeed(platformDb, registry, {
      ownerId,
      viewerUserId: requireValue(userIds.get('meridian-products-viewer'), 'Missing viewer ID.'),
      meridianDbId: requireValue(clientDbIds.get('meridian'), 'Missing Meridian ID.'),
    });

    console.log('Demo seed complete: 3 clients, 5 modules, 1 platform owner, 3 plans.');
  } finally {
    await registry.closeAll();
    await platformDb.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown demo seed failure.';
  const detail = error instanceof Error ? error.stack ?? message : message;
  console.error(`db:seed failed: ${message}\n${detail}`);
  process.exitCode = 1;
});

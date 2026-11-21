import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { config } from '../src/config';
import { PlatformDb } from '../src/db/platform';
import { AppError } from '../src/http/errors';
import {
  requestDeprovisioning,
  requestProvisioning,
  retryProvisioningJob,
  runDeprovisioningJob,
  runProvisioningJob,
  type ProvisioningAdapter,
} from '../src/provisioning/service';
import { tenantDatabaseName } from '../src/provisioning/database';

const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
const email = `provision-${suffix}@example.test`;
let platformDb: PlatformDb;
let planId: string;
let clientId: string;
let userId: string;

const createdDatabases: string[] = [];

const fakeAdapter = (overrides: Partial<ProvisioningAdapter> = {}): ProvisioningAdapter => ({
  async provisionTenant({ clientId: targetClientId, moduleKey }) {
    const dbName = tenantDatabaseName(targetClientId, moduleKey);
    createdDatabases.push(dbName);
    return {
      dbName,
      appRole: `fake_${suffix}_${moduleKey}`,
      secretRef: 'encrypted-test-secret',
      schemaVersion: '1.0.0',
    };
  },
  async snapshotTenant() {},
  async dropTenant() {},
  ...overrides,
});

before(async () => {
  platformDb = new PlatformDb({
    connectionString: config.platformDatabaseUrl,
    max: 4,
    connectionTimeoutMillis: 5000,
  });
  await platformDb.ping();

  const plan = await platformDb.query<{ id: string }>(
    `INSERT INTO plans (key, name, max_users, max_modules)
     VALUES ($1, 'Provisioning test plan', 10, 4)
     RETURNING id::text`,
    [`provision-${suffix}`],
  );
  planId = plan.rows[0]!.id;

  const client = await platformDb.query<{ id: string }>(
    `INSERT INTO clients (name, slug, status, plan_id)
     VALUES ($1, $2, 'active', $3)
     RETURNING id::text`,
    [`Provisioning ${suffix}`, `provision-${suffix}`, planId],
  );
  clientId = client.rows[0]!.id;

  const user = await platformDb.query<{ id: string }>(
    `INSERT INTO users (email, full_name, status)
     VALUES ($1, 'Provisioning Admin', 'invited')
     RETURNING id::text`,
    [email],
  );
  userId = user.rows[0]!.id;
});

after(async () => {
  if (clientId) {
    await platformDb.query('DELETE FROM clients WHERE id = $1', [clientId]);
  }
  if (userId) {
    await platformDb.query('DELETE FROM users WHERE id = $1', [userId]);
  }
  if (planId) {
    await platformDb.query('DELETE FROM plans WHERE id = $1', [planId]);
  }
  await platformDb.end();
});

test('provision requests are idempotent and failed runs never activate a module', async () => {
  const first = await requestProvisioning(platformDb, {
    clientId,
    moduleKey: 'retail',
    adminUserId: userId,
  });
  const duplicate = await requestProvisioning(platformDb, {
    clientId,
    moduleKey: 'retail',
    adminUserId: userId,
  });

  assert.equal(first.status, 'queued');
  assert.ok(first.jobId);
  assert.deepEqual(duplicate, first);

  const failureAdapter = fakeAdapter({
    async provisionTenant() {
      throw new Error('database password should never reach the job record');
    },
  });
  await assert.rejects(
    () => runProvisioningJob(platformDb, first.jobId!, failureAdapter),
    (error: unknown) => error instanceof AppError && error.code === 'INTERNAL',
  );

  const failed = await platformDb.query<{
    status: string;
    attempts: number;
    last_error: string;
  }>(
    `SELECT status, attempts, last_error
       FROM provisioning_jobs
      WHERE id = $1`,
    [first.jobId],
  );
  assert.equal(failed.rows[0]?.status, 'failed');
  assert.equal(failed.rows[0]?.attempts, 1);
  assert.equal(failed.rows[0]?.last_error, 'PROVISIONING_FAILED');
  assert.doesNotMatch(failed.rows[0]!.last_error, /password/i);

  const moduleAfterFailure = await platformDb.query<{ status: string }>(
    `SELECT status
       FROM client_modules
      WHERE client_id = $1
        AND module_key = 'retail'`,
    [clientId],
  );
  assert.equal(moduleAfterFailure.rows[0]?.status, 'provisioning');
  const registryAfterFailure = await platformDb.query(
    'SELECT 1 FROM db_registry WHERE client_id = $1 AND module_key = $2',
    [clientId, 'retail'],
  );
  assert.equal(registryAfterFailure.rowCount, 0);

  await platformDb.query(
    `UPDATE provisioning_jobs
        SET next_attempt_at = now() - interval '1 second'
      WHERE id = $1`,
    [first.jobId],
  );
  assert.equal(await retryProvisioningJob(platformDb, first.jobId!), true);
  assert.equal(await runProvisioningJob(platformDb, first.jobId!, fakeAdapter()), true);

  const provisioned = await platformDb.query<{
    status: string;
    db_secret_ref: string;
  }>(
    `SELECT status, db_secret_ref
       FROM client_modules
      WHERE client_id = $1
        AND module_key = 'retail'`,
    [clientId],
  );
  assert.equal(provisioned.rows[0]?.status, 'active');
  assert.equal(provisioned.rows[0]?.db_secret_ref, 'encrypted-test-secret');

  const grants = await platformDb.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM memberships m
       JOIN role_grants grants ON grants.membership_id = m.id
      WHERE m.client_id = $1
        AND m.user_id = $2
        AND m.module_key = 'retail'
        AND m.role = 'client_admin'`,
    [clientId, userId],
  );
  assert.ok((grants.rows[0]?.count ?? 0) > 0);

  const repeatedAfterSuccess = await requestProvisioning(platformDb, {
    clientId,
    moduleKey: 'retail',
    adminUserId: userId,
  });
  assert.equal(repeatedAfterSuccess.status, 'active');
  assert.equal(repeatedAfterSuccess.jobId, first.jobId);
  assert.equal(createdDatabases.length, 1);
});

test('deprovisioning revokes access first, requires a snapshot, then drops and archives', async () => {
  const queued = await requestDeprovisioning(platformDb, {
    clientId,
    moduleKey: 'retail',
  });
  assert.equal(queued.status, 'queued');
  assert.ok(queued.jobId);

  const disabled = await platformDb.query<{ status: string }>(
    `SELECT status
       FROM client_modules
      WHERE client_id = $1
        AND module_key = 'retail'`,
    [clientId],
  );
  assert.equal(disabled.rows[0]?.status, 'disabled');

  const noSnapshot = fakeAdapter({
    async snapshotTenant() {
      throw new Error('snapshot unavailable');
    },
  });
  await assert.rejects(
    () => runDeprovisioningJob(platformDb, queued.jobId!, noSnapshot),
    (error: unknown) => error instanceof AppError,
  );
  const databaseStillRegistered = await platformDb.query(
    'SELECT 1 FROM db_registry WHERE client_id = $1 AND module_key = $2',
    [clientId, 'retail'],
  );
  assert.equal(databaseStillRegistered.rowCount, 1);

  await platformDb.query(
    `UPDATE provisioning_jobs
        SET next_attempt_at = now() - interval '1 second'
      WHERE id = $1`,
    [queued.jobId],
  );
  assert.equal(await retryProvisioningJob(platformDb, queued.jobId!), true);

  const operations: string[] = [];
  const snapshotThenDrop = fakeAdapter({
    async snapshotTenant() {
      operations.push('snapshot');
    },
    async dropTenant() {
      operations.push('drop');
    },
  });
  assert.equal(await runDeprovisioningJob(platformDb, queued.jobId!, snapshotThenDrop), true);
  assert.deepEqual(operations, ['snapshot', 'drop']);

  const archived = await platformDb.query<{ status: string; db_name: string | null }>(
    `SELECT status, db_name
       FROM client_modules
      WHERE client_id = $1
        AND module_key = 'retail'`,
    [clientId],
  );
  assert.equal(archived.rows[0]?.status, 'archived');
  assert.equal(archived.rows[0]?.db_name, null);
});

test('provisioning rejects unknown clients without touching any tenant database', async () => {
  const unknownClientId = randomUUID();
  await assert.rejects(
    () =>
      requestProvisioning(platformDb, {
        clientId: unknownClientId,
        moduleKey: 'hr',
        adminUserId: userId,
      }),
    (error: unknown) => error instanceof AppError && error.code === 'NOT_FOUND',
  );
  assert.equal(createdDatabases.length, 1);
});

test('only one worker can claim a provisioning job at a time', async () => {
  const request = await requestProvisioning(platformDb, {
    clientId,
    moduleKey: 'hr',
    adminUserId: userId,
  });
  assert.ok(request.jobId);

  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let releaseProvisioning!: () => void;
  const holdProvisioning = new Promise<void>((resolve) => {
    releaseProvisioning = resolve;
  });
  let calls = 0;
  const adapter = fakeAdapter({
    async provisionTenant({ clientId: targetClientId, moduleKey }) {
      calls += 1;
      markStarted();
      await holdProvisioning;
      return {
        dbName: tenantDatabaseName(targetClientId, moduleKey),
        appRole: `fake_${suffix}_${moduleKey}`,
        secretRef: 'encrypted-test-secret',
        schemaVersion: '1.0.0',
      };
    },
  });

  const firstWorker = runProvisioningJob(platformDb, request.jobId, adapter);
  await started;
  assert.equal(await runProvisioningJob(platformDb, request.jobId, adapter), false);
  releaseProvisioning();
  assert.equal(await firstWorker, true);
  assert.equal(calls, 1);
});

test('failed provisioning stops retrying after five attempts', async () => {
  const request = await requestProvisioning(platformDb, {
    clientId,
    moduleKey: 'school',
    adminUserId: userId,
  });
  assert.ok(request.jobId);
  const failureAdapter = fakeAdapter({
    async provisionTenant() {
      throw new Error('forced provisioning failure');
    },
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (attempt > 1) {
      const delay = await platformDb.query<{ next_attempt_at: Date | null }>(
        'SELECT next_attempt_at FROM provisioning_jobs WHERE id = $1',
        [request.jobId],
      );
      assert.ok(delay.rows[0]?.next_attempt_at);
      await platformDb.query(
        `UPDATE provisioning_jobs
            SET next_attempt_at = now() - interval '1 second'
          WHERE id = $1`,
        [request.jobId],
      );
      assert.equal(await retryProvisioningJob(platformDb, request.jobId), true);
    }

    await assert.rejects(
      () => runProvisioningJob(platformDb, request.jobId!, failureAdapter),
      (error: unknown) => error instanceof AppError && error.code === 'INTERNAL',
    );
  }

  const completedAttempts = await platformDb.query<{
    attempts: number;
    status: string;
    next_attempt_at: Date | null;
  }>(
    'SELECT attempts, status, next_attempt_at FROM provisioning_jobs WHERE id = $1',
    [request.jobId],
  );
  assert.equal(completedAttempts.rows[0]?.attempts, 5);
  assert.equal(completedAttempts.rows[0]?.status, 'failed');
  assert.equal(completedAttempts.rows[0]?.next_attempt_at, null);
  assert.equal(await retryProvisioningJob(platformDb, request.jobId), false);
});

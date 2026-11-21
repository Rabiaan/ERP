import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';
import { config } from '../config';
import { PlatformDb } from '../db/platform';
import { LocalKmsProvider } from '../kms/local';
import {
  dropTenantAppRole,
  dropTenantDatabase,
  tenantAppRole,
  tenantDatabaseName,
} from '../provisioning/database';
import { createPgDumpSnapshotter } from '../provisioning/snapshot';
import {
  createProvisioningAdapter,
  requestDeprovisioning,
  requestProvisioning,
  runDeprovisioningJob,
  runProvisioningJob,
} from '../provisioning/service';
import type { TenantModuleKey } from '../provisioning/migrate';

const moduleKey: TenantModuleKey = 'hr';

async function main(): Promise<void> {
  if (config.nodeEnv !== 'development') {
    throw new Error('The live provisioning smoke test is restricted to NODE_ENV=development.');
  }
  if (!config.provisioningDatabaseUrl) {
    throw new Error('PROVISIONING_DATABASE_URL must be configured.');
  }

  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const platformDb = new PlatformDb({
    connectionString: config.platformDatabaseUrl,
    max: 2,
    connectionTimeoutMillis: config.platformConnectionTimeoutMs,
  });
  const kms = new LocalKmsProvider(config.kmsLocalKey);
  const adapter = createProvisioningAdapter(kms, createPgDumpSnapshotter(kms));
  let planId: string | undefined;
  let clientId: string | undefined;
  let userId: string | undefined;
  let snapshotPath: string | undefined;
  let primaryError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    await platformDb.ping();
    const plan = await platformDb.query<{ id: string }>(
      `INSERT INTO plans (key, name, max_users, max_modules)
       VALUES ($1, 'Provisioning smoke test', 5, 1)
       RETURNING id::text`,
      [`smoke-${suffix}`],
    );
    planId = plan.rows[0]!.id;

    const client = await platformDb.query<{ id: string }>(
      `INSERT INTO clients (name, slug, status, plan_id)
       VALUES ($1, $2, 'active', $3)
       RETURNING id::text`,
      [`Provisioning smoke ${suffix}`, `provision-smoke-${suffix}`, planId],
    );
    clientId = client.rows[0]!.id;

    const user = await platformDb.query<{ id: string }>(
      `INSERT INTO users (email, full_name, status, must_change_password)
       VALUES ($1, 'Provisioning Smoke Admin', 'invited', true)
       RETURNING id::text`,
      [`provision-smoke-${suffix}@example.test`],
    );
    userId = user.rows[0]!.id;

    const provision = await requestProvisioning(platformDb, {
      clientId,
      moduleKey,
      adminUserId: userId,
    });
    if (!provision.jobId) {
      throw new Error('Smoke test did not receive a provisioning job ID.');
    }
    if (!(await runProvisioningJob(platformDb, provision.jobId, adapter))) {
      throw new Error('Smoke test provisioning job could not be claimed.');
    }

    const activeModule = await platformDb.query<{ status: string }>(
      `SELECT status
         FROM client_modules
        WHERE client_id = $1
          AND module_key = $2`,
      [clientId, moduleKey],
    );
    if (activeModule.rows[0]?.status !== 'active') {
      throw new Error('Smoke test tenant module did not become active.');
    }

    const deprovision = await requestDeprovisioning(platformDb, { clientId, moduleKey });
    if (!deprovision.jobId) {
      throw new Error('Smoke test did not receive a deprovisioning job ID.');
    }
    if (!(await runDeprovisioningJob(platformDb, deprovision.jobId, adapter))) {
      throw new Error('Smoke test deprovisioning job could not be claimed.');
    }

    snapshotPath = join(
      config.backupDir,
      `${clientId}-${moduleKey}-${deprovision.jobId}.dump`,
    );
    const snapshot = await stat(snapshotPath);
    if (!snapshot.isFile() || snapshot.size === 0) {
      throw new Error('Smoke test snapshot is missing or empty.');
    }

    const archivedModule = await platformDb.query<{ status: string; db_name: string | null }>(
      `SELECT status, db_name
         FROM client_modules
        WHERE client_id = $1
          AND module_key = $2`,
      [clientId, moduleKey],
    );
    if (
      archivedModule.rows[0]?.status !== 'archived' ||
      archivedModule.rows[0]?.db_name !== null
    ) {
      throw new Error('Smoke test tenant module was not archived after deprovisioning.');
    }

    console.log(
      `Live provisioning and deprovisioning passed; snapshot size: ${snapshot.size} bytes.`,
    );
  } catch (error) {
    primaryError = error;
  } finally {
    if (clientId) {
      try {
        await dropTenantDatabase(tenantDatabaseName(clientId, moduleKey));
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await dropTenantAppRole(tenantAppRole(clientId, moduleKey));
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await platformDb.query('DELETE FROM clients WHERE id = $1', [clientId]);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (userId) {
      try {
        await platformDb.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (planId) {
      try {
        await platformDb.query('DELETE FROM plans WHERE id = $1', [planId]);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (snapshotPath) {
      try {
        await rm(snapshotPath, { force: true });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await platformDb.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (primaryError) {
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Provisioning smoke test cleanup failed.');
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown provisioning smoke test failure.';
  console.error(`provisioning smoke test failed: ${message}`);
  process.exitCode = 1;
});

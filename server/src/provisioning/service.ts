import type { PoolClient, QueryResultRow } from 'pg';
import { logger } from '../http/log';
import type { ModuleKey, PermissionKey } from '../authz/catalog';
import { expandPermissionKeys, permissionsForPreset } from '../authz/catalog';
import type { PlatformDb } from '../db/platform';
import { AppError, toAppError } from '../http/errors';
import type { KmsProvider } from '../kms/local';
import {
  dropTenantDatabase,
  provisionTenantDatabase,
  tenantDatabaseName,
  tenantAppRole,
  type ProvisionedDatabase,
} from './database';
import { isTenantModuleKey, type TenantModuleKey } from './migrate';

const MAX_ATTEMPTS = 5;
const MAX_RETRY_DELAY_SECONDS = 3600;

export type ProvisioningJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type ProvisioningJobType = 'provision' | 'deprovision';

export type ProvisioningJob = {
  id: string;
  clientId: string;
  moduleKey: TenantModuleKey;
  jobType: ProvisioningJobType;
  status: ProvisioningJobStatus;
  attempts: number;
};

export type ProvisioningRequestResult = {
  jobId: string | null;
  status: ProvisioningJobStatus | 'active';
};

export type ProvisioningAdapter = {
  provisionTenant(input: {
    clientId: string;
    moduleKey: TenantModuleKey;
  }): Promise<ProvisionedDatabase>;
  snapshotTenant(input: {
    jobId: string;
    clientId: string;
    moduleKey: TenantModuleKey;
    databaseName: string;
    secretRef: string;
  }): Promise<void>;
  dropTenant(input: {
    databaseName: string;
    appRole: string;
  }): Promise<void>;
};

export function createProvisioningAdapter(
  kms: KmsProvider,
  snapshotTenant: ProvisioningAdapter['snapshotTenant'],
): ProvisioningAdapter {
  return {
    provisionTenant: (input) => provisionTenantDatabase(input, kms),
    snapshotTenant,
    dropTenant: async ({ databaseName, appRole }) => {
      await dropTenantDatabase(databaseName);
      const { dropTenantAppRole } = await import('./database');
      await dropTenantAppRole(appRole);
    },
  };
}

type JobRow = QueryResultRow & {
  id: string;
  client_id: string;
  module_key: string;
  job_type: ProvisioningJobType;
  status: ProvisioningJobStatus;
  attempts: number;
};

type ModuleRow = QueryResultRow & {
  status: string;
  db_name: string | null;
  db_secret_ref: string | null;
};

type ClaimedJob = JobRow & {
  admin_user_id: string | null;
  created_by: string | null;
  initial_grants: string[];
};

function assertModuleKey(moduleKey: string): asserts moduleKey is TenantModuleKey {
  if (!isTenantModuleKey(moduleKey)) {
    throw new AppError('VALIDATION_ERROR', 'Unknown module key.');
  }
}

function jobFromRow(row: JobRow): ProvisioningJob {
  assertModuleKey(row.module_key);
  return {
    id: row.id,
    clientId: row.client_id,
    moduleKey: row.module_key,
    jobType: row.job_type,
    status: row.status,
    attempts: row.attempts,
  };
}

async function lockClientModule(client: PoolClient, clientId: string, moduleKey: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
    clientId,
    moduleKey,
  ]);
}

async function findExistingJob(
  client: PoolClient,
  clientId: string,
  moduleKey: string,
  jobType: ProvisioningJobType,
): Promise<JobRow | undefined> {
  const result = await client.query<JobRow>(
    `SELECT id::text, client_id::text, module_key, job_type, status, attempts
       FROM provisioning_jobs
      WHERE client_id = $1
        AND module_key = $2
        AND job_type = $3
      ORDER BY created_at DESC
      LIMIT 1`,
    [clientId, moduleKey, jobType],
  );
  return result.rows[0];
}

export async function requestProvisioning(
  platformDb: PlatformDb,
  input: {
    clientId: string;
    moduleKey: ModuleKey;
    adminUserId: string;
    createdBy?: string | null;
    initialGrants?: string[];
  },
): Promise<ProvisioningRequestResult> {
  const initialGrants = input.initialGrants?.length
    ? expandPermissionKeys(input.initialGrants, { enabledModules: [input.moduleKey], allowPlatform: false })
    : [];
  return platformDb.transaction(async (client) => {
    await lockClientModule(client, input.clientId, input.moduleKey);

    const clientResult = await client.query<{ status: string; max_modules: number }>(
      `SELECT c.status,
              p.max_modules
         FROM clients c
         JOIN plans p ON p.id = c.plan_id
        WHERE c.id = $1
          AND c.deleted_at IS NULL
        FOR UPDATE OF c`,
      [input.clientId],
    );
    const clientRow = clientResult.rows[0];
    if (!clientRow) {
      throw new AppError('NOT_FOUND', 'Client was not found.');
    }
    if (clientRow.status !== 'active') {
      throw new AppError('CONFLICT', 'Only active clients can be provisioned.');
    }

    const module = await client.query<{ is_active: boolean }>(
      'SELECT is_active FROM modules WHERE key = $1',
      [input.moduleKey],
    );
    if (!module.rows[0]?.is_active) {
      throw new AppError('MODULE_NOT_ENABLED');
    }

    const user = await client.query<{ status: string }>(
      `SELECT status
         FROM users
        WHERE id = $1
          AND deleted_at IS NULL`,
      [input.adminUserId],
    );
    if (!user.rows[0] || !['active', 'invited'].includes(user.rows[0].status)) {
      throw new AppError('VALIDATION_ERROR', 'A valid client administrator user is required.');
    }

    const existingModule = await client.query<ModuleRow>(
      `SELECT status, db_name, db_secret_ref
         FROM client_modules
        WHERE client_id = $1
          AND module_key = $2
        FOR UPDATE`,
      [input.clientId, input.moduleKey],
    );
    const existing = existingModule.rows[0];
    if (existing?.status === 'active') {
      const previous = await findExistingJob(client, input.clientId, input.moduleKey, 'provision');
      return { jobId: previous?.id ?? null, status: 'active' };
    }
    if (existing && existing.status !== 'provisioning') {
      throw new AppError('CONFLICT', 'Disabled or archived modules require an explicit reactivation flow.');
    }

    const activeCount = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM client_modules
        WHERE client_id = $1
          AND status IN ('active', 'provisioning')`,
      [input.clientId],
    );
    if (!existing && Number(activeCount.rows[0]?.count ?? 0) >= clientRow.max_modules) {
      throw new AppError('CONFLICT', 'The client has reached its module limit.');
    }

    if (!existing) {
      await client.query(
        `INSERT INTO client_modules (client_id, module_key, status, granted_by, db_name)
         VALUES ($1, $2, 'provisioning', $3, $4)`,
        [
          input.clientId,
          input.moduleKey,
          input.createdBy ?? null,
          tenantDatabaseName(input.clientId, input.moduleKey),
        ],
      );
    }

    const activeJob = await client.query<JobRow>(
      `SELECT id::text, client_id::text, module_key, job_type, status, attempts
         FROM provisioning_jobs
        WHERE client_id = $1
          AND module_key = $2
          AND job_type = 'provision'
          AND status IN ('queued', 'running')
        ORDER BY created_at DESC
        LIMIT 1`,
      [input.clientId, input.moduleKey],
    );
    if (activeJob.rows[0]) {
      return { jobId: activeJob.rows[0].id, status: activeJob.rows[0].status };
    }

    const existingJob = await findExistingJob(client, input.clientId, input.moduleKey, 'provision');
    if (existingJob) {
      return { jobId: existingJob.id, status: existingJob.status };
    }

    const inserted = await client.query<JobRow>(
      `INSERT INTO provisioning_jobs (
         client_id, module_key, job_type, created_by, admin_user_id, initial_grants, step, status, steps
       )
       VALUES ($1, $2, 'provision', $3, $4, $5, 'queued', 'queued', $6::jsonb)
       RETURNING id::text, client_id::text, module_key, job_type, status, attempts`,
      [
        input.clientId,
        input.moduleKey,
        input.createdBy ?? null,
        input.adminUserId,
        initialGrants,
        JSON.stringify([{ step: 'queued', at: new Date().toISOString() }]),
      ],
    );
    const row = inserted.rows[0];
    if (!row) {
      throw new AppError('INTERNAL', 'Unable to create provisioning job.');
    }
    return { jobId: row.id, status: row.status };
  });
}

export async function retryProvisioningJob(
  platformDb: PlatformDb,
  jobId: string,
): Promise<boolean> {
  const result = await platformDb.query(
    `UPDATE provisioning_jobs
        SET status = 'queued',
            step = 'retry_queued',
            next_attempt_at = NULL,
            last_error = NULL,
            finished_at = NULL,
            updated_at = now(),
            steps = steps || jsonb_build_array(
              jsonb_build_object('step', 'retry_queued', 'at', now())
            )
      WHERE id = $1
        AND status = 'failed'
        AND attempts < $2
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())`,
    [jobId, MAX_ATTEMPTS],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function requestDeprovisioning(
  platformDb: PlatformDb,
  input: { clientId: string; moduleKey: ModuleKey; createdBy?: string | null },
): Promise<ProvisioningRequestResult> {
  return platformDb.transaction(async (client) => {
    await lockClientModule(client, input.clientId, input.moduleKey);
    const module = await client.query<ModuleRow>(
      `SELECT status, db_name, db_secret_ref
         FROM client_modules
        WHERE client_id = $1
          AND module_key = $2
        FOR UPDATE`,
      [input.clientId, input.moduleKey],
    );
    const row = module.rows[0];
    if (!row) {
      throw new AppError('NOT_FOUND', 'Client module was not found.');
    }
    if (row.status === 'archived') {
      const previous = await findExistingJob(
        client,
        input.clientId,
        input.moduleKey,
        'deprovision',
      );
      return { jobId: previous?.id ?? null, status: 'succeeded' };
    }
    if (row.status === 'disabled') {
      const previous = await findExistingJob(
        client,
        input.clientId,
        input.moduleKey,
        'deprovision',
      );
      if (previous) {
        return { jobId: previous.id, status: previous.status };
      }
    } else if (row.status !== 'active') {
      throw new AppError('CONFLICT', 'Module cannot be deprovisioned from its current state.');
    }

    const inserted = await client.query<JobRow>(
      `INSERT INTO provisioning_jobs (
         client_id, module_key, job_type, created_by, step, status, steps
       )
       VALUES ($1, $2, 'deprovision', $3, 'queued', 'queued', $4::jsonb)
       RETURNING id::text, client_id::text, module_key, job_type, status, attempts`,
      [
        input.clientId,
        input.moduleKey,
        input.createdBy ?? null,
        JSON.stringify([{ step: 'queued', at: new Date().toISOString() }]),
      ],
    );
    const job = inserted.rows[0];
    if (!job) {
      throw new AppError('INTERNAL', 'Unable to create deprovisioning job.');
    }

    await client.query(
      `UPDATE client_modules
          SET status = 'disabled'
        WHERE client_id = $1
          AND module_key = $2`,
      [input.clientId, input.moduleKey],
    );
    await client.query(
      `UPDATE sessions
          SET revoked_at = COALESCE(revoked_at, now())
        WHERE client_id = $1
          AND active_module = $2
          AND revoked_at IS NULL`,
      [input.clientId, input.moduleKey],
    );
    await client.query(
      `UPDATE memberships
          SET status = 'revoked'
        WHERE client_id = $1
          AND module_key = $2
          AND status = 'active'`,
      [input.clientId, input.moduleKey],
    );
    return { jobId: job.id, status: job.status };
  });
}

async function appendStep(
  platformDb: PlatformDb,
  jobId: string,
  step: string,
): Promise<void> {
  await platformDb.query(
    `UPDATE provisioning_jobs
        SET step = $2::text,
            updated_at = now(),
            steps = steps || jsonb_build_array(
              jsonb_build_object('step', $2::text, 'at', now())
            )
      WHERE id = $1
        AND status = 'running'`,
    [jobId, step],
  );
}

async function claimJob(
  platformDb: PlatformDb,
  jobId: string,
  jobType: ProvisioningJobType,
): Promise<ClaimedJob | null> {
  return platformDb.transaction(async (client) => {
    const result = await client.query<ClaimedJob>(
      `UPDATE provisioning_jobs
          SET status = 'running',
              step = 'starting',
              attempts = attempts + 1,
              started_at = COALESCE(started_at, now()),
              finished_at = NULL,
              next_attempt_at = NULL,
              updated_at = now(),
              steps = steps || jsonb_build_array(
                jsonb_build_object('step', 'starting', 'at', now())
              )
        WHERE id = $1
          AND job_type = $2
          AND status = 'queued'
          AND attempts < $3
          AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      RETURNING id::text, client_id::text, module_key, job_type, status, attempts,
                admin_user_id::text,
                created_by::text,
                initial_grants`,
      [jobId, jobType, MAX_ATTEMPTS],
    );
    return result.rows[0] ?? null;
  });
}

function safeFailureCode(error: unknown): string {
  const appError = toAppError(error);
  return appError.code === 'INTERNAL' ? 'PROVISIONING_FAILED' : appError.code;
}

async function markFailed(
  platformDb: PlatformDb,
  job: ProvisioningJob,
  error: unknown,
): Promise<void> {
  const code = safeFailureCode(error);
  const delaySeconds = Math.min(60 * 2 ** Math.max(0, job.attempts - 1), MAX_RETRY_DELAY_SECONDS);
  const retryable = job.attempts < MAX_ATTEMPTS;
  await platformDb.query(
    `UPDATE provisioning_jobs
        SET status = 'failed',
            step = 'failed',
            last_error = $2,
            next_attempt_at = CASE WHEN $3 THEN now() + ($4 * interval '1 second') ELSE NULL END,
            finished_at = now(),
            updated_at = now(),
            steps = steps || jsonb_build_array(
              jsonb_build_object('step', 'failed', 'code', $2::text, 'at', now())
            )
      WHERE id = $1
        AND status = 'running'`,
    [job.id, code, retryable, delaySeconds],
  );
}

async function finishProvisioning(
  platformDb: PlatformDb,
  job: ClaimedJob,
  provisioned: ProvisionedDatabase,
): Promise<void> {
  await platformDb.transaction(async (client) => {
    const modules = await client.query<{ module_key: ModuleKey }>(
      `SELECT module_key
         FROM client_modules
        WHERE client_id = $1
          AND (status = 'active' OR module_key = $2)`,
      [job.client_id, job.module_key],
    );
    const enabledModules = modules.rows.map((row) => row.module_key);
    const grants: PermissionKey[] = job.initial_grants.length
      ? expandPermissionKeys(job.initial_grants, { enabledModules, allowPlatform: false })
      : permissionsForPreset('client_admin', enabledModules);
    const membership = await client.query<{ id: string }>(
      `INSERT INTO memberships (
         user_id, client_id, module_key, role, status, created_by, created_by_membership_id
       )
       VALUES ($1, $2, $3, 'client_admin', 'active', $4, NULL)
       ON CONFLICT (user_id, client_id, module_key)
       DO UPDATE SET role = 'client_admin',
                     status = 'active',
                     created_by = EXCLUDED.created_by,
                     created_by_membership_id = NULL
       RETURNING id::text`,
      [job.admin_user_id, job.client_id, job.module_key, job.created_by],
    );
    const membershipId = membership.rows[0]?.id;
    if (!membershipId) {
      throw new AppError('INTERNAL', 'Unable to create the initial client administrator membership.');
    }

    await client.query('DELETE FROM role_grants WHERE membership_id = $1', [membershipId]);
    if (grants.length > 0) {
      await client.query(
        `INSERT INTO role_grants (membership_id, permission_key, granted_by)
         SELECT $1, permission_key, $3
           FROM unnest($2::text[]) AS permissions(permission_key)`,
        [membershipId, grants, job.created_by],
      );
    }

    await client.query(
      `INSERT INTO db_registry (
         client_id, module_key, db_name, secret_ref, health, schema_version
       )
       VALUES ($1, $2, $3, $4, 'healthy', $5)
       ON CONFLICT (client_id, module_key)
       DO UPDATE SET db_name = EXCLUDED.db_name,
                     secret_ref = EXCLUDED.secret_ref,
                     health = 'healthy',
                     schema_version = EXCLUDED.schema_version,
                     last_checked_at = now()`,
      [
        job.client_id,
        job.module_key,
        provisioned.dbName,
        provisioned.secretRef,
        provisioned.schemaVersion,
      ],
    );
    await client.query(
      `UPDATE client_modules
          SET status = 'active',
              db_name = $3,
              db_secret_ref = $4,
              schema_version = $5
        WHERE client_id = $1
          AND module_key = $2
          AND status IN ('provisioning', 'disabled')`,
      [
        job.client_id,
        job.module_key,
        provisioned.dbName,
        provisioned.secretRef,
        provisioned.schemaVersion,
      ],
    );
    await client.query(
      `UPDATE provisioning_jobs
          SET status = 'succeeded',
              step = 'complete',
              last_error = NULL,
              finished_at = now(),
              next_attempt_at = NULL,
              updated_at = now(),
              steps = steps || jsonb_build_array(
                jsonb_build_object('step', 'complete', 'at', now())
              )
        WHERE id = $1
          AND status = 'running'`,
      [job.id],
    );
  });
}

export async function runProvisioningJob(
  platformDb: PlatformDb,
  jobId: string,
  adapter: ProvisioningAdapter,
): Promise<boolean> {
  const job = await claimJob(platformDb, jobId, 'provision');
  if (!job) {
    return false;
  }

  const parsedJob = jobFromRow(job);
  try {
    if (!job.admin_user_id) {
      throw new AppError('VALIDATION_ERROR', 'The provisioning job has no initial administrator.');
    }
    await appendStep(platformDb, job.id, 'creating_database');
    const provisioned = await adapter.provisionTenant({
      clientId: job.client_id,
      moduleKey: parsedJob.moduleKey,
    });
    await appendStep(platformDb, job.id, 'migrating_and_seeding');
    await appendStep(platformDb, job.id, 'registering_database');
    await finishProvisioning(platformDb, job, provisioned);
    return true;
  } catch (error) {
    await markFailed(platformDb, parsedJob, error);
    throw toAppError(error);
  }
}

export async function runDeprovisioningJob(
  platformDb: PlatformDb,
  jobId: string,
  adapter: ProvisioningAdapter,
): Promise<boolean> {
  const job = await claimJob(platformDb, jobId, 'deprovision');
  if (!job) {
    return false;
  }

  const parsedJob = jobFromRow(job);
  try {
    const registry = await platformDb.query<{
      db_name: string;
      secret_ref: string;
    }>(
      `SELECT db_name, secret_ref
         FROM db_registry
        WHERE client_id = $1
          AND module_key = $2`,
      [job.client_id, job.module_key],
    );
    const row = registry.rows[0];
    if (!row) {
      throw new AppError('SERVICE_UNAVAILABLE', 'A registered tenant database is required to deprovision.');
    }

    await appendStep(platformDb, job.id, 'snapshotting');
    await adapter.snapshotTenant({
      jobId: job.id,
      clientId: job.client_id,
      moduleKey: parsedJob.moduleKey,
      databaseName: row.db_name,
      secretRef: row.secret_ref,
    });
    await appendStep(platformDb, job.id, 'dropping_database');
    await adapter.dropTenant({
      databaseName: row.db_name,
      appRole: tenantAppRole(job.client_id, parsedJob.moduleKey),
    });

    await platformDb.transaction(async (client) => {
      await client.query(
        `DELETE FROM db_registry
          WHERE client_id = $1
            AND module_key = $2`,
        [job.client_id, job.module_key],
      );
      await client.query(
        `UPDATE client_modules
            SET status = 'archived',
                db_name = NULL,
                db_secret_ref = NULL,
                schema_version = NULL
          WHERE client_id = $1
            AND module_key = $2`,
        [job.client_id, job.module_key],
      );
      await client.query(
        `UPDATE provisioning_jobs
            SET status = 'succeeded',
                step = 'complete',
                last_error = NULL,
                finished_at = now(),
                next_attempt_at = NULL,
                updated_at = now(),
                steps = steps || jsonb_build_array(
                  jsonb_build_object('step', 'complete', 'at', now())
                )
          WHERE id = $1
            AND status = 'running'`,
        [job.id],
      );
    });
    return true;
  } catch (error) {
    await markFailed(platformDb, parsedJob, error);
    throw toAppError(error);
  }
}

export async function runReadyProvisioningJobs(
  platformDb: PlatformDb,
  adapter: ProvisioningAdapter,
  limit = 10,
): Promise<number> {
  const count = Math.max(1, Math.min(100, Math.trunc(limit)));
  await platformDb.query(
    `UPDATE provisioning_jobs
        SET status = 'queued',
            step = 'retry_queued',
            updated_at = now(),
            steps = steps || jsonb_build_array(
              jsonb_build_object('step', 'retry_queued', 'at', now())
            )
      WHERE status = 'failed'
        AND attempts < $1
        AND next_attempt_at <= now()`,
    [MAX_ATTEMPTS],
  );
  const ready = await platformDb.query<JobRow>(
    `SELECT id::text, client_id::text, module_key, job_type, status, attempts
       FROM provisioning_jobs
      WHERE status = 'queued'
        AND attempts < $1
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY created_at
      LIMIT $2`,
    [MAX_ATTEMPTS, count],
  );

  let processed = 0;
  for (const row of ready.rows) {
    const job = jobFromRow(row);
    try {
      const ran =
        job.jobType === 'provision'
          ? await runProvisioningJob(platformDb, job.id, adapter)
          : await runDeprovisioningJob(platformDb, job.id, adapter);
      if (ran) {
        processed += 1;
      }
    } catch (error) {
      logger.warn('provisioning.job.failed', {
        jobId: job.id,
        code: safeFailureCode(error),
      });
    }
  }
  return processed;
}

export function isModuleKey(value: string): value is TenantModuleKey {
  return isTenantModuleKey(value);
}

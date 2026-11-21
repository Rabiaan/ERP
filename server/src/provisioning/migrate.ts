import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

export const TENANT_MODULES = ['hr', 'retail', 'school', 'accounts'] as const;
export type TenantModuleKey = (typeof TENANT_MODULES)[number];

export type TenantMigrationOptions = {
  connectionString: string;
  clientId: string;
  moduleKey: TenantModuleKey;
  appRole: string;
  appPassword?: string;
  migrationsRoot?: string;
};

export type TenantMigrationResult = {
  applied: string[];
  skipped: string[];
};

type MigrationFile = {
  set: string;
  name: string;
  version: string;
  sql: string;
  checksum: string;
};

const PASSWORD_MIN_LENGTH = 16;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const MIGRATIONS_ROOT = fileURLToPath(new URL('../../../db/migrations', import.meta.url));

export function isTenantModuleKey(value: string | undefined): value is TenantModuleKey {
  return value !== undefined && (TENANT_MODULES as readonly string[]).includes(value);
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

async function loadMigrationFiles(
  root: string,
  moduleKey: TenantModuleKey,
): Promise<MigrationFile[]> {
  const sets = ['_shared', moduleKey];
  const files: MigrationFile[] = [];

  for (const set of sets) {
    const directory = join(root, set);
    const names = (await readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right));

    if (names.length === 0) {
      throw new Error(`No migrations found in ${directory}`);
    }

    for (const name of names) {
      const raw = await readFile(join(directory, name), 'utf8');
      const sql = raw.replace(/\r\n/g, '\n');
      files.push({
        set,
        name,
        version: `${set}/${name}`,
        sql,
        checksum: checksum(sql),
      });
    }
  }

  return files;
}

async function ensureAppRole(client: Client, options: TenantMigrationOptions): Promise<void> {
  const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [options.appRole]);
  if ((existing.rowCount ?? 0) > 0) {
    return;
  }

  if (!options.appPassword || options.appPassword.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `role ${options.appRole} does not exist; provide appPassword with at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  }

  await client.query(
    `CREATE ROLE ${quoteIdent(options.appRole)}
       LOGIN PASSWORD ${quoteLiteral(options.appPassword)}
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
  );
}

async function setTenantContext(client: Client, options: TenantMigrationOptions): Promise<void> {
  await client.query(
    `SELECT set_config('app.client_id', $1, true),
            set_config('app.module_key', $2, true),
            set_config('lilac.tenant_app_role', $3, true)`,
    [options.clientId, options.moduleKey, options.appRole],
  );
}

async function verifyRls(client: Client): Promise<void> {
  const { rows } = await client.query<{ relname: string }>(
    `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname <> '__migrations'
        AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)`,
  );

  if (rows.length > 0) {
    const names = rows.map((row) => row.relname).join(', ');
    throw new Error(`tenant tables missing forced RLS: ${names}`);
  }
}

async function verifyTenantMeta(client: Client, options: TenantMigrationOptions): Promise<void> {
  const { rows } = await client.query<{ client_id: string; module_key: string }>(
    'SELECT client_id::text, module_key FROM tenant_meta WHERE id = 1',
  );

  const meta = rows[0];
  if (!meta) {
    throw new Error('tenant_meta is missing after migration');
  }

  if (meta.client_id !== options.clientId || meta.module_key !== options.moduleKey) {
    throw new Error(
      `tenant_meta mismatch: database is ${meta.client_id}/${meta.module_key}, expected ${options.clientId}/${options.moduleKey}`,
    );
  }
}

export async function migrateTenantDatabase(
  options: TenantMigrationOptions,
): Promise<TenantMigrationResult> {
  if (!UUID_PATTERN.test(options.clientId)) {
    throw new Error('clientId must be a UUID');
  }

  if (!ROLE_PATTERN.test(options.appRole)) {
    throw new Error('appRole must match ^[a-z][a-z0-9_]{0,62}$');
  }

  const root = options.migrationsRoot ?? MIGRATIONS_ROOT;
  const migrations = await loadMigrationFiles(root, options.moduleKey);
  const applied: string[] = [];
  const skipped: string[] = [];

  const client = new Client({
    connectionString: options.connectionString,
    application_name: 'lilac-tenant-migrator',
  });

  await client.connect();
  let locked = false;

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1), hashtext($2))', [
      options.clientId,
      options.moduleKey,
    ]);
    locked = true;

    await ensureAppRole(client, options);

    await client.query(`
      CREATE TABLE IF NOT EXISTS __migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        checksum text NOT NULL
      )
    `);

    const appliedResult = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM __migrations',
    );
    const appliedMap = new Map(appliedResult.rows.map((row) => [row.version, row.checksum]));

    for (const file of migrations) {
      const previous = appliedMap.get(file.version);

      if (previous !== undefined) {
        if (previous !== file.checksum) {
          throw new Error(
            `Checksum drift for ${file.version}: database ${previous.slice(0, 12)} != file ${file.checksum.slice(0, 12)}`,
          );
        }
        skipped.push(file.version);
        continue;
      }

      await client.query('BEGIN');
      try {
        await setTenantContext(client, options);
        await client.query(file.sql);
        await client.query(
          'INSERT INTO __migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [file.version, file.name, file.checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Tenant migration ${file.version} failed: ${message}`);
      }

      applied.push(file.version);
    }

    await client.query('BEGIN');
    try {
      await setTenantContext(client, options);
      await client.query('SELECT app.grant_tenant_role()');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    await client.query('BEGIN');
    try {
      await setTenantContext(client, options);
      await verifyRls(client);
      await verifyTenantMeta(client, options);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    if (locked) {
      await client
        .query('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))', [
          options.clientId,
          options.moduleKey,
        ])
        .catch(() => undefined);
    }
    await client.end();
  }

  return { applied, skipped };
}

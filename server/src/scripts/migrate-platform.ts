import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../db/migrations/platform', import.meta.url));
const ADVISORY_LOCK_KEY = 'lilac_platform_migrations';
const PASSWORD_MIN_LENGTH = 16;

type AppliedMigration = {
  version: string;
  checksum: string;
};

type RoleAttributes = {
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
};

function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < minLength) {
    const suffix = minLength > 1 ? ` and be at least ${minLength} characters` : '';
    throw new Error(`${name} must be set${suffix}`);
  }
  return value;
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

async function listMigrations(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}

async function verifyLeastPrivilege(client: Client): Promise<void> {
  const { rows } = await client.query<RoleAttributes>(
    `SELECT rolsuper, rolcreatedb, rolcreaterole
       FROM pg_roles
      WHERE rolname = 'lilac_platform_app'`,
  );

  const role = rows[0];
  if (!role) {
    throw new Error('lilac_platform_app role is missing after migration');
  }

  if (role.rolsuper || role.rolcreatedb || role.rolcreaterole) {
    throw new Error('lilac_platform_app must not be superuser, createdb, or createrole');
  }

  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE lilac_platform_app');
    await client.query('UPDATE audit_events SET action = action');
    throw new Error('append-only check failed: lilac_platform_app could update audit_events');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('append-only check failed')) {
      throw error;
    }

    const code = (error as { code?: string }).code;
    if (code !== '42501' && code !== '23001' && code !== '55000') {
      throw new Error(`append-only check failed unexpectedly: ${message}`);
    }
  } finally {
    await client.query('ROLLBACK');
  }
}

async function main(): Promise<void> {
  const adminUrl = requireEnv('PLATFORM_ADMIN_URL');
  const appPassword = requireEnv('PLATFORM_APP_PASSWORD', PASSWORD_MIN_LENGTH);
  const migratorPassword = requireEnv('PLATFORM_MIGRATOR_PASSWORD', PASSWORD_MIN_LENGTH);
  const migrations = await listMigrations();

  if (migrations.length === 0) {
    throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);
  }

  const client = new Client({
    connectionString: adminUrl,
    application_name: 'lilac-platform-migrator',
  });

  await client.connect();
  let locked = false;

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [ADVISORY_LOCK_KEY]);
    locked = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query<AppliedMigration>(
      'SELECT version, checksum FROM platform_migrations',
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.version, row.checksum]));
    let appliedCount = 0;

    for (const file of migrations) {
      const raw = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      const sql = raw.replace(/\r\n/g, '\n');
      const digest = checksum(sql);
      const previous = applied.get(file);

      if (previous !== undefined) {
        if (previous !== digest) {
          throw new Error(
            `Checksum drift for ${file}: database ${previous.slice(0, 12)} != file ${digest.slice(0, 12)}`,
          );
        }
        console.log(`skip    ${file}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(
          `SELECT set_config('lilac.app_password', $1, true),
                  set_config('lilac.migrator_password', $2, true)`,
          [appPassword, migratorPassword],
        );
        await client.query(sql);
        await client.query(
          'INSERT INTO platform_migrations (version, checksum) VALUES ($1, $2)',
          [file, digest],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Migration ${file} failed: ${message}`);
      }

      appliedCount += 1;
      console.log(`applied ${file}`);
    }

    await verifyLeastPrivilege(client);
    console.log(
      `platform schema up to date (${migrations.length} migrations, ${appliedCount} applied)`,
    );
  } finally {
    if (locked) {
      await client
        .query('SELECT pg_advisory_unlock(hashtext($1))', [ADVISORY_LOCK_KEY])
        .catch(() => undefined);
    }
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`db:migrate failed: ${message}`);
  process.exitCode = 1;
});

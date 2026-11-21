import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Client } from 'pg';

const ROLE_NAME = 'lilac_provisioner';
const ADMIN_URL = process.env.PLATFORM_ADMIN_URL;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function setProvisionerRole(
  adminUrl: string,
  databaseName: string,
  password: string,
): Promise<void> {
  const admin = new Client({
    connectionString: adminUrl,
    application_name: 'lilac-provisioning-role-setup',
  });
  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE_NAME]);
    const command = existing.rowCount
      ? 'ALTER ROLE lilac_provisioner WITH LOGIN PASSWORD %L CREATEDB CREATEROLE NOSUPERUSER NOINHERIT'
      : 'CREATE ROLE lilac_provisioner WITH LOGIN PASSWORD %L CREATEDB CREATEROLE NOSUPERUSER NOINHERIT';
    const statement = await admin.query('SELECT format($1::text, $2::text) AS sql', [
      command,
      password,
    ]);
    await admin.query(statement.rows[0]!.sql);
    await admin.query(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${ROLE_NAME}`,
    );

    const verified = await admin.query<{
      rolcanlogin: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolsuper: boolean;
    }>(
      `SELECT rolcanlogin, rolcreatedb, rolcreaterole, rolsuper
         FROM pg_roles
        WHERE rolname = $1`,
      [ROLE_NAME],
    );
    const role = verified.rows[0];
    if (
      !role?.rolcanlogin ||
      !role.rolcreatedb ||
      !role.rolcreaterole ||
      role.rolsuper
    ) {
      throw new Error('Provisioning role permissions did not pass verification.');
    }
  } finally {
    await admin.end();
  }
}

async function configureEnv(provisioningUrl: URL): Promise<void> {
  let contents = await readFile('.env', 'utf8');
  const lines = [
    `PROVISIONING_DATABASE_URL="${provisioningUrl.toString()}"`,
    'BACKUP_DIR="storage/backups"',
  ];

  for (const [index, key] of ['PROVISIONING_DATABASE_URL', 'BACKUP_DIR'].entries()) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(contents)) {
      contents = contents.replace(pattern, lines[index]!);
    } else {
      contents = `${contents.trimEnd()}\n${lines[index]}\n`;
    }
  }

  await writeFile('.env', contents, 'utf8');
}

async function main(): Promise<void> {
  if (!ADMIN_URL) {
    throw new Error('PLATFORM_ADMIN_URL must be configured in .env before setup.');
  }

  const adminUrl = new URL(ADMIN_URL);
  const databaseName = decodeURIComponent(adminUrl.pathname.slice(1));
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error('PLATFORM_ADMIN_URL must target a simple local database name.');
  }

  const password = randomBytes(36).toString('base64url');
  const provisioningUrl = new URL(adminUrl);
  provisioningUrl.username = ROLE_NAME;
  provisioningUrl.password = password;

  await setProvisionerRole(ADMIN_URL, databaseName, password);
  await configureEnv(provisioningUrl);
  console.log(
    'Provisioning role configured with CREATEDB/CREATEROLE (not superuser); .env updated.',
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown provisioning setup failure.';
  console.error(`provisioning role setup failed: ${message}`);
  process.exitCode = 1;
});

import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import type { KmsProvider } from '../kms/local';
import { config } from '../config';
import { migrateTenantDatabase } from './migrate';
import type { TenantModuleKey } from './migrate';

const DB_NAME_PATTERN = /^tenant_[a-z0-9_]{1,54}$/;
const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

export type ProvisionedDatabase = {
  dbName: string;
  appRole: string;
  secretRef: string;
  schemaVersion: string;
};

export function tenantDatabaseName(clientId: string, moduleKey: TenantModuleKey): string {
  return `tenant_${clientId.replace(/-/g, '').slice(0, 24)}_${moduleKey}`;
}

export function tenantAppRole(clientId: string, moduleKey: TenantModuleKey): string {
  return `lilac_${clientId.replace(/-/g, '').slice(0, 24)}_${moduleKey}_app`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function tenantConnectionString(
  provisioningUrl: string,
  databaseName: string,
  role: string,
  password: string,
): string {
  const url = new URL(provisioningUrl);
  url.username = role;
  url.password = password;
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function provisioningConnectionString(provisioningUrl: string, databaseName: string): string {
  const url = new URL(provisioningUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export async function provisionTenantDatabase(
  input: {
    clientId: string;
    moduleKey: TenantModuleKey;
    migrationsRoot?: string;
  },
  kms: KmsProvider,
): Promise<ProvisionedDatabase> {
  const provisioningUrl = config.provisioningDatabaseUrl;
  if (!provisioningUrl) {
    throw new Error('PROVISIONING_DATABASE_URL is required to provision tenant databases.');
  }

  const dbName = tenantDatabaseName(input.clientId, input.moduleKey);
  const appRole = tenantAppRole(input.clientId, input.moduleKey);
  if (!DB_NAME_PATTERN.test(dbName) || !ROLE_NAME_PATTERN.test(appRole)) {
    throw new Error('Generated tenant database identifiers are invalid.');
  }
  const appPassword = randomBytes(32).toString('base64url');
  const admin = new Client({
    connectionString: provisioningUrl,
    application_name: 'lilac-tenant-provisioner',
  });

  await admin.connect();
  try {
    const role = await admin.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists',
      [appRole],
    );
    if (role.rows[0]?.exists) {
      await admin.query(
        `ALTER ROLE ${quoteIdentifier(appRole)}
           WITH LOGIN PASSWORD ${quoteLiteral(appPassword)}
           NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      );
    } else {
      await admin.query(
        `CREATE ROLE ${quoteIdentifier(appRole)}
           LOGIN PASSWORD ${quoteLiteral(appPassword)}
           NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      );
    }

    const database = await admin.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      [dbName],
    );
    if (!database.rows[0]?.exists) {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
    }
  } finally {
    await admin.end();
  }

  await migrateTenantDatabase({
    connectionString: provisioningConnectionString(provisioningUrl, dbName),
    clientId: input.clientId,
    moduleKey: input.moduleKey,
    appRole,
    appPassword,
    ...(input.migrationsRoot ? { migrationsRoot: input.migrationsRoot } : {}),
  });
  const connectionString = tenantConnectionString(
    provisioningUrl,
    dbName,
    appRole,
    appPassword,
  );
  const secretRef = await kms.encrypt(connectionString);
  const schemaVersion = await readTenantSchemaVersion(
    connectionString,
    input.clientId,
    input.moduleKey,
  );

  return { dbName, appRole, secretRef, schemaVersion };
}

async function readTenantSchemaVersion(
  connectionString: string,
  clientId: string,
  moduleKey: TenantModuleKey,
): Promise<string> {
  const tenant = new Client({
    connectionString,
    application_name: 'lilac-tenant-provisioner',
  });
  await tenant.connect();
  try {
    await tenant.query(
      `SELECT set_config('app.client_id', $1, false),
              set_config('app.module_key', $2, false)`,
      [clientId, moduleKey],
    );
    const result = await tenant.query<{ schema_version: string }>(
      'SELECT schema_version FROM tenant_meta WHERE id = 1',
    );
    const version = result.rows[0]?.schema_version;
    if (!version) {
      throw new Error('Tenant migration did not initialize its schema version.');
    }
    return version;
  } finally {
    await tenant.end();
  }
}

export async function dropTenantDatabase(databaseName: string): Promise<void> {
  if (!DB_NAME_PATTERN.test(databaseName)) {
    throw new Error('Tenant database identifier is invalid.');
  }
  const provisioningUrl = config.provisioningDatabaseUrl;
  if (!provisioningUrl) {
    throw new Error('PROVISIONING_DATABASE_URL is required to drop tenant databases.');
  }

  const admin = new Client({
    connectionString: provisioningUrl,
    application_name: 'lilac-tenant-deprovisioner',
  });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

export async function dropTenantAppRole(appRole: string): Promise<void> {
  if (!ROLE_NAME_PATTERN.test(appRole)) {
    throw new Error('Tenant application role identifier is invalid.');
  }
  const provisioningUrl = config.provisioningDatabaseUrl;
  if (!provisioningUrl) {
    throw new Error('PROVISIONING_DATABASE_URL is required to drop tenant roles.');
  }

  const admin = new Client({
    connectionString: provisioningUrl,
    application_name: 'lilac-tenant-deprovisioner',
  });
  await admin.connect();
  try {
    await admin.query(`DROP ROLE IF EXISTS ${quoteIdentifier(appRole)}`);
  } finally {
    await admin.end();
  }
}

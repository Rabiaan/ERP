import 'dotenv/config';
import {
  isTenantModuleKey,
  migrateTenantDatabase,
  type TenantModuleKey,
} from '../provisioning/migrate';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

async function main(): Promise<void> {
  const connectionString = requireEnv('TENANT_DATABASE_URL');
  const clientId = requireEnv('TENANT_CLIENT_ID');
  const moduleValue = requireEnv('TENANT_MODULE_KEY');
  const appRole = requireEnv('TENANT_APP_ROLE');
  const appPassword = process.env.TENANT_APP_PASSWORD?.trim() || undefined;

  if (!isTenantModuleKey(moduleValue)) {
    throw new Error('TENANT_MODULE_KEY must be one of hr, retail, school, accounts');
  }

  const moduleKey: TenantModuleKey = moduleValue;
  const result = await migrateTenantDatabase({
    connectionString,
    clientId,
    moduleKey,
    appRole,
    appPassword,
  });

  for (const version of result.skipped) {
    console.log(`skip    ${version}`);
  }
  for (const version of result.applied) {
    console.log(`applied ${version}`);
  }
  console.log(
    `tenant ${moduleKey} schema up to date (${result.applied.length} applied, ${result.skipped.length} skipped)`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`db:migrate:tenant failed: ${message}`);
  process.exitCode = 1;
});

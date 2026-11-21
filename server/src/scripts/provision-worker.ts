import 'dotenv/config';
import { config } from '../config';
import { PlatformDb } from '../db/platform';
import { LocalKmsProvider } from '../kms/local';
import { createPgDumpSnapshotter } from '../provisioning/snapshot';
import { createProvisioningAdapter, runReadyProvisioningJobs } from '../provisioning/service';

async function main(): Promise<void> {
  if (!config.provisioningDatabaseUrl) {
    throw new Error('PROVISIONING_DATABASE_URL must be configured for the provisioning worker.');
  }

  const platformDb = new PlatformDb({
    connectionString: config.platformDatabaseUrl,
    max: config.platformPoolMax,
    connectionTimeoutMillis: config.platformConnectionTimeoutMs,
  });
  const kms = new LocalKmsProvider(config.kmsLocalKey);
  const adapter = createProvisioningAdapter(kms, createPgDumpSnapshotter(kms));

  try {
    const processed = await runReadyProvisioningJobs(platformDb, adapter);
    console.log(`provisioning worker processed ${processed} job(s)`);
  } finally {
    await platformDb.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown provisioning worker failure.';
  console.error(`provisioning worker failed: ${message}`);
  process.exitCode = 1;
});

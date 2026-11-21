import { spawn } from 'node:child_process';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { KmsProvider } from '../kms/local';
import { config } from '../config';
import type { ProvisioningAdapter } from './service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNonEmptyFile(path: string): Promise<boolean> {
  return stat(path)
    .then((metadata) => metadata.isFile() && metadata.size > 0)
    .catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    });
}

function runCommand(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const process = spawn(command, args, {
      env: environment,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    process.stderr.on('data', () => undefined);
    process.once('error', () => {
      reject(new Error(`${command} could not be started.`));
    });
    process.once('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`pg_dump exited unsuccessfully (${code ?? 'unknown'}).`));
      }
    });
  });
}

async function runPgDump(
  args: string[],
  environment: NodeJS.ProcessEnv,
  temporaryPath: string,
): Promise<void> {
  const container = config.pgDumpDockerContainer;
  if (!container) {
    await runCommand('pg_dump', args, environment);
    return;
  }

  const containerFile = `/tmp/lilac-${randomUUID()}.dump`;
  const containerArgs = args.map((argument) => {
    if (argument.startsWith('--file=')) {
      return `--file=${containerFile}`;
    }
    if (argument.startsWith('--host=')) {
      return '--host=localhost';
    }
    if (argument.startsWith('--port=')) {
      return '--port=5432';
    }
    return argument;
  });

  try {
    await runCommand(
      'docker',
      ['exec', '--env', 'PGPASSWORD', container, 'pg_dump', ...containerArgs],
      environment,
    );
    await runCommand('docker', ['cp', `${container}:${containerFile}`, temporaryPath], environment);
  } finally {
    await runCommand('docker', ['exec', container, 'rm', '-f', containerFile], environment);
  }
}

export function createPgDumpSnapshotter(
  kms: KmsProvider,
  backupDirectory = config.backupDir,
): ProvisioningAdapter['snapshotTenant'] {
  return async ({ jobId, clientId, moduleKey, databaseName, secretRef }) => {
    if (
      !UUID_PATTERN.test(jobId) ||
      !UUID_PATTERN.test(clientId) ||
      !/^tenant_[a-z0-9_]{1,54}$/.test(databaseName)
    ) {
      throw new Error('Snapshot identifiers are invalid.');
    }

    const root = resolve(backupDirectory);
    const backupName = `${clientId}-${moduleKey}-${jobId}.dump`;
    const finalPath = resolve(root, backupName);
    if (basename(finalPath) !== backupName) {
      throw new Error('Snapshot path is invalid.');
    }
    if (await isNonEmptyFile(finalPath)) {
      return;
    }

    const rawConnectionString = await kms.decrypt(secretRef);
    let url: URL;
    try {
      url = new URL(rawConnectionString);
    } catch {
      throw new Error('Tenant database connection details are invalid.');
    }
    if (
      (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
      decodeURIComponent(url.pathname.slice(1)) !== databaseName
    ) {
      throw new Error('Tenant database connection details do not match the target.');
    }

    await mkdir(root, { recursive: true });
    const temporaryPath = `${finalPath}.${randomUUID()}.partial`;
    const query = url.searchParams;
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      PGPASSWORD: decodeURIComponent(url.password),
      PGOPTIONS: `-c app.client_id=${clientId} -c app.module_key=${moduleKey}`,
      ...(query.get('sslmode') ? { PGSSLMODE: query.get('sslmode')! } : {}),
      ...(query.get('sslrootcert') ? { PGSSLROOTCERT: query.get('sslrootcert')! } : {}),
      ...(query.get('sslcert') ? { PGSSLCERT: query.get('sslcert')! } : {}),
      ...(query.get('sslkey') ? { PGSSLKEY: query.get('sslkey')! } : {}),
    };
    const args = [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--enable-row-security',
      '--exclude-table=public.__migrations',
      `--file=${temporaryPath}`,
      `--host=${url.hostname}`,
      `--port=${url.port || '5432'}`,
      `--username=${decodeURIComponent(url.username)}`,
      `--dbname=${databaseName}`,
    ];

    try {
      await runPgDump(args, environment, temporaryPath);
      if (!(await isNonEmptyFile(temporaryPath))) {
        throw new Error('pg_dump did not produce a valid snapshot.');
      }
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    } finally {
      delete environment.PGPASSWORD;
    }
  };
}

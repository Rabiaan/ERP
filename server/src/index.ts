import { createServer, type Server } from 'node:http';
import type { Express } from 'express';
import { createApp } from './app';
import { config } from './config';
import { PlatformDb } from './db/platform';
import { TenantPoolRegistry } from './db/registry';
import { AppError } from './http/errors';
import { logger } from './http/log';
import { LocalKmsProvider } from './kms/local';

const version = process.env.npm_package_version ?? '0.1.0';
const startedAt = Date.now();

function listen(app: Express, port: number, host: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);

    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = (): void => {
      server.off('error', onError);
      resolve(server);
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

async function checkPlatformDatabase(platformDb: PlatformDb): Promise<void> {
  try {
    await platformDb.ping();
    logger.info('platform.database.ready');
  } catch (error) {
    if (config.bootStrict) {
      throw new AppError('SERVICE_UNAVAILABLE', 'Platform database is unavailable at boot.');
    }
    logger.warn('platform.database.unavailable', { error });
  }
}

async function main(): Promise<void> {
  const kms = new LocalKmsProvider(config.kmsLocalKey);
  const platformDb = new PlatformDb({
    connectionString: config.platformDatabaseUrl,
    max: config.platformPoolMax,
    connectionTimeoutMillis: config.platformConnectionTimeoutMs,
  });

  let registry: TenantPoolRegistry | undefined;
  let server: Server | undefined;
  let shuttingDown = false;

  const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.info('api.shutdown.start', { signal });

    const force = setTimeout(() => {
      logger.error('api.shutdown.timeout');
      process.exit(1);
    }, 10000);
    force.unref();

    if (server) {
      await new Promise<void>((resolve) => {
        server?.close(() => resolve());
        server?.closeIdleConnections();
      });
    }

    if (registry) {
      await registry.closeAll();
    }
    await platformDb.end();

    clearTimeout(force);
    logger.info('api.shutdown.complete');
    process.exit(exitCode);
  };

  try {
    await checkPlatformDatabase(platformDb);

    registry = new TenantPoolRegistry({
      platformDb,
      kms,
      maxPerTenant: config.tenantPoolMax,
      globalMax: config.tenantPoolGlobalMax,
      idleMs: config.tenantPoolIdleMs,
      cacheTtlMs: config.tenantRegistryCacheTtlMs,
      connectionTimeoutMs: config.tenantConnectionTimeoutMs,
      defaultStatementTimeoutMs: config.tenantStatementTimeoutMs,
    });

    const app = createApp({
      platformDb,
      registry,
      kms,
      startedAt,
      version,
    });

    server = await listen(app, config.port, config.host);

    logger.info('api.listening', {
      host: config.host,
      port: config.port,
      env: config.nodeEnv,
      bootStrict: config.bootStrict,
    });

    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
    process.once('uncaughtException', (error) => {
      logger.error('process.uncaught_exception', { error });
      void shutdown('uncaughtException', 1);
    });
    process.once('unhandledRejection', (reason) => {
      logger.error('process.unhandled_rejection', { error: reason });
      void shutdown('unhandledRejection', 1);
    });
  } catch (error) {
    logger.error('api.start.failed', { error });

    if (server) {
      await new Promise<void>((resolve) => {
        server?.close(() => resolve());
      });
    }
    if (registry) {
      await registry.closeAll();
    }
    await platformDb.end();

    throw error;
  }
}

main().catch(() => {
  process.exitCode = 1;
});

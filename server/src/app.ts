import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { createAuthRouter } from './auth/routes';
import { config } from './config';
import type { PlatformDb } from './db/platform';
import type { TenantPoolRegistry } from './db/registry';
import { asyncHandler } from './http/errors';
import {
  errorHandler,
  jsonBody,
  notFound,
  requestId,
  requestLogger,
  securityHeaders,
  urlEncodedBody,
} from './http/middleware';
import type { KmsProvider } from './kms/local';
import { strictCors } from './security/cors';
import { createPlatformRouter } from './routes/platform';
import { createWorkspaceRouter } from './routes/workspace';

export type AppDependencies = {
  platformDb: PlatformDb;
  registry: TenantPoolRegistry;
  kms: KmsProvider;
  startedAt: number;
  version: string;
};

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(requestId);
  app.use(securityHeaders);
  app.use(strictCors);
  app.use(requestLogger);
  app.use(cookieParser());
  app.use(jsonBody);
  app.use(urlEncodedBody);

  app.get(
    '/api/health',
    asyncHandler(async (req, res) => {
      let database: 'up' | 'down' = 'down';

      try {
        await dependencies.platformDb.ping();
        database = 'up';
      } catch (error) {
        req.log.warn('health.database.down', { error });
      }

      const healthy = database === 'up';

      res
        .status(healthy ? 200 : 503)
        .set('Cache-Control', 'no-store')
        .json({
          status: healthy ? 'ok' : 'degraded',
          service: 'lilac-office',
          version: dependencies.version,
          uptimeSeconds: Math.max(0, Math.floor((Date.now() - dependencies.startedAt) / 1000)),
          checks: {
            platformDatabase: database,
          },
          pools: {
            tenants: dependencies.registry.poolCount,
          },
          timestamp: new Date().toISOString(),
        });
    }),
  );

  app.use('/api/auth', createAuthRouter(dependencies.platformDb, dependencies.kms));
  app.use('/api/platform', createPlatformRouter(dependencies.platformDb, dependencies.registry));
  app.use('/api/workspace', createWorkspaceRouter(dependencies.platformDb, dependencies.registry));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

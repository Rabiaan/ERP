import type { RequestHandler } from 'express';
import type { PlatformDb } from '../db/platform';
import type { TenantPoolRegistry } from '../db/registry';
import { AppError } from '../http/errors';
import { MODULE_KEYS, type ModuleKey } from '../authz/catalog';
import { resolveTenantContext } from './resolve';

function isModuleKey(value: string | undefined): value is ModuleKey {
  return value !== undefined && (MODULE_KEYS as readonly string[]).includes(value);
}

export function requireTenantContext(
  platformDb: PlatformDb,
  registry: TenantPoolRegistry,
  moduleParam = 'module',
): RequestHandler {
  return (req, _res, next) => {
    const moduleKey = req.params[moduleParam];
    if (!isModuleKey(moduleKey)) {
      next(new AppError('NOT_FOUND'));
      return;
    }
    if (!req.auth) {
      next(new AppError('UNAUTHENTICATED'));
      return;
    }

    void resolveTenantContext(platformDb, registry, req.auth, moduleKey)
      .then((context) => {
        req.tenantContext = context;
        next();
      })
      .catch(next);
  };
}

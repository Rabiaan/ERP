import type { RequestHandler } from 'express';
import type { PermissionKey } from './catalog';
import { AppError } from '../http/errors';
import type { TenantRequestContext } from '../tenancy/context';

function isReadOnlyMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

export function assertRequestPermission(
  context: TenantRequestContext | undefined,
  method: string,
  permission: PermissionKey,
  options: { destructive?: boolean } = {},
): void {
  if (!context) {
    throw new AppError('FORBIDDEN', 'A resolved tenant context is required.');
  }

  if (context.actor.kind === 'platform') {
    if (context.actor.mode === 'inspect' && !isReadOnlyMethod(method)) {
      throw new AppError('FORBIDDEN', 'Inspect access is read-only.', { mode: 'inspect' });
    }
    if (context.actor.mode === 'support' && options.destructive) {
      throw new AppError('FORBIDDEN', 'This destructive action is unavailable during support access.');
    }
    if (context.archived && !isReadOnlyMethod(method)) {
      throw new AppError('MODULE_ARCHIVED');
    }
    return;
  }

  if (!context.permissions.has(permission)) {
    throw new AppError('FORBIDDEN', 'The required permission is not granted.', {
      permission,
    });
  }
}

export function requirePermission(
  permission: PermissionKey,
  options: { destructive?: boolean } = {},
): RequestHandler {
  return (req, _res, next) => {
    try {
      assertRequestPermission(req.tenantContext, req.method, permission, options);
      next();
    } catch (error) {
      next(error);
    }
  };
}

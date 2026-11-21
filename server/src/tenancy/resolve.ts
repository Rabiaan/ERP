import type { Pool } from 'pg';
import type { AuthContext } from '../auth/types';
import type { ModuleKey } from '../authz/catalog';
import { resolveMembershipPermissions } from '../authz/resolver';
import type { PlatformDb } from '../db/platform';
import type { TenantPoolRegistry } from '../db/registry';
import { AppError } from '../http/errors';
import type { PlatformOverrideActor, TenantRequestContext } from './context';

type ModuleStatusRow = {
  status: string;
};

export async function resolveTenantContext(
  platformDb: PlatformDb,
  registry: TenantPoolRegistry,
  auth: AuthContext,
  moduleKey: ModuleKey,
): Promise<TenantRequestContext> {
  if (
    auth.realm !== 'tenant' ||
    auth.claims.actor_type !== 'tenant' ||
    !auth.claims.client_id ||
    !auth.claims.active_module ||
    auth.claims.active_module !== moduleKey
  ) {
    throw new AppError('FORBIDDEN', 'This session is not scoped to the requested module.');
  }

  const permissions = await resolveMembershipPermissions(platformDb, {
    userId: auth.userId,
    clientId: auth.claims.client_id,
    moduleKey,
  });
  const pool = await registry.getPool(auth.claims.client_id, moduleKey);

  return {
    clientId: auth.claims.client_id,
    moduleKey,
    pool,
    permissions: permissions.permissions,
    permissionsHash: permissions.hash,
    archived: false,
    actor: {
      kind: 'tenant',
      userId: auth.userId,
      membershipId: permissions.membershipId,
    },
  };
}

export async function resolvePlatformOverrideContext(
  platformDb: PlatformDb,
  registry: TenantPoolRegistry,
  auth: AuthContext,
  input: {
    accessId: string;
    clientId: string;
    moduleKey: ModuleKey;
  },
): Promise<TenantRequestContext> {
  if (
    auth.realm !== 'platform' ||
    auth.claims.actor_type !== 'platform' ||
    auth.userId !== auth.claims.sub
  ) {
    throw new AppError('FORBIDDEN', 'Platform authentication is required for module override.');
  }

  const result = await platformDb.query<
    ModuleStatusRow & {
      mode: 'inspect' | 'support';
      reason: string;
    }
  >(
    `SELECT access.mode,
            access.reason,
            client_modules.status
       FROM platform_module_access access
       JOIN platform_users platform_user
         ON platform_user.id = access.platform_user_id
        AND platform_user.status = 'active'
       JOIN clients client
         ON client.id = access.client_id
        AND client.status = 'active'
        AND client.deleted_at IS NULL
       JOIN client_modules
         ON client_modules.client_id = access.client_id
        AND client_modules.module_key = access.module_key
      WHERE access.id = $1
        AND access.platform_user_id = $2
        AND access.client_id = $3
        AND access.module_key = $4
        AND access.ended_at IS NULL
        AND access.revoked_at IS NULL
        AND access.expires_at > now()`,
    [input.accessId, auth.userId, input.clientId, input.moduleKey],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('FORBIDDEN', 'The platform module access is invalid or expired.');
  }
  if (row.status === 'provisioning') {
    throw new AppError('MODULE_PROVISIONING');
  }
  if (row.status === 'disabled') {
    throw new AppError('MODULE_NOT_ENABLED');
  }
  if (row.status === 'archived' && row.mode !== 'inspect') {
    throw new AppError('MODULE_ARCHIVED');
  }
  if (row.status !== 'active' && row.status !== 'archived') {
    throw new AppError('MODULE_NOT_ENABLED');
  }

  const pool: Pool = await registry.getPool(input.clientId, input.moduleKey);
  const actor: PlatformOverrideActor = {
    kind: 'platform',
    userId: auth.userId,
    accessId: input.accessId,
    mode: row.mode,
    reason: row.reason,
  };

  return {
    clientId: input.clientId,
    moduleKey: input.moduleKey,
    pool,
    permissions: new Set(),
    permissionsHash: '',
    archived: row.status === 'archived',
    actor,
  };
}

import type { Pool } from 'pg';
import type { ModuleKey, PermissionKey } from '../authz/catalog';

export type TenantActor = {
  kind: 'tenant';
  userId: string;
  membershipId: string;
};

export type PlatformOverrideActor = {
  kind: 'platform';
  userId: string;
  accessId: string;
  mode: 'inspect' | 'support';
  reason: string;
};

export type TenantRequestContext = {
  clientId: string;
  moduleKey: ModuleKey;
  pool: Pool;
  permissions: ReadonlySet<PermissionKey>;
  permissionsHash: string;
  archived: boolean;
  actor: TenantActor | PlatformOverrideActor;
};

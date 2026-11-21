import { createHash } from 'node:crypto';
import type { PlatformDb } from '../db/platform';
import { AppError } from '../http/errors';
import { PERMISSION_CATALOG, type ModuleKey, type PermissionKey } from './catalog';

const MAX_DELEGATION_DEPTH = 4;
const CATALOG = new Set<string>(PERMISSION_CATALOG);

export type MembershipGrantRow = {
  id: string;
  client_id: string;
  status: string;
  depth: number;
  direct_permissions: string[];
};

export type EffectivePermissionSet = {
  permissions: ReadonlySet<PermissionKey>;
  hash: string;
};

export function resolveEffectivePermissions(
  chain: readonly MembershipGrantRow[],
  enabledModules: readonly string[],
  options: { hasCycle?: boolean; tooDeep?: boolean; crossClient?: boolean } = {},
): EffectivePermissionSet {
  const empty = new Set<PermissionKey>();
  const emptyHash = hashPermissions(empty);
  if (
    chain.length === 0 ||
    options.hasCycle ||
    options.tooDeep ||
    options.crossClient ||
    chain.some((membership) => membership.status !== 'active')
  ) {
    return { permissions: empty, hash: emptyHash };
  }

  const ordered = [...chain].sort((left, right) => left.depth - right.depth);
  let allowed = new Set(
    ordered[0]!.direct_permissions.filter((key): key is PermissionKey => CATALOG.has(key)),
  );

  for (const ancestor of ordered.slice(1)) {
    const ancestorGrants = new Set(ancestor.direct_permissions);
    allowed = new Set([...allowed].filter((key) => ancestorGrants.has(key)));
  }

  const enabled = new Set(enabledModules);
  const permissions = new Set(
    [...allowed].filter((key) => {
      const namespace = key.split('.')[0];
      return namespace === 'administration' || enabled.has(namespace!);
    }),
  );

  const sortedPermissions = new Set([...permissions].sort());
  return { permissions: sortedPermissions, hash: hashPermissions(sortedPermissions) };
}

export function hashPermissions(permissions: Iterable<string>): string {
  const sorted = [...new Set(permissions)].sort();
  return createHash('sha256').update(sorted.join('\n'), 'utf8').digest('hex').slice(0, 16);
}

export function assertCanGrantPermissions(input: {
  actorMembershipId: string;
  targetMembershipId?: string;
  requested: readonly PermissionKey[];
  actorPermissions: ReadonlySet<PermissionKey>;
}): void {
  if (input.targetMembershipId && input.actorMembershipId === input.targetMembershipId) {
    throw new AppError('FORBIDDEN', 'A membership cannot change its own grants.');
  }

  const escalation = input.requested.filter((permission) => !input.actorPermissions.has(permission));
  if (escalation.length > 0) {
    throw new AppError('PERMISSION_ESCALATION', undefined, { permissions: escalation });
  }
}

export function assertClientAdminCanBeChanged(input: {
  currentRole: string;
  nextRole?: string;
  nextStatus?: string;
  activeClientAdminCount: number;
}): void {
  const removesActiveAdmin =
    input.currentRole === 'client_admin' &&
    ((input.nextRole !== undefined && input.nextRole !== 'client_admin') ||
      (input.nextStatus !== undefined && input.nextStatus !== 'active'));

  if (removesActiveAdmin && input.activeClientAdminCount <= 1) {
    throw new AppError('CONFLICT', 'The last active client administrator cannot be removed.');
  }
}

type EntitlementRow = {
  client_status: string;
  module_status: string | null;
  enabled_modules: string[];
};

type MembershipRow = {
  id: string;
  client_id: string;
  status: string;
  depth: number;
  direct_permissions: string[];
  has_cycle: boolean;
  too_deep: boolean;
  cross_client: boolean;
};

type UserMembershipChainRow = MembershipRow & {
  target_membership_id: string;
  target_client_id: string;
  target_module_key: ModuleKey;
  enabled_modules: string[];
};

export async function resolveUserMembershipPermissionHashes(
  platformDb: Pick<PlatformDb, 'query'>,
  userId: string,
): Promise<Map<string, string>> {
  const result = await platformDb.query<UserMembershipChainRow>(
    `WITH RECURSIVE membership_chain AS (
       SELECT target.id AS target_membership_id,
              target.client_id AS target_client_id,
              target.module_key AS target_module_key,
              target.id AS id,
              target.client_id,
              target.status,
              target.created_by_membership_id,
              0 AS depth,
              ARRAY[target.id] AS path
         FROM memberships target
         JOIN clients client
           ON client.id = target.client_id
          AND client.status = 'active'
          AND client.deleted_at IS NULL
         JOIN client_modules module
           ON module.client_id = target.client_id
          AND module.module_key = target.module_key
          AND module.status = 'active'
        WHERE target.user_id = $1
          AND target.status = 'active'
       UNION ALL
       SELECT child.target_membership_id,
              child.target_client_id,
              child.target_module_key,
              parent.id,
              parent.client_id,
              parent.status,
              parent.created_by_membership_id,
              child.depth + 1,
              child.path || parent.id
         FROM membership_chain child
         JOIN memberships parent ON parent.id = child.created_by_membership_id
        WHERE child.depth < $2
          AND NOT parent.id = ANY(child.path)
     )
     SELECT chain.id::text,
            chain.client_id::text,
            chain.status,
            chain.depth,
            chain.target_membership_id::text,
            chain.target_client_id::text,
            chain.target_module_key,
            COALESCE(
              array_agg(DISTINCT grants.permission_key)
                FILTER (WHERE grants.permission_key IS NOT NULL),
              ARRAY[]::text[]
            ) AS direct_permissions,
            ARRAY(
              SELECT enabled.module_key
                FROM client_modules enabled
               WHERE enabled.client_id = chain.target_client_id
                 AND enabled.status = 'active'
            ) AS enabled_modules,
            EXISTS (
              SELECT 1
                FROM membership_chain node
                JOIN memberships parent ON parent.id = node.created_by_membership_id
               WHERE node.target_membership_id = chain.target_membership_id
                 AND parent.id = ANY(node.path)
            ) AS has_cycle,
            EXISTS (
              SELECT 1
                FROM membership_chain node
               WHERE node.target_membership_id = chain.target_membership_id
                 AND node.depth = $2
                 AND node.created_by_membership_id IS NOT NULL
            ) AS too_deep,
            bool_or(chain.client_id <> chain.target_client_id) AS cross_client
       FROM membership_chain chain
       LEFT JOIN role_grants grants ON grants.membership_id = chain.id
      GROUP BY chain.id, chain.client_id, chain.status, chain.depth,
               chain.target_membership_id, chain.target_client_id, chain.target_module_key
      ORDER BY chain.target_membership_id, chain.depth`,
    [userId, MAX_DELEGATION_DEPTH],
  );
  const grouped = new Map<string, UserMembershipChainRow[]>();
  for (const row of result.rows) {
    const chain = grouped.get(row.target_membership_id) ?? [];
    chain.push(row);
    grouped.set(row.target_membership_id, chain);
  }

  const hashes = new Map<string, string>();
  for (const [membershipId, chain] of grouped) {
    const head = chain[0]!;
    const effective = resolveEffectivePermissions(
      chain,
      head.enabled_modules,
      {
        hasCycle: chain.some((row) => row.has_cycle),
        tooDeep: chain.some((row) => row.too_deep),
        crossClient: chain.some((row) => row.cross_client),
      },
    );
    hashes.set(membershipId, effective.hash);
  }
  return hashes;
}

export async function resolveMembershipPermissions(
  platformDb: Pick<PlatformDb, 'query'>,
  input: { userId: string; clientId: string; moduleKey: ModuleKey },
): Promise<EffectivePermissionSet & { membershipId: string }> {
  const entitlement = await platformDb.query<EntitlementRow>(
    `SELECT c.status AS client_status,
            cm.status AS module_status,
            ARRAY(
              SELECT enabled.module_key
                FROM client_modules enabled
               WHERE enabled.client_id = c.id
                 AND enabled.status = 'active'
            ) AS enabled_modules
       FROM clients c
       LEFT JOIN client_modules cm
         ON cm.client_id = c.id
        AND cm.module_key = $2
      WHERE c.id = $1
        AND c.deleted_at IS NULL`,
    [input.clientId, input.moduleKey],
  );
  const entitlementRow = entitlement.rows[0];
  if (!entitlementRow) {
    throw new AppError('NOT_FOUND', 'The requested client was not found.');
  }
  if (entitlementRow.client_status !== 'active') {
    throw new AppError('MODULE_NOT_ENABLED');
  }
  if (entitlementRow.module_status === 'provisioning') {
    throw new AppError('MODULE_PROVISIONING');
  }
  if (entitlementRow.module_status === 'archived') {
    throw new AppError('MODULE_ARCHIVED');
  }
  if (entitlementRow.module_status !== 'active') {
    throw new AppError('MODULE_NOT_ENABLED');
  }

  const result = await platformDb.query<MembershipRow>(
    `WITH RECURSIVE membership_chain AS (
       SELECT m.id,
              m.client_id,
              m.status,
              m.created_by_membership_id,
              0 AS depth,
              ARRAY[m.id] AS path
         FROM memberships m
        WHERE m.user_id = $1
          AND m.client_id = $2
          AND m.module_key = $3
       UNION ALL
       SELECT parent.id,
              parent.client_id,
              parent.status,
              parent.created_by_membership_id,
              child.depth + 1,
              child.path || parent.id
         FROM membership_chain child
         JOIN memberships parent ON parent.id = child.created_by_membership_id
        WHERE child.depth < $4
          AND NOT parent.id = ANY(child.path)
     )
     SELECT chain.id::text,
            chain.client_id::text,
            chain.status,
            chain.depth,
            COALESCE(
              array_agg(DISTINCT grants.permission_key)
                FILTER (WHERE grants.permission_key IS NOT NULL),
              ARRAY[]::text[]
            ) AS direct_permissions,
            EXISTS (
              SELECT 1
                FROM membership_chain node
                JOIN memberships parent ON parent.id = node.created_by_membership_id
               WHERE parent.id = ANY(node.path)
            ) AS has_cycle,
            EXISTS (
              SELECT 1
                FROM membership_chain node
               WHERE node.depth = $4
                 AND node.created_by_membership_id IS NOT NULL
            ) AS too_deep,
            bool_or(chain.client_id <> $2::uuid) AS cross_client
       FROM membership_chain chain
       LEFT JOIN role_grants grants ON grants.membership_id = chain.id
      GROUP BY chain.id, chain.client_id, chain.status, chain.depth
      ORDER BY chain.depth`,
    [input.userId, input.clientId, input.moduleKey, MAX_DELEGATION_DEPTH],
  );

  if (result.rows.length === 0) {
    throw new AppError('FORBIDDEN', 'An active membership is required for this module.');
  }

  const rows = result.rows;
  const head = rows[0]!;
  if (head.status !== 'active') {
    throw new AppError('FORBIDDEN', 'The membership is not active.');
  }
  const resolved = resolveEffectivePermissions(
    rows,
    entitlementRow.enabled_modules,
    {
      hasCycle: rows.some((row) => row.has_cycle),
      tooDeep: rows.some((row) => row.too_deep),
      crossClient: rows.some((row) => row.cross_client),
    },
  );

  return { ...resolved, membershipId: head.id };
}

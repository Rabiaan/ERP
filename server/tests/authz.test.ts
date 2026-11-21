import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  expandPermissionKeys,
  PERMISSION_CATALOG,
  permissionsForPreset,
} from '../src/authz/catalog';
import { assertRequestPermission } from '../src/authz/guard';
import {
  assertClientAdminCanBeChanged,
  assertCanGrantPermissions,
  hashPermissions,
  resolveEffectivePermissions,
  type MembershipGrantRow,
} from '../src/authz/resolver';
import { sanitizeAuditValue } from '../src/audit/sanitize';
import type { TenantRequestContext } from '../src/tenancy/context';

function membership(
  id: string,
  depth: number,
  direct_permissions: string[],
  overrides: Partial<MembershipGrantRow> = {},
): MembershipGrantRow {
  return {
    id,
    client_id: 'client-a',
    status: 'active',
    depth,
    direct_permissions,
    ...overrides,
  };
}

function context(
  overrides: Partial<TenantRequestContext> = {},
): TenantRequestContext {
  return {
    clientId: '00000000-0000-4000-8000-000000000001',
    moduleKey: 'retail',
    pool: null as unknown as TenantRequestContext['pool'],
    permissions: new Set(['retail.products.view', 'retail.products.update']),
    permissionsHash: 'hash',
    archived: false,
    actor: {
      kind: 'tenant',
      userId: 'user-a',
      membershipId: 'membership-a',
    },
    ...overrides,
  };
}

test('permission catalog and SQL migration contain the same keys', async () => {
  const migration = await readFile(
    resolve('db/migrations/platform/0007_permission_catalog.sql'),
    'utf8',
  );
  const seeded = [...migration.matchAll(/'([a-z_]+\.[a-z_]+\.[a-z_]+)'/g)].map(
    (match) => match[1]!,
  );

  assert.deepEqual([...new Set(seeded)].sort(), [...PERMISSION_CATALOG].sort());
});

test('wildcards expand to enabled concrete keys and reject platform or disabled grants', () => {
  const retail = expandPermissionKeys(['retail.*'], { enabledModules: ['retail'] });
  assert.ok(retail.length > 0);
  assert.ok(retail.every((key) => key.startsWith('retail.')));
  assert.ok(retail.every((key) => !key.endsWith('.*')));

  assert.throws(
    () => expandPermissionKeys(['platform.*'], { enabledModules: ['retail'] }),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'PERMISSION_ESCALATION',
  );
  assert.throws(
    () => expandPermissionKeys(['hr.employees.view'], { enabledModules: ['retail'] }),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'PERMISSION_ESCALATION',
  );
});

test('role presets expand only to intended module and administration keys', () => {
  const viewer = permissionsForPreset('viewer', ['retail']);
  const manager = permissionsForPreset('manager', ['retail']);
  const moduleAdmin = permissionsForPreset('module_admin', ['retail']);
  const clientAdmin = permissionsForPreset('client_admin', ['retail']);

  assert.ok(viewer.includes('retail.products.view'));
  assert.ok(viewer.includes('retail.reports.export'));
  assert.ok(!viewer.includes('administration.users.manage'));
  assert.ok(manager.includes('retail.invoices.approve'));
  assert.ok(manager.includes('retail.products.delete'));
  assert.ok(moduleAdmin.includes('retail.banks.manage'));
  assert.ok(moduleAdmin.includes('administration.audit.view'));
  assert.ok(clientAdmin.includes('administration.users.manage'));
  assert.ok(!clientAdmin.some((key) => key.startsWith('hr.')));
});

test('delegated permissions intersect with every active creator grant and entitlement', () => {
  const resolved = resolveEffectivePermissions(
    [
      membership('child', 0, [
        'retail.products.view',
        'retail.products.create',
        'hr.employees.view',
      ]),
      membership('parent', 1, ['retail.products.view', 'hr.employees.view']),
    ],
    ['retail'],
  );

  assert.deepEqual([...resolved.permissions], ['retail.products.view']);
  assert.equal(resolved.hash, hashPermissions(['retail.products.view']));
});

test('revocation, inactive creators, cycles, and excessive depth fail closed', () => {
  const rows = [
    membership('child', 0, ['retail.products.view']),
    membership('parent', 1, ['retail.products.view']),
  ];

  assert.deepEqual(
    [...resolveEffectivePermissions(rows, ['retail'], { crossClient: true }).permissions],
    [],
  );
  assert.deepEqual(
    [
      ...resolveEffectivePermissions(
        [rows[0]!, membership('parent', 1, [], { status: 'suspended' })],
        ['retail'],
      ).permissions,
    ],
    [],
  );
  assert.deepEqual(
    [...resolveEffectivePermissions(rows, ['retail'], { hasCycle: true }).permissions],
    [],
  );
  assert.deepEqual(
    [...resolveEffectivePermissions(rows, ['retail'], { tooDeep: true }).permissions],
    [],
  );
  assert.deepEqual(
    [
      ...resolveEffectivePermissions(
        [rows[0]!, membership('parent', 1, [])],
        ['retail'],
      ).permissions,
    ],
    [],
  );
});

test('grant validation blocks self-edits and permission escalation', () => {
  assert.throws(
    () =>
      assertCanGrantPermissions({
        actorMembershipId: 'same',
        targetMembershipId: 'same',
        requested: ['retail.products.view'],
        actorPermissions: new Set(['retail.products.view']),
      }),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'FORBIDDEN',
  );
  assert.throws(
    () =>
      assertCanGrantPermissions({
        actorMembershipId: 'creator',
        targetMembershipId: 'subordinate',
        requested: ['retail.products.delete'],
        actorPermissions: new Set(['retail.products.view']),
      }),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'PERMISSION_ESCALATION',
  );

  assert.throws(
    () =>
      assertClientAdminCanBeChanged({
        currentRole: 'client_admin',
        nextStatus: 'suspended',
        activeClientAdminCount: 1,
      }),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'CONFLICT',
  );
  assert.doesNotThrow(() =>
    assertClientAdminCanBeChanged({
      currentRole: 'client_admin',
      nextStatus: 'suspended',
      activeClientAdminCount: 2,
    }),
  );
});

test('tenant guards enforce permissions and platform inspect mode blocks writes', () => {
  assert.throws(
    () =>
      assertRequestPermission(
        context({ permissions: new Set(['retail.products.view']) }),
        'PATCH',
        'retail.products.update',
      ),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'FORBIDDEN',
  );
  assert.throws(
    () =>
      assertRequestPermission(
        context({
          actor: {
            kind: 'platform',
            userId: 'platform-a',
            accessId: 'access-a',
            mode: 'inspect',
            reason: 'investigation',
          },
        }),
        'POST',
        'retail.products.create',
      ),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'FORBIDDEN',
  );

  assert.doesNotThrow(() =>
    assertRequestPermission(
      context({
        actor: {
          kind: 'platform',
          userId: 'platform-a',
          accessId: 'access-a',
          mode: 'inspect',
          reason: 'investigation',
        },
      }),
      'GET',
      'retail.products.view',
    ),
  );
});

test('audit snapshots redact secrets and reject cyclic structures', () => {
  assert.deepEqual(
    sanitizeAuditValue({
      email: 'person@example.test',
      password_hash: 'secret',
      nested: { csrf_token: 'csrf', count: 2 },
    }),
    { email: 'person@example.test', nested: { count: 2 } },
  );

  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.throws(
    () => sanitizeAuditValue(circular),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'VALIDATION_ERROR',
  );
});

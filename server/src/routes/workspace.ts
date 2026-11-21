import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { MODULE_ACCESS_COOKIE, readCookie } from '../auth/cookies';
import { requireCsrf } from '../auth/csrf';
import { requirePasswordChangeComplete, requireSession } from '../auth/middleware';
import { verifyModuleAccessToken } from '../auth/tokens';
import {
  assertCanGrantPermissions,
  assertClientAdminCanBeChanged,
  resolveMembershipPermissions,
} from '../authz/resolver';
import {
  expandPermissionKeys,
  MODULE_KEYS,
  permissionsForPreset,
  ROLE_PRESETS,
  type ModuleKey,
  type PermissionKey,
} from '../authz/catalog';
import { assertRequestPermission } from '../authz/guard';
import { writeModuleAudit, writePlatformAudit } from '../audit/writers';
import { config } from '../config';
import type { PlatformDb } from '../db/platform';
import type { TenantPoolRegistry } from '../db/registry';
import { withTenantTx } from '../db/tenant';
import { AppError, asyncHandler } from '../http/errors';
import {
  actionFor,
  getDescriptor,
  resourceNames,
  type ResourceAction,
  type ResourceDescriptor,
} from '../modules/descriptors';
import { saveUpload } from '../security/upload';
import type { TenantRequestContext } from '../tenancy/context';
import { resolvePlatformOverrideContext, resolveTenantContext } from '../tenancy/resolve';
import {
  approveExpense,
  approvePayRun,
  approvePurchaseReturn,
  approveRefund,
  decideLeaveRequest,
  duplicateInvoice,
  finalizeInvoice,
  postJournal,
  receivePurchase,
  rejectRefund,
} from '../workspace/flows';
import {
  createResource,
  deleteResource,
  getResource,
  listResource,
  parseListQuery,
  sendCsv,
  updateResource,
} from '../workspace/resources';

type Row = Record<string, unknown>;

const uuid = z.string().uuid();
const moduleKeySchema = z.enum(MODULE_KEYS);
const roleSchema = z.enum(ROLE_PRESETS);

const BRANCHES: ResourceDescriptor = {
  table: 'branches',
  permission: 'administration.branches',
  actions: { view: true, manage: true },
  search: ['name', 'code'],
  sort: ['id', 'created_at', 'updated_at', 'name', 'code'],
  filters: ['is_default'],
};

const TAX_CODES: ResourceDescriptor = {
  table: 'tax_codes',
  permission: 'administration.tax',
  actions: { view: true, manage: true },
  search: ['name', 'code'],
  sort: ['id', 'created_at', 'updated_at', 'name', 'code'],
  filters: ['is_inclusive'],
};

function body<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Request validation failed.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

function permission(value: string): PermissionKey {
  return value as PermissionKey;
}

function permissionKey(context: TenantRequestContext, descriptor: ResourceDescriptor, action: ResourceAction): PermissionKey {
  const resource = descriptor.permission;
  const resolved = actionFor(descriptor, action);
  return permission(resource.includes('.') ? `${resource}.${resolved}` : `${context.moduleKey}.${resource}.${resolved}`);
}

function parseModule(value: unknown): ModuleKey {
  return body(moduleKeySchema, value);
}

function requireModule(context: TenantRequestContext, expected: ModuleKey): void {
  if (context.moduleKey !== expected) {
    throw new AppError('NOT_FOUND', 'This workflow is not available in the selected module.');
  }
}

function isReadOnly(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

async function audit(
  platformDb: PlatformDb,
  req: Request,
  input: {
    action: string;
    entity: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
): Promise<void> {
  const context = req.tenantContext;
  if (!context) return;
  const base = {
    actorType: context.actor.kind,
    actorId: context.actor.userId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    before: input.before,
    after: input.after,
    reason: input.reason ?? (context.actor.kind === 'platform' ? context.actor.reason : null),
    ip: req.ip,
    userAgent: req.get('user-agent'),
    requestId: req.requestId,
    platformOverride: context.actor.kind === 'platform',
  };
  await writeModuleAudit(context, base);
  await writePlatformAudit(platformDb, {
    ...base,
    clientId: context.clientId,
    moduleKey: context.moduleKey,
  });
}

function workspaceAuth(platformDb: PlatformDb, registry: TenantPoolRegistry): RequestHandler {
  return (req, _res, next) => {
    void (async () => {
      const moduleToken = readCookie(req, MODULE_ACCESS_COOKIE) ?? req.get('x-module-access-token');
      const realm = moduleToken ? 'platform' : 'tenant';
      await new Promise<void>((resolve, reject) => {
        requireSession(platformDb, realm)(req, _res, (error?: unknown) => {
          if (error) reject(error);
          else resolve();
        });
      });

      if (moduleToken) {
        const claims = await verifyModuleAccessToken(moduleToken);
        if (claims.platformUserId !== req.auth?.userId) {
          throw new AppError('FORBIDDEN', 'The module access token belongs to another user.');
        }
        const requested = req.params.module ? parseModule(req.params.module) : claims.moduleKey;
        if (requested !== claims.moduleKey) {
          throw new AppError('FORBIDDEN', 'The module access token is scoped to another module.');
        }
        req.tenantContext = await resolvePlatformOverrideContext(platformDb, registry, req.auth!, {
          accessId: claims.accessId,
          clientId: claims.clientId,
          moduleKey: parseModule(claims.moduleKey),
        });
        return;
      }

      const active = req.auth!.claims.active_module ?? req.auth!.claims.memberships[0]?.module_key;
      const module = req.params.module ? parseModule(req.params.module) : parseModule(active);
      req.tenantContext = await resolveTenantContext(platformDb, registry, req.auth!, module);
    })().then(() => next()).catch(next);
  };
}

const csrfForMutations: RequestHandler = (req, res, next) => {
  if (isReadOnly(req.method)) {
    next();
    return;
  }
  requireCsrf(req, res, next);
};

function context(req: Request): TenantRequestContext {
  if (!req.tenantContext) throw new AppError('FORBIDDEN');
  return req.tenantContext;
}

function assertPermission(req: Request, key: PermissionKey, destructive = false): void {
  assertRequestPermission(context(req), req.method, key, { destructive });
}

async function enabledModules(platformDb: PlatformDb, clientId: string): Promise<ModuleKey[]> {
  const result = await platformDb.query<{ module_key: ModuleKey }>(
    `SELECT module_key FROM client_modules
      WHERE client_id = $1 AND status = 'active' ORDER BY module_key`,
    [clientId],
  );
  return result.rows.map((row) => row.module_key);
}

async function actorMembershipId(platformDb: PlatformDb, ctx: TenantRequestContext): Promise<string | undefined> {
  if (ctx.actor.kind === 'tenant') return ctx.actor.membershipId;
  const result = await platformDb.query<{ id: string }>(
    `SELECT id::text FROM memberships
      WHERE user_id = $1 AND client_id = $2 AND module_key = $3 AND status = 'active'
      ORDER BY created_at DESC LIMIT 1`,
    [ctx.actor.userId, ctx.clientId, ctx.moduleKey],
  );
  return result.rows[0]?.id;
}

async function dashboardCards(ctx: TenantRequestContext): Promise<Row[]> {
  const module = ctx.moduleKey;
  let cards: Array<{ key: string; label: string; value: unknown; permission: string; href: string }>;

  if (module === 'retail') {
    const result = await withTenantTx(ctx.pool, ctx, async (client) => {
      const query = await client.query<Row>(
        `SELECT
           (SELECT count(*)::int FROM products WHERE deleted_at IS NULL) AS products,
           (SELECT count(*)::int FROM product_stock ps
              JOIN products p ON p.id = ps.product_id
             WHERE ps.deleted_at IS NULL AND ps.quantity <= p.reorder_level) AS low_stock,
           (SELECT count(*)::int FROM invoices WHERE status = 'draft' AND deleted_at IS NULL) AS draft_invoices,
           (SELECT count(*)::int FROM refunds WHERE status = 'pending' AND deleted_at IS NULL) AS pending_refunds,
           (SELECT count(*)::int FROM customers WHERE deleted_at IS NULL) AS customers,
           (SELECT coalesce(sum(total), 0)::text FROM invoices
             WHERE status IN ('finalized', 'paid') AND deleted_at IS NULL) AS sales_total`,
      );
      return query.rows[0]!;
    });
    cards = [
      { key: 'products', label: 'Products', value: result.products, permission: 'retail.products.view', href: '/w/retail/products' },
      { key: 'low_stock', label: 'Low stock items', value: result.low_stock, permission: 'retail.stock.view', href: '/w/retail/stock' },
      { key: 'draft_invoices', label: 'Draft invoices', value: result.draft_invoices, permission: 'retail.invoices.view', href: '/w/retail/invoices' },
      { key: 'pending_refunds', label: 'Pending refunds', value: result.pending_refunds, permission: 'retail.refunds.view', href: '/w/retail/refunds' },
      { key: 'customers', label: 'Customers', value: result.customers, permission: 'retail.customers.view', href: '/w/retail/customers' },
      { key: 'sales_total', label: 'Sales total', value: result.sales_total, permission: 'retail.sales.view', href: '/w/retail/sales' },
    ];
  } else if (module === 'hr') {
    const result = await withTenantTx(ctx.pool, ctx, async (client) => {
      const query = await client.query<Row>(
        `SELECT
           (SELECT count(*)::int FROM employees WHERE deleted_at IS NULL) AS employees,
           (SELECT count(*)::int FROM attendance
             WHERE date = current_date AND status = 'present' AND deleted_at IS NULL) AS attendance_today,
           (SELECT count(*)::int FROM leave_requests WHERE status = 'pending' AND deleted_at IS NULL) AS leave_pending,
           (SELECT count(*)::int FROM pay_runs WHERE status IN ('draft', 'processing') AND deleted_at IS NULL) AS pay_runs,
           (SELECT count(*)::int FROM job_openings WHERE status = 'open' AND deleted_at IS NULL) AS open_roles`,
      );
      return query.rows[0]!;
    });
    cards = [
      { key: 'employees', label: 'Employees', value: result.employees, permission: 'hr.employees.view', href: '/w/hr/employees' },
      { key: 'attendance_today', label: 'Present today', value: result.attendance_today, permission: 'hr.attendance.view', href: '/w/hr/attendance' },
      { key: 'leave_pending', label: 'Pending leave', value: result.leave_pending, permission: 'hr.leave.view', href: '/w/hr/leave-requests' },
      { key: 'pay_runs', label: 'Open pay runs', value: result.pay_runs, permission: 'hr.payroll.view', href: '/w/hr/pay-runs' },
      { key: 'open_roles', label: 'Open roles', value: result.open_roles, permission: 'hr.job_openings.view', href: '/w/hr/job-openings' },
    ];
  } else if (module === 'school') {
    const result = await withTenantTx(ctx.pool, ctx, async (client) => {
      const query = await client.query<Row>(
        `SELECT
           (SELECT count(*)::int FROM students WHERE status = 'active' AND deleted_at IS NULL) AS students,
           (SELECT count(*)::int FROM fee_invoices
             WHERE status <> 'paid' AND deleted_at IS NULL) AS unpaid_fees,
           (SELECT count(*)::int FROM attendance
             WHERE date = current_date AND deleted_at IS NULL) AS attendance_today,
           (SELECT count(*)::int FROM exams WHERE status = 'scheduled' AND deleted_at IS NULL) AS exams`,
      );
      return query.rows[0]!;
    });
    cards = [
      { key: 'students', label: 'Active students', value: result.students, permission: 'school.students.view', href: '/w/school/students' },
      { key: 'unpaid_fees', label: 'Unpaid fee invoices', value: result.unpaid_fees, permission: 'school.fees.view', href: '/w/school/fee-invoices' },
      { key: 'attendance_today', label: 'Attendance today', value: result.attendance_today, permission: 'school.attendance.view', href: '/w/school/attendance' },
      { key: 'exams', label: 'Scheduled exams', value: result.exams, permission: 'school.exams.view', href: '/w/school/exams' },
    ];
  } else {
    const result = await withTenantTx(ctx.pool, ctx, async (client) => {
      const query = await client.query<Row>(
        `SELECT
           (SELECT count(*)::int FROM journal_entries WHERE status = 'draft' AND deleted_at IS NULL) AS draft_journals,
           (SELECT coalesce(sum(balance), 0)::text FROM ar_open_items WHERE deleted_at IS NULL) AS receivables,
           (SELECT coalesce(sum(balance), 0)::text FROM ap_open_items WHERE deleted_at IS NULL) AS payables,
           (SELECT coalesce(sum(current_balance), 0)::text FROM bank_accounts WHERE deleted_at IS NULL) AS bank_balance,
           (SELECT count(*)::int FROM fiscal_periods WHERE status = 'open' AND deleted_at IS NULL) AS open_periods`,
      );
      return query.rows[0]!;
    });
    cards = [
      { key: 'draft_journals', label: 'Draft journals', value: result.draft_journals, permission: 'accounts.journals.view', href: '/w/accounts/journals' },
      { key: 'receivables', label: 'Receivables', value: result.receivables, permission: 'accounts.receivables.view', href: '/w/accounts/ar-open-items' },
      { key: 'payables', label: 'Payables', value: result.payables, permission: 'accounts.payables.view', href: '/w/accounts/ap-open-items' },
      { key: 'bank_balance', label: 'Bank balance', value: result.bank_balance, permission: 'accounts.banks.view', href: '/w/accounts/bank-accounts' },
      { key: 'open_periods', label: 'Open periods', value: result.open_periods, permission: 'accounts.fiscal_periods.view', href: '/w/accounts/fiscal-periods' },
    ];
  }

  return cards.filter((card) => ctx.actor.kind === 'platform' || ctx.permissions.has(permission(card.permission)));
}

async function readSettings(ctx: TenantRequestContext, key: string): Promise<Row> {
  return withTenantTx(ctx.pool, ctx, async (client) => {
    const result = await client.query<{ settings: Row }>(
      `SELECT settings FROM module_settings
        WHERE client_id = $1 AND module_key = $2 AND deleted_at IS NULL LIMIT 1`,
      [ctx.clientId, ctx.moduleKey],
    );
    const settings = result.rows[0]?.settings ?? {};
    return (settings[key] as Row) ?? {};
  });
}

async function writeSettings(ctx: TenantRequestContext, key: string, value: Row): Promise<Row> {
  return withTenantTx(ctx.pool, ctx, async (client) => {
    const result = await client.query<{ settings: Row }>(
      `INSERT INTO module_settings (client_id, module_key, settings, created_by, updated_by)
       VALUES ($1, $2, jsonb_build_object($3::text, $4::jsonb), $5, $5)
       ON CONFLICT (client_id, module_key)
       DO UPDATE SET settings = coalesce(module_settings.settings, '{}'::jsonb)
                     || jsonb_build_object($3::text, $4::jsonb),
                     updated_at = now(), updated_by = $5
       RETURNING settings`,
      [ctx.clientId, ctx.moduleKey, key, JSON.stringify(value), ctx.actor.userId],
    );
    return (result.rows[0]!.settings[key] as Row) ?? {};
  });
}

async function beforeRow(req: Request, descriptor: ResourceDescriptor, id: string): Promise<Row | undefined> {
  return getResource(context(req), descriptor, id);
}

export function createWorkspaceRouter(platformDb: PlatformDb, registry: TenantPoolRegistry): Router {
  const router = Router();
  const auth = workspaceAuth(platformDb, registry);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.uploadMaxBytes, files: 1 },
  });
  const uploadFile: RequestHandler = (req, res, next) => {
    upload.single('file')(req, res, (error?: unknown) => (error ? next(error) : next()));
  };

  router.get('/me', auth, asyncHandler(async (req, res) => {
    const ctx = context(req);
    const modules = await platformDb.query<Row>(
      `SELECT cm.module_key, cm.status, m.name
         FROM client_modules cm JOIN modules m ON m.key = cm.module_key
        WHERE cm.client_id = $1 ORDER BY cm.module_key`,
      [ctx.clientId],
    );
    const client = await platformDb.query<Row>(
      'SELECT id::text, name, slug, status FROM clients WHERE id = $1 AND deleted_at IS NULL',
      [ctx.clientId],
    );
    res.json({
      data: {
        mode: ctx.actor.kind,
        reason: ctx.actor.kind === 'platform' ? ctx.actor.reason : null,
        accessId: ctx.actor.kind === 'platform' ? ctx.actor.accessId : null,
        user: {
          id: ctx.actor.userId,
          email: req.auth?.claims.sub ?? null,
        },
        client: client.rows[0] ?? null,
        modules: modules.rows,
        activeModule: ctx.moduleKey,
        permissions: [...ctx.permissions].sort(),
      },
    });
  }));

  router.use('/:module', auth, requirePasswordChangeComplete, csrfForMutations);

  router.get('/:module/dashboard', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission(`${ctx.moduleKey}.dashboard.view`));
    res.json({ data: { module: ctx.moduleKey, cards: await dashboardCards(ctx) } });
  }));

  router.get('/:module/resources', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission(`${ctx.moduleKey}.dashboard.view`));
    res.json({ data: { module: ctx.moduleKey, resources: resourceNames(ctx.moduleKey) } });
  }));

  router.get('/:module/settings', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.settings.manage'));
    res.json({ data: await readSettings(ctx, 'general') });
  }));

  router.patch('/:module/settings', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.settings.manage'));
    const value = body(z.record(z.string(), z.unknown()), req.body);
    const before = await readSettings(ctx, 'general');
    const after = await writeSettings(ctx, 'general', value);
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.settings.update`,
      entity: 'module_settings',
      before,
      after,
    });
    res.json({ data: after });
  }));

  router.get('/:module/company', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.company.manage'));
    res.json({ data: await readSettings(ctx, 'company') });
  }));

  router.patch('/:module/company', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.company.manage'));
    const value = body(z.record(z.string(), z.unknown()), req.body);
    const before = await readSettings(ctx, 'company');
    const after = await writeSettings(ctx, 'company', value);
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.company.update`,
      entity: 'company_settings',
      before,
      after,
    });
    res.json({ data: after });
  }));

  router.get('/:module/admin/users', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.users.manage'));
    const result = await platformDb.query<Row>(
      `SELECT m.id::text, m.role, m.status, m.created_at,
              u.id::text AS user_id, u.email::text, u.full_name, u.status AS user_status,
              coalesce(
                array_agg(g.permission_key) FILTER (WHERE g.permission_key IS NOT NULL),
                ARRAY[]::text[]
              ) AS permissions
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN role_grants g ON g.membership_id = m.id
        WHERE m.client_id = $1 AND m.module_key = $2
        GROUP BY m.id, u.id ORDER BY m.created_at DESC`,
      [ctx.clientId, ctx.moduleKey],
    );
    res.json({ data: result.rows });
  }));

  router.post('/:module/admin/users', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.users.manage'));
    const input = body(z.object({
      email: z.string().email(),
      fullName: z.string().min(1).max(200),
      role: roleSchema.default('operator'),
      permissions: z.array(z.string()).optional(),
    }), req.body);

    const enabled = await enabledModules(platformDb, ctx.clientId);
    const grants = input.permissions
      ? expandPermissionKeys(input.permissions, { enabledModules: enabled })
      : permissionsForPreset(input.role, enabled);
    const membershipId = await actorMembershipId(platformDb, ctx);
    if (membershipId) {
      assertCanGrantPermissions({
        actorMembershipId: membershipId,
        requested: grants,
        actorPermissions: ctx.permissions,
      });
    }

    const token = randomBytes(32).toString('base64url');
    const created = await platformDb.transaction(async (tx) => {
      const user = await tx.query<{ id: string }>(
        `INSERT INTO users (email, full_name, status, invited_by, invite_expires_at)
         VALUES ($1, $2, 'invited', $3, now() + ($4 * interval '1 hour'))
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
          WHERE users.status = 'invited' AND users.deleted_at IS NULL
         RETURNING id::text`,
        [input.email.toLowerCase(), input.fullName, ctx.actor.userId, config.inviteTtlHours],
      );
      const userId = user.rows[0]?.id;
      if (!userId) throw new AppError('CONFLICT', 'An account with this email already exists.');
      const membership = await tx.query<{ id: string }>(
        `INSERT INTO memberships (user_id, client_id, module_key, role, status, created_by, created_by_membership_id)
         VALUES ($1, $2, $3, $4, 'active', $5, $6)
         ON CONFLICT (user_id, client_id, module_key)
         DO UPDATE SET role = EXCLUDED.role, status = 'active'
         RETURNING id::text`,
        [userId, ctx.clientId, ctx.moduleKey, input.role, ctx.actor.userId, membershipId ?? null],
      );
      const newMembershipId = membership.rows[0]?.id;
      if (!newMembershipId) throw new AppError('INTERNAL');
      await tx.query('DELETE FROM role_grants WHERE membership_id = $1', [newMembershipId]);
      if (grants.length > 0) {
        await tx.query(
          `INSERT INTO role_grants (membership_id, permission_key, granted_by)
           SELECT $1, g.key, $3 FROM unnest($2::text[]) AS g(key)
           JOIN permissions p ON p.key = g.key`,
          [newMembershipId, grants, ctx.actor.userId],
        );
      }
      await tx.query(
        `INSERT INTO invite_tokens (user_id, client_id, token_hash, expires_at, created_by)
         VALUES ($1, $2, $3, now() + ($4 * interval '1 hour'), $5)`,
        [userId, ctx.clientId, createHash('sha256').update(token).digest('hex'), config.inviteTtlHours, ctx.actor.userId],
      );
      return { userId, membershipId: newMembershipId, role: input.role, grants };
    });
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.admin.users.create`,
      entity: 'memberships',
      entityId: created.membershipId,
      after: { userId: created.userId, role: created.role, permissions: created.grants },
    });
    res.status(201).json({ data: { ...created, inviteToken: token } });
  }));

  router.patch('/:module/admin/users/:id/permissions', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.users.manage'));
    const id = body(uuid, req.params.id);
    const input = body(z.object({ permissions: z.array(z.string()) }), req.body);
    const membership = await platformDb.query<Row>(
      `SELECT id::text, user_id::text, role, status FROM memberships
        WHERE id = $1 AND client_id = $2 AND module_key = $3`,
      [id, ctx.clientId, ctx.moduleKey],
    );
    const target = membership.rows[0];
    if (!target) throw new AppError('NOT_FOUND');

    const enabled = await enabledModules(platformDb, ctx.clientId);
    const grants = expandPermissionKeys(input.permissions, { enabledModules: enabled });
    const actorMembership = await actorMembershipId(platformDb, ctx);
    if (actorMembership) {
      assertCanGrantPermissions({
        actorMembershipId: actorMembership,
        targetMembershipId: id,
        requested: grants,
        actorPermissions: ctx.permissions,
      });
    }

    await platformDb.transaction(async (tx) => {
      await tx.query('DELETE FROM role_grants WHERE membership_id = $1', [id]);
      if (grants.length > 0) {
        await tx.query(
          `INSERT INTO role_grants (membership_id, permission_key, granted_by)
           SELECT $1, g.key, $3 FROM unnest($2::text[]) AS g(key)
           JOIN permissions p ON p.key = g.key`,
          [id, grants, ctx.actor.userId],
        );
      }
      await tx.query("UPDATE memberships SET role = 'custom', updated_at = now() WHERE id = $1", [id]);
    });
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.admin.users.permissions`,
      entity: 'memberships',
      entityId: id,
      before: { role: target.role },
      after: { role: 'custom', permissions: grants },
    });
    res.json({ data: { id, role: 'custom', permissions: grants } });
  }));

  router.patch('/:module/admin/users/:id/status', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.users.manage'), true);
    const id = body(uuid, req.params.id);
    const input = body(z.object({ status: z.enum(['active', 'suspended', 'revoked']) }), req.body);
    const membership = await platformDb.query<Row>(
      `SELECT id::text, role, status FROM memberships
        WHERE id = $1 AND client_id = $2 AND module_key = $3`,
      [id, ctx.clientId, ctx.moduleKey],
    );
    const target = membership.rows[0];
    if (!target) throw new AppError('NOT_FOUND');
    const admins = await platformDb.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM memberships
        WHERE client_id = $1 AND role = 'client_admin' AND status = 'active'`,
      [ctx.clientId],
    );
    assertClientAdminCanBeChanged({
      currentRole: String(target.role),
      nextStatus: input.status,
      activeClientAdminCount: Number(admins.rows[0]?.count ?? 0),
    });
    await platformDb.query('UPDATE memberships SET status = $2, updated_at = now() WHERE id = $1', [id, input.status]);
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.admin.users.status`,
      entity: 'memberships',
      entityId: id,
      before: { status: target.status },
      after: { status: input.status },
    });
    res.json({ data: { id, status: input.status } });
  }));

  router.get('/:module/admin/roles', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.roles.manage'));
    const result = await platformDb.query<Row>(
      `SELECT id::text, name, permissions_json, created_at
         FROM roles WHERE client_id = $1 AND module_key = $2 ORDER BY name`,
      [ctx.clientId, ctx.moduleKey],
    );
    res.json({ data: result.rows });
  }));

  router.post('/:module/admin/roles', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.roles.manage'));
    const input = body(z.object({ name: z.string().min(1).max(100), permissions: z.array(z.string()) }), req.body);
    const enabled = await enabledModules(platformDb, ctx.clientId);
    const grants = expandPermissionKeys(input.permissions, { enabledModules: enabled });
    const actorMembership = await actorMembershipId(platformDb, ctx);
    if (actorMembership) {
      assertCanGrantPermissions({
        actorMembershipId: actorMembership,
        requested: grants,
        actorPermissions: ctx.permissions,
      });
    }
    const result = await platformDb.query<Row>(
      `INSERT INTO roles (client_id, module_key, name, permissions_json, created_by, created_by_membership_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING id::text, name, permissions_json`,
      [ctx.clientId, ctx.moduleKey, input.name, JSON.stringify(grants), ctx.actor.userId, actorMembership ?? null],
    );
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.admin.roles.create`,
      entity: 'roles',
      entityId: String(result.rows[0]!.id),
      after: result.rows[0],
    });
    res.status(201).json({ data: result.rows[0] });
  }));

  router.patch('/:module/admin/roles/:id', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.roles.manage'));
    const id = body(uuid, req.params.id);
    const input = body(z.object({ name: z.string().min(1).max(100).optional(), permissions: z.array(z.string()).optional() }), req.body);
    const existing = await platformDb.query<Row>(
      'SELECT id::text, name, permissions_json FROM roles WHERE id = $1 AND client_id = $2 AND module_key = $3',
      [id, ctx.clientId, ctx.moduleKey],
    );
    if (!existing.rows[0]) throw new AppError('NOT_FOUND');

    let grants: PermissionKey[] | undefined;
    if (input.permissions) {
      const enabled = await enabledModules(platformDb, ctx.clientId);
      grants = expandPermissionKeys(input.permissions, { enabledModules: enabled });
      const actorMembership = await actorMembershipId(platformDb, ctx);
      if (actorMembership) {
        assertCanGrantPermissions({
          actorMembershipId: actorMembership,
          requested: grants,
          actorPermissions: ctx.permissions,
        });
      }
    }
    const result = await platformDb.query<Row>(
      `UPDATE roles SET name = coalesce($2, name),
                        permissions_json = coalesce($3::jsonb, permissions_json),
                        updated_at = now()
        WHERE id = $1 RETURNING id::text, name, permissions_json`,
      [id, input.name ?? null, grants ? JSON.stringify(grants) : null],
    );
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.admin.roles.update`,
      entity: 'roles',
      entityId: id,
      before: existing.rows[0],
      after: result.rows[0],
    });
    res.json({ data: result.rows[0] });
  }));

  router.delete('/:module/admin/roles/:id', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.roles.manage'), true);
    const id = body(uuid, req.params.id);
    const existing = await platformDb.query<Row>(
      'SELECT id::text, name FROM roles WHERE id = $1 AND client_id = $2 AND module_key = $3',
      [id, ctx.clientId, ctx.moduleKey],
    );
    if (!existing.rows[0]) throw new AppError('NOT_FOUND');
    await platformDb.query('DELETE FROM roles WHERE id = $1', [id]);
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.admin.roles.delete`,
      entity: 'roles',
      entityId: id,
      before: existing.rows[0],
    });
    res.status(204).end();
  }));

  router.get('/:module/admin/branches', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permissionKey(ctx, BRANCHES, 'view'));
    const result = await listResource(ctx, BRANCHES, parseListQuery(req.query as Record<string, unknown>));
    res.json({ data: result.rows, meta: { total: result.total, ...parseMeta(req.query) } });
  }));

  router.post('/:module/admin/branches', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permissionKey(ctx, BRANCHES, 'create'));
    const before = undefined;
    const row = await createResource(ctx, BRANCHES, req.body);
    await audit(platformDb, req, { action: `${ctx.moduleKey}.admin.branches.create`, entity: 'branches', entityId: String(row.id), before, after: row });
    res.status(201).json({ data: row });
  }));

  router.patch('/:module/admin/branches/:id', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permissionKey(ctx, BRANCHES, 'update'));
    const id = body(uuid, req.params.id);
    const before = await beforeRow(req, BRANCHES, id);
    const row = await updateResource(ctx, BRANCHES, id, req.body);
    await audit(platformDb, req, { action: `${ctx.moduleKey}.admin.branches.update`, entity: 'branches', entityId: id, before, after: row });
    res.json({ data: row });
  }));

  router.delete('/:module/admin/branches/:id', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permissionKey(ctx, BRANCHES, 'delete'), true);
    const id = body(uuid, req.params.id);
    const before = await beforeRow(req, BRANCHES, id);
    await deleteResource(ctx, BRANCHES, id);
    await audit(platformDb, req, { action: `${ctx.moduleKey}.admin.branches.delete`, entity: 'branches', entityId: id, before });
    res.status(204).end();
  }));

  router.get('/:module/admin/tax-codes', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permissionKey(ctx, TAX_CODES, 'view'));
    const result = await listResource(ctx, TAX_CODES, parseListQuery(req.query as Record<string, unknown>));
    res.json({ data: result.rows, meta: { total: result.total, ...parseMeta(req.query) } });
  }));

  router.post('/:module/admin/tax-codes', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permissionKey(ctx, TAX_CODES, 'create'));
    const row = await createResource(ctx, TAX_CODES, req.body);
    await audit(platformDb, req, { action: `${ctx.moduleKey}.admin.tax_codes.create`, entity: 'tax_codes', entityId: String(row.id), after: row });
    res.status(201).json({ data: row });
  }));

  router.patch('/:module/admin/tax-codes/:id', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permissionKey(ctx, TAX_CODES, 'update'));
    const id = body(uuid, req.params.id);
    const before = await beforeRow(req, TAX_CODES, id);
    const row = await updateResource(ctx, TAX_CODES, id, req.body);
    await audit(platformDb, req, { action: `${ctx.moduleKey}.admin.tax_codes.update`, entity: 'tax_codes', entityId: id, before, after: row });
    res.json({ data: row });
  }));

  router.delete('/:module/admin/tax-codes/:id', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permissionKey(ctx, TAX_CODES, 'delete'), true);
    const id = body(uuid, req.params.id);
    const before = await beforeRow(req, TAX_CODES, id);
    await deleteResource(ctx, TAX_CODES, id);
    await audit(platformDb, req, { action: `${ctx.moduleKey}.admin.tax_codes.delete`, entity: 'tax_codes', entityId: id, before });
    res.status(204).end();
  }));

  router.get('/:module/admin/audit', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.audit.view'));
    const query = parseListQuery(req.query as Record<string, unknown>);
    const result = await withTenantTx(ctx.pool, ctx, async (client) => {
      const clauses = ['client_id = $1', 'module_key = $2'];
      const params: unknown[] = [ctx.clientId, ctx.moduleKey];
      if (query.q) {
        params.push(`%${query.q}%`);
        clauses.push(`(action::text ILIKE $${params.length} OR entity::text ILIKE $${params.length} OR actor_id::text ILIKE $${params.length})`);
      }
      for (const filter of query.filters) {
        if (!['actor_type', 'platform_override'].includes(filter.column)) {
          throw new AppError('VALIDATION_ERROR', `Unsupported filter: ${filter.column}`);
        }
        params.push(filter.column === 'platform_override' ? filter.value === 'true' : filter.value);
        clauses.push(`${filter.column} = $${params.length}`);
      }
      params.push(query.perPage, (query.page - 1) * query.perPage);
      const rows = await client.query<Row>(
        `SELECT id::text, actor_id::text, actor_type, action, entity, entity_id::text,
                "before", "after", reason, platform_override, request_id, created_at
           FROM module_audit WHERE ${clauses.join(' AND ')}
          ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const count = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM module_audit WHERE ${clauses.join(' AND ')}`,
        params.slice(0, -2),
      );
      return { rows: rows.rows, total: Number(count.rows[0]?.count ?? 0) };
    });
    res.json({ data: result.rows, meta: { page: query.page, per_page: query.perPage, total: result.total } });
  }));

  router.get('/:module/admin/audit/export', asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.audit.view'));
    const result = await withTenantTx(ctx.pool, ctx, async (client) => {
      const query = await client.query<Row>(
        `SELECT id::text, actor_id::text, actor_type, action, entity, entity_id::text, reason,
                platform_override, request_id, created_at
           FROM module_audit WHERE client_id = $1 AND module_key = $2
          ORDER BY created_at DESC LIMIT 5000`,
        [ctx.clientId, ctx.moduleKey],
      );
      return query.rows;
    });
    sendCsv(res, result, `${ctx.moduleKey}-audit`);
  }));

  router.post('/:module/admin/uploads', uploadFile, asyncHandler(async (req, res) => {
    const ctx = context(req);
    assertPermission(req, permission('administration.settings.manage'));
    if (!req.file) throw new AppError('VALIDATION_ERROR', 'A file is required.');
    const result = await saveUpload(
      { buffer: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype },
      { directory: config.uploadDir },
    );
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.admin.uploads.create`,
      entity: 'uploads',
      entityId: result.id,
      after: { fileName: result.fileName, mimeType: result.mimeType, bytes: result.bytes },
    });
    res.status(201).json({ data: result });
  }));

  const workflows: Array<{
    method: 'post';
    path: string;
    module: ModuleKey;
    permission: string;
    entity: string;
    run: (ctx: TenantRequestContext, id: string, req: Request) => Promise<Row>;
  }> = [
    { method: 'post', path: '/:module/invoices/:id/finalize', module: 'retail', permission: 'retail.invoices.approve', entity: 'invoices', run: (ctx, id) => finalizeInvoice(ctx, id) },
    { method: 'post', path: '/:module/invoices/:id/duplicate', module: 'retail', permission: 'retail.invoices.create', entity: 'invoices', run: (ctx, id, req) => duplicateInvoice(ctx, id, body(z.object({ number: z.string().min(1).max(100).optional(), date: z.string().max(40).optional() }).default({}), req.body)) },
    { method: 'post', path: '/:module/refunds/:id/approve', module: 'retail', permission: 'retail.refunds.approve', entity: 'refunds', run: (ctx, id) => approveRefund(ctx, id) },
    { method: 'post', path: '/:module/refunds/:id/reject', module: 'retail', permission: 'retail.refunds.approve', entity: 'refunds', run: (ctx, id, req) => rejectRefund(ctx, id, body(z.object({ reason: z.string().max(500).optional() }).default({}), req.body).reason) },
    { method: 'post', path: '/:module/purchase-returns/:id/approve', module: 'retail', permission: 'retail.purchase_returns.approve', entity: 'purchase_returns', run: (ctx, id) => approvePurchaseReturn(ctx, id) },
    { method: 'post', path: '/:module/expenses/:id/approve', module: 'retail', permission: 'retail.expenses.approve', entity: 'expenses', run: (ctx, id) => approveExpense(ctx, id) },
    { method: 'post', path: '/:module/purchases/:id/receive', module: 'retail', permission: 'retail.purchases.approve', entity: 'purchases', run: (ctx, id) => receivePurchase(ctx, id) },
    { method: 'post', path: '/:module/leave-requests/:id/approve', module: 'hr', permission: 'hr.leave.approve', entity: 'leave_requests', run: (ctx, id, req) => decideLeaveRequest(ctx, id, 'approve', body(z.object({ comment: z.string().max(500).optional() }).default({}), req.body).comment) },
    { method: 'post', path: '/:module/leave-requests/:id/reject', module: 'hr', permission: 'hr.leave.approve', entity: 'leave_requests', run: (ctx, id, req) => decideLeaveRequest(ctx, id, 'reject', body(z.object({ comment: z.string().max(500).optional() }).default({}), req.body).comment) },
    { method: 'post', path: '/:module/pay-runs/:id/approve', module: 'hr', permission: 'hr.payroll.approve', entity: 'pay_runs', run: (ctx, id) => approvePayRun(ctx, id) },
    { method: 'post', path: '/:module/journals/:id/post', module: 'accounts', permission: 'accounts.journals.post', entity: 'journal_entries', run: (ctx, id) => postJournal(ctx, id) },
  ];

  for (const workflow of workflows) {
    router.post(workflow.path, asyncHandler(async (req, res) => {
      const ctx = context(req);
      requireModule(ctx, workflow.module);
      assertPermission(req, permission(workflow.permission));
      const id = body(uuid, req.params.id);
      const resource = workflow.entity === 'journal_entries'
        ? 'journals'
        : workflow.entity.replace(/_/g, '-');
      const descriptor = getDescriptor(ctx.moduleKey, resource);
      const before = descriptor ? await beforeRow(req, descriptor, id) : undefined;
      const after = await workflow.run(ctx, id, req);
      await audit(platformDb, req, {
        action: `${ctx.moduleKey}.${workflow.entity}.${workflow.path.split('/').pop()}`,
        entity: workflow.entity,
        entityId: id,
        before,
        after,
      });
      res.json({ data: after });
    }));
  }

  router.get('/:module/:resource/export', asyncHandler(async (req, res) => {
    const ctx = context(req);
    const descriptor = getDescriptor(ctx.moduleKey, String(req.params.resource));
    if (!descriptor) throw new AppError('NOT_FOUND');
    assertPermission(req, permissionKey(ctx, descriptor, actionFor(descriptor, 'export')));
    const query = parseListQuery(req.query as Record<string, unknown>);
    query.perPage = Math.min(query.perPage, 500);
    const result = await listResource(ctx, descriptor, query);
    sendCsv(res, result.rows, `${ctx.moduleKey}-${String(req.params.resource)}`);
  }));

  router.get('/:module/:resource', asyncHandler(async (req, res) => {
    const ctx = context(req);
    const descriptor = getDescriptor(ctx.moduleKey, String(req.params.resource));
    if (!descriptor) throw new AppError('NOT_FOUND');
    assertPermission(req, permissionKey(ctx, descriptor, 'view'));
    const query = parseListQuery(req.query as Record<string, unknown>);
    const result = await listResource(ctx, descriptor, query);
    res.json({
      data: result.rows,
      meta: { page: query.page, per_page: query.perPage, total: result.total },
    });
  }));

  router.get('/:module/:resource/:id', asyncHandler(async (req, res) => {
    const ctx = context(req);
    const descriptor = getDescriptor(ctx.moduleKey, String(req.params.resource));
    if (!descriptor) throw new AppError('NOT_FOUND');
    assertPermission(req, permissionKey(ctx, descriptor, 'view'));
    const id = body(uuid, req.params.id);
    const row = await getResource(ctx, descriptor, id);
    if (!row) throw new AppError('NOT_FOUND');
    res.json({ data: row });
  }));

  router.post('/:module/:resource', asyncHandler(async (req, res) => {
    const ctx = context(req);
    const descriptor = getDescriptor(ctx.moduleKey, String(req.params.resource));
    if (!descriptor) throw new AppError('NOT_FOUND');
    assertPermission(req, permissionKey(ctx, descriptor, actionFor(descriptor, 'create')));
    const row = await createResource(ctx, descriptor, req.body);
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.${String(req.params.resource)}.create`,
      entity: descriptor.table,
      entityId: String(row.id),
      after: row,
    });
    res.status(201).json({ data: row });
  }));

  router.patch('/:module/:resource/:id', asyncHandler(async (req, res) => {
    const ctx = context(req);
    const descriptor = getDescriptor(ctx.moduleKey, String(req.params.resource));
    if (!descriptor) throw new AppError('NOT_FOUND');
    assertPermission(req, permissionKey(ctx, descriptor, actionFor(descriptor, 'update')));
    const id = body(uuid, req.params.id);
    const before = await beforeRow(req, descriptor, id);
    const row = await updateResource(ctx, descriptor, id, req.body);
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.${String(req.params.resource)}.update`,
      entity: descriptor.table,
      entityId: id,
      before,
      after: row,
    });
    res.json({ data: row });
  }));

  router.delete('/:module/:resource/:id', asyncHandler(async (req, res) => {
    const ctx = context(req);
    const descriptor = getDescriptor(ctx.moduleKey, String(req.params.resource));
    if (!descriptor) throw new AppError('NOT_FOUND');
    assertPermission(req, permissionKey(ctx, descriptor, actionFor(descriptor, 'delete')), true);
    const id = body(uuid, req.params.id);
    const before = await beforeRow(req, descriptor, id);
    await deleteResource(ctx, descriptor, id);
    await audit(platformDb, req, {
      action: `${ctx.moduleKey}.${String(req.params.resource)}.delete`,
      entity: descriptor.table,
      entityId: id,
      before,
    });
    res.status(204).end();
  }));

  return router;
}

function parseMeta(query: Record<string, unknown>): Row {
  const parsed = parseListQuery(query);
  return { page: parsed.page, per_page: parsed.perPage };
}

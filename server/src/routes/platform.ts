import { Router, type Request, type RequestHandler } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { PlatformDb } from '../db/platform';
import type { TenantPoolRegistry } from '../db/registry';
import { withTenantTx } from '../db/tenant';
import { config } from '../config';
import { requireSession, requirePasswordChangeComplete } from '../auth/middleware';
import { requireCsrf } from '../auth/csrf';
import {
  MODULE_ACCESS_TTL_SECONDS,
  signModuleAccessToken,
} from '../auth/tokens';
import { clearModuleAccessCookie, setModuleAccessCookie } from '../auth/cookies';
import { hashPassword } from '../auth/password';
import { AppError, asyncHandler } from '../http/errors';
import { writePlatformAudit } from '../audit/writers';
import { expandPermissionKeys, MODULE_KEYS, type ModuleKey } from '../authz/catalog';
import { requestDeprovisioning, requestProvisioning, retryProvisioningJob } from '../provisioning/service';
import { startImpersonation, endImpersonation } from '../auth/impersonation';

const uuid = z.string().uuid();
const moduleKey = z.enum(MODULE_KEYS);
const isoDate = z
  .string()
  .min(1)
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be an ISO date');

const MODULE_COUNT_TABLE: Record<ModuleKey, string> = {
  hr: 'employees',
  retail: 'invoices',
  school: 'students',
  accounts: 'journals',
};

function dateParam(value: unknown): Date | null {
  if (value === undefined || value === '') return null;
  return new Date(body(isoDate, value));
}

function body<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Request validation failed.', {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return parsed.data;
}

function platformOnly(platformDb: PlatformDb): RequestHandler {
  const session = requireSession(platformDb, 'platform');
  return (req, res, next) => session(req, res, (error?: unknown) => {
    if (error) return next(error);
    if (!req.auth || req.auth.realm !== 'platform' || req.auth.claims.actor_type !== 'platform') {
      return next(new AppError('FORBIDDEN', 'Platform authentication is required.'));
    }
    if (req.auth.claims.must_change_password) {
      return next(new AppError('FORBIDDEN', 'You must change your password before continuing.'));
    }
    void platformDb.query<{ mfa_enabled: boolean; status: string }>(
      'SELECT mfa_enabled, status FROM platform_users WHERE id = $1', [req.auth.userId],
    ).then(({ rows }) => {
      if (!rows[0] || rows[0].status !== 'active') throw new AppError('FORBIDDEN');
      if (!rows[0].mfa_enabled) throw new AppError('FORBIDDEN', 'Platform MFA must be enabled.');
      next();
    }).catch(next);
  });
}

function audit(platformDb: PlatformDb, req: Request, input: {
  action: string; entity: string; entityId?: string | null; clientId?: string | null;
  before?: unknown; after?: unknown;
}): Promise<void> {
  return writePlatformAudit(platformDb, {
    actorType: 'platform', actorId: req.auth?.userId, action: input.action,
    entity: input.entity, entityId: input.entityId, clientId: input.clientId,
    before: input.before, after: input.after, ip: req.ip,
    userAgent: req.get('user-agent'), requestId: req.requestId,
  });
}

async function tenantRecordCount(
  registry: TenantPoolRegistry,
  clientId: string,
  key: ModuleKey,
): Promise<number | null> {
  try {
    const pool = await registry.getPool(clientId, key);
    return await withTenantTx(pool, { clientId, moduleKey: key }, async (client) => {
      const result = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM ${MODULE_COUNT_TABLE[key]}`,
      );
      return Number(result.rows[0]?.count ?? 0);
    });
  } catch {
    return null;
  }
}

async function createClientAdmin(
  platformDb: PlatformDb,
  input: {
    clientId: string;
    email: string;
    fullName: string;
    moduleKey: ModuleKey;
    grants: string[];
    actorId: string;
  },
): Promise<{ userId: string; membershipId: string; token: string }> {
  const token = randomBytes(32).toString('base64url');
  const details = await platformDb.transaction(async (tx) => {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO users(email,full_name,status,invited_by,invite_expires_at)
       VALUES($1,$2,'invited',$3,now()+($4 * interval '1 hour'))
       ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name
       WHERE users.status='invited' AND users.deleted_at IS NULL
       RETURNING id::text`,
      [input.email.toLowerCase(), input.fullName, input.actorId, config.inviteTtlHours],
    );
    const userId = inserted.rows[0]?.id;
    if (!userId) throw new AppError('CONFLICT', 'An account with this email already exists.');
    const membership = await tx.query<{ id: string }>(
      `INSERT INTO memberships(user_id,client_id,module_key,role,status,created_by)
       VALUES($1,$2,$3,'client_admin','active',$4)
       ON CONFLICT(user_id,client_id,module_key) DO UPDATE SET role='client_admin',status='active'
       RETURNING id::text`,
      [userId, input.clientId, input.moduleKey, input.actorId],
    );
    const membershipId = membership.rows[0]?.id;
    if (!membershipId) throw new AppError('INTERNAL');
    await tx.query('DELETE FROM role_grants WHERE membership_id=$1', [membershipId]);
    if (input.grants.length > 0) {
      await tx.query(
        `INSERT INTO role_grants(membership_id,permission_key,granted_by)
         SELECT $1,permission_key,$3 FROM unnest($2::text[]) AS g(permission_key)`,
        [membershipId, input.grants, input.actorId],
      );
    }
    await tx.query(
      `INSERT INTO invite_tokens(user_id,client_id,token_hash,expires_at,created_by)
       VALUES($1,$2,$3,now()+($4 * interval '1 hour'),$5)`,
      [
        userId,
        input.clientId,
        createHash('sha256').update(token).digest('hex'),
        config.inviteTtlHours,
        input.actorId,
      ],
    );
    return { userId, membershipId };
  });

  return { userId: details.userId, membershipId: details.membershipId, token };
}

async function clientUserCapacity(
  platformDb: PlatformDb,
  clientId: string,
): Promise<{ limit: number; active: number }> {
  const result = await platformDb.query<{ limit: number; active: number }>(
    `SELECT coalesce(c.max_users,p.max_users) AS limit,
            (SELECT count(DISTINCT m.user_id)::int FROM memberships m
              WHERE m.client_id=c.id AND m.status='active') AS active
       FROM clients c JOIN plans p ON p.id=c.plan_id
      WHERE c.id=$1 AND c.deleted_at IS NULL`,
    [clientId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError('NOT_FOUND');
  return row;
}

export function createPlatformRouter(platformDb: PlatformDb, registry: TenantPoolRegistry): Router {
  const router = Router();
  router.use(platformOnly(platformDb), requirePasswordChangeComplete);

  router.get('/me', asyncHandler(async (req, res) => {
    const result = await platformDb.query(
      `SELECT id::text, email::text, full_name, mfa_enabled, must_change_password, last_login_at
         FROM platform_users WHERE id = $1 AND status = 'active'`, [req.auth!.userId],
    );
    if (!result.rows[0]) throw new AppError('UNAUTHENTICATED');
    res.json({ data: { user: result.rows[0], permissions: ['platform.*'] } });
  }));

  router.get('/overview', asyncHandler(async (_req, res) => {
    const result = await platformDb.query(
      `SELECT (SELECT count(*)::int FROM clients WHERE deleted_at IS NULL) AS clients,
              (SELECT count(*)::int FROM clients WHERE status = 'active' AND deleted_at IS NULL) AS active_clients,
              (SELECT count(*)::int FROM client_modules WHERE status = 'active') AS active_modules,
              (SELECT count(*)::int FROM users WHERE status = 'active' AND deleted_at IS NULL) AS active_users,
              (SELECT count(*)::int FROM provisioning_jobs WHERE status IN ('queued','running')) AS pending_jobs,
              (SELECT count(*)::int FROM provisioning_jobs WHERE status = 'failed') AS failed_jobs,
              (SELECT count(*)::int FROM audit_events WHERE created_at > now() - interval '24 hours') AS audit_events_24h`,
    );
    const [recent, clientsByStatus, modulesByStatus] = await Promise.all([
      platformDb.query(
        `SELECT id::text, actor_type, actor_id::text, client_id::text, action, entity, entity_id::text, created_at
           FROM audit_events ORDER BY created_at DESC LIMIT 20`,
      ),
      platformDb.query(
        `SELECT status, count(*)::int AS count FROM clients WHERE deleted_at IS NULL GROUP BY status ORDER BY status`,
      ),
      platformDb.query(
        `SELECT coalesce(status,'not_enabled') AS status, count(*)::int AS count
           FROM (SELECT c.id, m.key, cm.status FROM clients c CROSS JOIN modules m
                   LEFT JOIN client_modules cm ON cm.client_id=c.id AND cm.module_key=m.key
                  WHERE c.deleted_at IS NULL) instances
          GROUP BY coalesce(status,'not_enabled') ORDER BY status`,
      ),
    ]);
    res.json({
      data: {
        ...(result.rows[0] ?? {}),
        tenant_pools: registry.poolCount,
        clients_by_status: clientsByStatus.rows,
        modules_by_status: modulesByStatus.rows,
        recent_activity: recent.rows,
      },
    });
  }));

  router.get('/clients', asyncHandler(async (req, res) => {
    const page = body(z.coerce.number().int().min(1).default(1), req.query.page ?? 1);
    const perPage = body(z.coerce.number().int().min(1).max(100).default(25), req.query.per_page ?? 25);
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : null;
    const result = await platformDb.query(
      `SELECT c.id::text, c.name, c.slug::text, c.status, c.max_users, c.max_branches, c.created_at,
              p.key::text AS plan_key, p.name AS plan_name,
              (SELECT count(*)::int FROM memberships m WHERE m.client_id=c.id AND m.status='active') AS users,
              (SELECT coalesce(jsonb_agg(jsonb_build_object('module_key',cm.module_key,'status',cm.status)
                       ORDER BY cm.module_key),'[]'::jsonb) FROM client_modules cm WHERE cm.client_id=c.id) AS modules
         FROM clients c JOIN plans p ON p.id=c.plan_id
        WHERE c.deleted_at IS NULL AND ($1::text IS NULL OR c.status=$1)
          AND ($2::text IS NULL OR c.name ILIKE '%'||$2||'%' OR c.slug::text ILIKE '%'||$2||'%')
        ORDER BY c.created_at DESC LIMIT $3 OFFSET $4`,
      [status, q, perPage, (page - 1) * perPage],
    );
    const count = await platformDb.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM clients c WHERE c.deleted_at IS NULL
        AND ($1::text IS NULL OR c.status=$1)
        AND ($2::text IS NULL OR c.name ILIKE '%'||$2||'%' OR c.slug::text ILIKE '%'||$2||'%')`, [status, q],
    );
    res.json({ data: result.rows, meta: { page, per_page: perPage, total: Number(count.rows[0]?.total ?? 0) } });
  }));

  router.post('/clients', requireCsrf, asyncHandler(async (req, res) => {
    const input = body(z.object({ name: z.string().trim().min(1).max(160), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), plan_key: z.string().min(1).max(80), max_users: z.number().int().positive().optional(), max_branches: z.number().int().positive().optional() }), req.body);
    const result = await platformDb.query(
      `INSERT INTO clients(name,slug,plan_id,max_users,max_branches,created_by,status)
       SELECT $1,$2,id,$4,$5,$6,'active' FROM plans WHERE key=$3 AND is_active=true
       RETURNING id::text,name,slug::text,status,plan_id::text,created_at`,
      [input.name, input.slug, input.plan_key, input.max_users ?? null, input.max_branches ?? null, req.auth!.userId],
    );
    if (!result.rows[0]) throw new AppError('VALIDATION_ERROR', 'The requested plan is not available.');
    await audit(platformDb, req, { action: 'client.create', entity: 'client', entityId: result.rows[0].id, after: result.rows[0] });
    res.status(201).json({ data: result.rows[0] });
  }));

  router.get('/clients/:id', asyncHandler(async (req, res) => {
    const id = body(uuid, req.params.id);
    const result = await platformDb.query(
      `SELECT c.id::text,c.name,c.slug::text,c.status,c.max_users,c.max_branches,c.created_at,c.updated_at,
              p.key::text AS plan_key,p.name AS plan_name,p.max_modules,p.storage_mb,p.price_pkr::text,
              coalesce((SELECT jsonb_agg(jsonb_build_object('module_key',cm.module_key,'status',cm.status,'schema_version',cm.schema_version) ORDER BY cm.module_key) FROM client_modules cm WHERE cm.client_id=c.id),'[]'::jsonb) AS modules
         FROM clients c JOIN plans p ON p.id=c.plan_id WHERE c.id=$1 AND c.deleted_at IS NULL`, [id],
    );
    if (!result.rows[0]) throw new AppError('NOT_FOUND');
    res.json({ data: result.rows[0] });
  }));

  router.patch('/clients/:id', requireCsrf, asyncHandler(async (req, res) => {
    const id = body(uuid, req.params.id);
    const input = body(z.object({ name: z.string().trim().min(1).max(160).optional(), status: z.enum(['active','suspended','archived']).optional(), plan_key: z.string().min(1).max(80).optional(), max_users: z.number().int().positive().nullable().optional(), max_branches: z.number().int().positive().nullable().optional() }).refine((x) => Object.keys(x).length > 0), req.body);
    const before = await platformDb.query('SELECT id::text,name,status,max_users,max_branches,plan_id::text FROM clients WHERE id=$1 AND deleted_at IS NULL',[id]);
    if (!before.rows[0]) throw new AppError('NOT_FOUND');
    const updated = await platformDb.query(
      `UPDATE clients c SET name=coalesce($2,c.name), status=coalesce($3,c.status),
         plan_id=coalesce((SELECT id FROM plans WHERE key=$4 AND is_active=true),c.plan_id),
         max_users=CASE WHEN $5 THEN $6 ELSE c.max_users END,
         max_branches=CASE WHEN $7 THEN $8 ELSE c.max_branches END
       WHERE c.id=$1 AND c.deleted_at IS NULL
         AND ($4::text IS NULL OR EXISTS(SELECT 1 FROM plans WHERE key=$4 AND is_active=true))
       RETURNING c.id::text,c.name,c.status,c.max_users,c.max_branches,c.plan_id::text`,
      [id,input.name??null,input.status??null,input.plan_key??null,'max_users' in input,input.max_users??null,'max_branches' in input,input.max_branches??null],
    );
    if (!updated.rows[0]) throw new AppError('VALIDATION_ERROR','The requested plan is not available.');
    await audit(platformDb,req,{action:'client.update',entity:'client',entityId:id,before:before.rows[0],after:updated.rows[0]});
    res.json({data:updated.rows[0]});
  }));

  router.delete('/clients/:id', requireCsrf, asyncHandler(async (req, res) => {
    const id = body(uuid, req.params.id);
    const before = await platformDb.query(
      'SELECT id::text,name,status FROM clients WHERE id=$1 AND deleted_at IS NULL', [id],
    );
    if (!before.rows[0]) throw new AppError('NOT_FOUND');
    const updated = await platformDb.query(
      `UPDATE clients SET status='archived', deleted_at=now()
        WHERE id=$1 AND deleted_at IS NULL
        RETURNING id::text,name,status,deleted_at`,
      [id],
    );
    await platformDb.query(
      `UPDATE sessions SET revoked_at=now()
        WHERE client_id=$1 AND realm='tenant' AND revoked_at IS NULL`,
      [id],
    );
    await platformDb.query(
      `UPDATE memberships SET status='revoked' WHERE client_id=$1 AND status='active'`,
      [id],
    );
    await audit(platformDb, req, {
      action: 'client.archive', entity: 'client', entityId: id,
      before: before.rows[0], after: updated.rows[0],
    });
    res.json({ data: updated.rows[0] });
  }));

  router.get('/modules', asyncHandler(async (_req,res)=>{
    const result=await platformDb.query(`SELECT m.key,m.name,m.latest_version,m.is_active,
      count(cm.id)::int AS instances,count(*) FILTER(WHERE cm.status='active')::int AS active_instances
      FROM modules m LEFT JOIN client_modules cm ON cm.module_key=m.key GROUP BY m.key ORDER BY m.key`);
    res.json({data:result.rows});
  }));

  router.post('/clients/:id/modules',requireCsrf,asyncHandler(async(req,res)=>{
    const clientId=body(uuid,req.params.id);
    const input=body(z.object({module_key:moduleKey,admin_user_id:uuid,grants:z.array(z.string().min(1).max(120)).max(300).optional()}),req.body);
    const result=await requestProvisioning(platformDb,{clientId,moduleKey:input.module_key,adminUserId:input.admin_user_id,createdBy:req.auth!.userId,initialGrants:input.grants});
    await audit(platformDb,req,{action:'module.provision.request',entity:'client_module',clientId,after:{module_key:input.module_key,...result,requested_grants:input.grants??[]}});
    res.status(result.status==='active'?200:202).json({data:result});
  }));

  router.patch('/clients/:id/modules/:module',requireCsrf,asyncHandler(async(req,res)=>{
    const clientId=body(uuid,req.params.id);
    const key=body(moduleKey,req.params.module) as ModuleKey;
    const input=body(z.object({status:z.enum(['active','disabled','archived'])}),req.body);
    const current=await platformDb.query<{status:string;db_name:string|null;db_secret_ref:string|null;schema_version:string|null;health:string|null}>(
      `SELECT cm.status,cm.db_name,cm.db_secret_ref,cm.schema_version,r.health
         FROM client_modules cm
         LEFT JOIN db_registry r ON r.client_id=cm.client_id AND r.module_key=cm.module_key
        WHERE cm.client_id=$1 AND cm.module_key=$2`,[clientId,key]);
    const row=current.rows[0];
    if(!row)throw new AppError('NOT_FOUND');
    if(row.status===input.status)return res.json({data:{client_id:clientId,module_key:key,status:row.status}});
    if(input.status==='active'){
      if(row.status!=='disabled')throw new AppError('CONFLICT','Only disabled modules can be reactivated.');
      if(!row.db_name||!row.db_secret_ref||!row.schema_version||!row.health){
        throw new AppError('CONFLICT','This module has no registered database. Provision it instead.');
      }
    }
    if(row.status==='provisioning')throw new AppError('CONFLICT','A module can only change state after provisioning finishes.');
    const updated=await platformDb.query(
      `UPDATE client_modules SET status=$3
        WHERE client_id=$1 AND module_key=$2
        RETURNING client_id::text,module_key,status,updated_at`,
      [clientId,key,input.status]);
    if(input.status!=='active'){
      await platformDb.query(
        `UPDATE sessions SET revoked_at=now()
          WHERE client_id=$1 AND active_module=$2 AND revoked_at IS NULL`,
        [clientId,key]);
    }
    await audit(platformDb,req,{action:'module.status.update',entity:'client_module',clientId,before:{status:row.status},after:{module_key:key,status:input.status}});
    res.json({data:updated.rows[0]});
  }));

  router.delete('/clients/:id/modules/:module',requireCsrf,asyncHandler(async(req,res)=>{
    const clientId=body(uuid,req.params.id);
    const key=body(moduleKey,req.params.module) as ModuleKey;
    const result=await requestDeprovisioning(platformDb,{clientId,moduleKey:key,createdBy:req.auth!.userId});
    await audit(platformDb,req,{action:'module.deprovision.request',entity:'client_module',clientId,after:{module_key:key,...result}});
    res.status(202).json({data:result});
  }));

  router.get('/modules/instances', asyncHandler(async(req,res)=>{
    const filters=body(z.object({client_id:uuid.optional(),module_key:moduleKey.optional(),status:z.string().max(30).optional(),include_counts:z.enum(['true','false']).optional()}),{
      ...(typeof req.query.client_id==='string'?{client_id:req.query.client_id}:{}),
      ...(typeof req.query.module_key==='string'?{module_key:req.query.module_key}:{}),
      ...(typeof req.query.status==='string'?{status:req.query.status}:{}),
      ...(typeof req.query.include_counts==='string'?{include_counts:req.query.include_counts}:{}),
    });
    const result=await platformDb.query(`SELECT c.id::text AS client_id,c.name AS client_name,c.slug::text AS client_slug,
      m.key AS module_key,m.name AS module_name,coalesce(cm.status,'not_enabled') AS status,
      coalesce(r.health,'unknown') AS health,coalesce(cm.schema_version,r.schema_version) AS schema_version,
      r.last_checked_at,cm.created_at,
      (SELECT count(*)::int FROM memberships ms WHERE ms.client_id=c.id AND ms.module_key=m.key AND ms.status='active') AS active_users,
      (SELECT max(a.created_at) FROM audit_events a WHERE a.client_id=c.id AND a.module_key=m.key) AS last_activity
      FROM clients c CROSS JOIN modules m
      LEFT JOIN client_modules cm ON cm.client_id=c.id AND cm.module_key=m.key
      LEFT JOIN db_registry r ON r.client_id=c.id AND r.module_key=m.key
      WHERE c.deleted_at IS NULL AND ($1::uuid IS NULL OR c.id=$1)
        AND ($2::text IS NULL OR m.key=$2) AND ($3::text IS NULL OR coalesce(cm.status,'not_enabled')=$3)
      ORDER BY c.name,m.key`,[filters.client_id??null,filters.module_key??null,filters.status??null]);
    const includeCounts=filters.include_counts!=='false';
    const data=includeCounts?await Promise.all(result.rows.map(async(row)=>{
      const record=row as Record<string,unknown>;
      const status=String(record.status);
      const count=status==='active'
        ?await tenantRecordCount(registry,String(record.client_id),record.module_key as ModuleKey)
        :null;
      return {...record,record_count:count};
    })):result.rows;
    res.json({data});
  }));

  router.get('/provisioning-jobs', asyncHandler(async(req,res)=>{
    const status=typeof req.query.status==='string'?req.query.status:null;
    const clientId=typeof req.query.client_id==='string'?body(uuid,req.query.client_id):null;
    const result=await platformDb.query(`SELECT j.id::text,j.client_id::text,c.name AS client_name,j.module_key,j.job_type,j.step,j.status,j.attempts,j.last_error,j.steps,j.created_at,j.started_at,j.finished_at
      FROM provisioning_jobs j JOIN clients c ON c.id=j.client_id
      WHERE ($1::text IS NULL OR j.status=$1) AND ($2::uuid IS NULL OR j.client_id=$2)
      ORDER BY j.created_at DESC LIMIT 100`,[status,clientId]);
    res.json({data:result.rows});
  }));
  router.get('/provisioning-jobs/:id',asyncHandler(async(req,res)=>{
    const result=await platformDb.query(`SELECT id::text,client_id::text,module_key,job_type,step,status,attempts,last_error,steps,created_at,started_at,finished_at FROM provisioning_jobs WHERE id=$1`,[body(uuid,req.params.id)]);
    if(!result.rows[0])throw new AppError('NOT_FOUND'); res.json({data:result.rows[0]});
  }));
  router.post('/provisioning-jobs/:id/retry',requireCsrf,asyncHandler(async(req,res)=>{
    const id=body(uuid,req.params.id); const ok=await retryProvisioningJob(platformDb,id);
    if(!ok)throw new AppError('CONFLICT','This job cannot be retried in its current state.');
    await audit(platformDb,req,{action:'provisioning.retry',entity:'provisioning_job',entityId:id});
    res.json({data:{queued:true,id}});
  }));
  router.post('/provisioning-jobs/:id/cancel',requireCsrf,asyncHandler(async(req,res)=>{
    const id=body(uuid,req.params.id);
    const result=await platformDb.query(`UPDATE provisioning_jobs SET status='cancelled',step='cancelled',finished_at=now(),updated_at=now(),steps=steps||jsonb_build_array(jsonb_build_object('step','cancelled','at',now())) WHERE id=$1 AND status='queued' RETURNING id::text,client_id::text,module_key`,[id]);
    if(!result.rows[0])throw new AppError('CONFLICT','Only queued provisioning jobs can be cancelled.');
    await audit(platformDb,req,{action:'provisioning.cancel',entity:'provisioning_job',entityId:id,clientId:result.rows[0].client_id,after:result.rows[0]});res.json({data:{cancelled:true,id}});
  }));

  router.get('/plans',asyncHandler(async(_req,res)=>{
    const result=await platformDb.query('SELECT id::text,key::text,name,max_users,max_branches,max_modules,storage_mb,price_pkr::text,is_active FROM plans ORDER BY name');res.json({data:result.rows});
  }));
  router.get('/usage',asyncHandler(async(req,res)=>{
    const clientId=typeof req.query.client_id==='string'?body(uuid,req.query.client_id):null;
    const result=await platformDb.query(`SELECT u.client_id::text,c.name AS client_name,u.module_key,u.metric,u.value,u.period_start
      FROM usage_counters u JOIN clients c ON c.id=u.client_id WHERE ($1::uuid IS NULL OR u.client_id=$1)
      ORDER BY u.period_start DESC,c.name,u.module_key,u.metric LIMIT 2000`,[clientId]);res.json({data:result.rows});
  }));
  router.get('/health',asyncHandler(async(_req,res)=>{
    const [registryHealth,jobs,dbPing]=await Promise.all([
      platformDb.query(`SELECT health,count(*)::int AS count FROM db_registry GROUP BY health`),
      platformDb.query(`SELECT status,count(*)::int AS count FROM provisioning_jobs WHERE status IN ('queued','running','failed') GROUP BY status`),
      platformDb.ping().then(()=>true).catch(()=>false),
    ]);
    res.json({data:{platform_database:dbPing?'up':'down',tenant_pools:registry.poolCount,registry:registryHealth.rows,provisioning_jobs:jobs.rows}});
  }));

  router.get('/audit',asyncHandler(async(req,res)=>{
    const page=body(z.coerce.number().int().min(1).default(1),req.query.page??1);
    const perPage=body(z.coerce.number().int().min(1).max(100).default(25),req.query.per_page??25);
    const actor=typeof req.query.actor==='string'?body(uuid,req.query.actor):null;
    const action=typeof req.query.action==='string'?req.query.action.slice(0,120):null;
    const clientId=typeof req.query.client_id==='string'?body(uuid,req.query.client_id):null;
    const module=typeof req.query.module_key==='string'?body(moduleKey,req.query.module_key):null;
    const from=dateParam(req.query.from);
    const to=dateParam(req.query.to);
    const where=`WHERE ($1::uuid IS NULL OR actor_id=$1) AND ($2::text IS NULL OR action=$2)
        AND ($3::uuid IS NULL OR client_id=$3) AND ($4::text IS NULL OR module_key=$4)
        AND ($5::timestamptz IS NULL OR created_at >= $5) AND ($6::timestamptz IS NULL OR created_at <= $6)`;
    const params=[actor,action,clientId,module,from,to];
    const result=await platformDb.query(`SELECT id::text,actor_type,actor_id::text,client_id::text,module_key,action,entity,entity_id::text,"before","after",ip::text,user_agent,request_id,platform_override,created_at FROM audit_events ${where} ORDER BY created_at DESC LIMIT $7 OFFSET $8`,[...params,perPage,(page-1)*perPage]);
    const count=await platformDb.query<{total:string}>(`SELECT count(*)::text AS total FROM audit_events ${where}`,params);
    res.json({data:result.rows,meta:{page,per_page:perPage,total:Number(count.rows[0]?.total??0)}});
  }));
  router.get('/audit/export',asyncHandler(async(req,res)=>{
    const actor=typeof req.query.actor==='string'?body(uuid,req.query.actor):null;
    const action=typeof req.query.action==='string'?req.query.action.slice(0,120):null;
    const clientId=typeof req.query.client_id==='string'?body(uuid,req.query.client_id):null;
    const module=typeof req.query.module_key==='string'?body(moduleKey,req.query.module_key):null;
    const from=dateParam(req.query.from);
    const to=dateParam(req.query.to);
    const result=await platformDb.query(`SELECT created_at,actor_type,actor_id::text,client_id::text,module_key,action,entity,entity_id::text,platform_override,request_id FROM audit_events
      WHERE ($1::uuid IS NULL OR actor_id=$1) AND ($2::text IS NULL OR action=$2)
        AND ($3::uuid IS NULL OR client_id=$3) AND ($4::text IS NULL OR module_key=$4)
        AND ($5::timestamptz IS NULL OR created_at >= $5) AND ($6::timestamptz IS NULL OR created_at <= $6)
      ORDER BY created_at DESC LIMIT 5000`,[actor,action,clientId,module,from,to]);
    const fields=['created_at','actor_type','actor_id','client_id','module_key','action','entity','entity_id','platform_override','request_id'];
    const cell=(value:unknown)=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`;};
    const csv=[fields.join(','),...result.rows.map(row=>fields.map((field)=>cell((row as Record<string,unknown>)[field])).join(','))].join('\r\n');
    res.set('Content-Type','text/csv; charset=utf-8').set('Content-Disposition','attachment; filename="platform-audit.csv"').set('Cache-Control','no-store').send(csv);
  }));

  router.post('/access/enter',requireCsrf,asyncHandler(async(req,res)=>{
    const input=body(z.object({client_id:uuid,module_key:moduleKey,mode:z.enum(['inspect','support']).default('inspect'),reason:z.string().trim().min(3).max(500)}),req.body);
    const clientId=input.client_id; const key=input.module_key as ModuleKey;
    if(input.mode==='support'&&req.auth!.claims.impersonated_by)throw new AppError('FORBIDDEN');
    const result=await platformDb.query<{id:string;mode:'inspect'|'support';reason:string;started_at:Date;expires_at:Date}>(`INSERT INTO platform_module_access(platform_user_id,client_id,module_key,mode,reason)
      SELECT $1,$2,$3,$4,$5 WHERE EXISTS(SELECT 1 FROM client_modules WHERE client_id=$2 AND module_key=$3 AND status IN ('active','archived'))
      RETURNING id::text,mode,reason,started_at,expires_at`,[req.auth!.userId,clientId,key,input.mode,input.reason]);
    const access=result.rows[0];
    if(!access)throw new AppError('NOT_FOUND','An accessible module instance was not found.');
    const token=await signModuleAccessToken({platformUserId:req.auth!.userId,accessId:access.id,clientId,moduleKey:key,mode:access.mode,reason:access.reason});
    setModuleAccessCookie(res,token);
    await audit(platformDb,req,{action:'module_access.enter',entity:'platform_module_access',entityId:access.id,clientId,after:{module_key:key,mode:input.mode,reason:input.reason}});
    res.status(201).json({data:{...access,client_id:clientId,module_key:key,access_token:token,expires_in_seconds:MODULE_ACCESS_TTL_SECONDS}});
  }));
  router.post('/access/exit',requireCsrf,asyncHandler(async(req,res)=>{
    const id=body(z.object({access_id:uuid}),req.body).access_id; const result=await platformDb.query(`UPDATE platform_module_access SET ended_at=now() WHERE id=$1 AND platform_user_id=$2 AND ended_at IS NULL RETURNING id::text,client_id::text,module_key,mode`,[id,req.auth!.userId]);
    if(!result.rows[0])throw new AppError('NOT_FOUND'); clearModuleAccessCookie(res); await audit(platformDb,req,{action:'module_access.exit',entity:'platform_module_access',entityId:id,clientId:result.rows[0].client_id,after:result.rows[0]});res.json({data:{ended:true}});
  }));
  router.get('/access/active',asyncHandler(async(req,res)=>{
    const result=await platformDb.query(`SELECT a.id::text,a.client_id::text,c.name AS client_name,a.module_key,a.mode,a.reason,a.started_at,a.expires_at FROM platform_module_access a JOIN clients c ON c.id=a.client_id WHERE a.platform_user_id=$1 AND a.ended_at IS NULL AND a.revoked_at IS NULL AND a.expires_at>now() ORDER BY a.started_at DESC`,[req.auth!.userId]);res.json({data:result.rows});
  }));
  router.get('/access/log',asyncHandler(async(req,res)=>{
    const clientId=typeof req.query.client_id==='string'?body(uuid,req.query.client_id):null;
    const module=typeof req.query.module_key==='string'?body(moduleKey,req.query.module_key):null;
    const mode=typeof req.query.mode==='string'?body(z.enum(['inspect','support']),req.query.mode):null;
    const userId=typeof req.query.platform_user_id==='string'?body(uuid,req.query.platform_user_id):null;
    const from=dateParam(req.query.from); const to=dateParam(req.query.to);
    const limit=body(z.coerce.number().int().min(1).max(1000).default(200),req.query.limit??200);
    const result=await platformDb.query(`SELECT a.id::text,a.platform_user_id::text,u.email::text AS platform_user_email,a.client_id::text,c.name AS client_name,a.module_key,a.mode,a.reason,a.started_at,a.expires_at,a.ended_at,a.revoked_at
      FROM platform_module_access a JOIN clients c ON c.id=a.client_id JOIN platform_users u ON u.id=a.platform_user_id
      WHERE ($1::uuid IS NULL OR a.client_id=$1) AND ($2::text IS NULL OR a.module_key=$2) AND ($3::text IS NULL OR a.mode=$3)
        AND ($4::uuid IS NULL OR a.platform_user_id=$4) AND ($5::timestamptz IS NULL OR a.started_at >= $5) AND ($6::timestamptz IS NULL OR a.started_at <= $6)
      ORDER BY a.started_at DESC LIMIT $7`,[clientId,module,mode,userId,from,to,limit]);res.json({data:result.rows});
  }));

  router.post('/impersonate',requireCsrf,asyncHandler(async(req,res)=>{
    const input=body(z.object({user_id:uuid,client_id:uuid.optional(),reason:z.string().trim().min(3).max(500)}),req.body);
    let clientId=input.client_id??null;
    if(!clientId){
      const memberships=await platformDb.query<{client_id:string}>(
        `SELECT DISTINCT m.client_id::text FROM memberships m
           JOIN clients c ON c.id=m.client_id AND c.status='active' AND c.deleted_at IS NULL
          WHERE m.user_id=$1 AND m.status='active'`,[input.user_id]);
      if(memberships.rows.length===0)throw new AppError('FORBIDDEN','The target user has no active client membership.');
      if(memberships.rows.length>1)throw new AppError('VALIDATION_ERROR','client_id is required when the user belongs to multiple clients.');
      clientId=memberships.rows[0]!.client_id;
    }
    const handle=await startImpersonation(platformDb,{platformUserId:req.auth!.userId,targetUserId:input.user_id,clientId,reason:input.reason,ip:req.ip,userAgent:req.get('user-agent'),requestId:req.requestId});
    res.status(201).json({data:{id:handle.id,client_id:clientId,started_at:handle.startedAt,expires_at:handle.expiresAt}});
  }));
  router.post('/impersonate/:id/end',requireCsrf,asyncHandler(async(req,res)=>{
    await endImpersonation(platformDb,{id:body(uuid,req.params.id),platformUserId:req.auth!.userId,ip:req.ip,userAgent:req.get('user-agent'),requestId:req.requestId});res.json({data:{ended:true}});
  }));

  router.get('/platform-users',asyncHandler(async(_req,res)=>{
    const result=await platformDb.query(`SELECT id::text,email::text,full_name,status,mfa_enabled,must_change_password,last_login_at,created_at
      FROM platform_users ORDER BY created_at`);
    res.json({data:result.rows});
  }));
  router.post('/platform-users',requireCsrf,asyncHandler(async(req,res)=>{
    const input=body(z.object({
      email:z.string().trim().email().max(254),
      full_name:z.string().trim().min(2).max(160),
      password:z.string().min(12).max(128).optional(),
    }),req.body);
    const password=input.password??randomBytes(18).toString('base64url');
    const passwordHash=await hashPassword(password);
    const inserted=await platformDb.query(
      `INSERT INTO platform_users(email,full_name,password_hash,must_change_password)
       VALUES($1,$2,$3,true)
       RETURNING id::text,email::text,full_name,status,mfa_enabled,must_change_password,created_at`,
      [input.email.toLowerCase(),input.full_name,passwordHash],
    ).catch((error:unknown)=>{
      if(typeof error==='object'&&error!==null&&(error as {code?:string}).code==='23505'){
        throw new AppError('CONFLICT','A platform user with this email already exists.');
      }
      throw error;
    });
    const user=inserted.rows[0]!;
    await audit(platformDb,req,{action:'platform_user.create',entity:'platform_user',entityId:user.id,after:{email:user.email,full_name:user.full_name}});
    res.status(201).json({data:{...user,temporary_password:input.password?undefined:password}});
  }));
  router.patch('/platform-users/:id',requireCsrf,asyncHandler(async(req,res)=>{
    const id=body(uuid,req.params.id);
    const input=body(z.object({action:z.enum(['suspend','reactivate','reset_password'])}),req.body);
    const current=await platformDb.query<{status:string;email:string}>(`SELECT status,email::text FROM platform_users WHERE id=$1`,[id]);
    const row=current.rows[0];
    if(!row)throw new AppError('NOT_FOUND');
    if(input.action==='suspend'&&id===req.auth!.userId)throw new AppError('FORBIDDEN','You cannot suspend your own account.');
    if(input.action==='suspend'||input.action==='reactivate'){
      const status=input.action==='suspend'?'suspended':'active';
      await platformDb.query('UPDATE platform_users SET status=$2 WHERE id=$1',[id,status]);
      if(input.action==='suspend'){
        await platformDb.query(`UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND realm='platform' AND revoked_at IS NULL`,[id]);
      }
      await audit(platformDb,req,{action:`platform_user.${input.action}`,entity:'platform_user',entityId:id,before:{status:row.status},after:{status}});
      res.json({data:{id,status}});return;
    }
    const password=randomBytes(18).toString('base64url');
    await platformDb.query(
      `UPDATE platform_users SET password_hash=$2,must_change_password=true,failed_login_count=0,locked_until=NULL WHERE id=$1`,
      [id,await hashPassword(password)],
    );
    await platformDb.query(`UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND realm='platform' AND revoked_at IS NULL`,[id]);
    await audit(platformDb,req,{action:'platform_user.password.reset',entity:'platform_user',entityId:id});
    res.json({data:{id,temporary_password:password,must_change_password:true}});
  }));

  router.get('/clients/:id/memberships',asyncHandler(async(req,res)=>{
    const result=await platformDb.query(`SELECT m.id::text,m.user_id::text,u.email::text,u.full_name,m.module_key,m.role,m.status,m.created_at,u.last_login_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.client_id=$1 AND u.deleted_at IS NULL ORDER BY u.full_name,m.module_key`,[body(uuid,req.params.id)]);res.json({data:result.rows});
  }));
  router.post('/clients/:id/admins',requireCsrf,asyncHandler(async(req,res)=>{
    const clientId=body(uuid,req.params.id);
    const input=body(z.object({email:z.string().trim().email().max(254),full_name:z.string().trim().min(2).max(160),module_key:moduleKey,module_grants:z.array(z.string().min(1).max(120)).max(300)}),req.body);
    const grants=expandPermissionKeys(input.module_grants,{enabledModules:[input.module_key],allowPlatform:false});
    const capacity=await clientUserCapacity(platformDb,clientId);
    if(capacity.active>=capacity.limit)throw new AppError('CONFLICT',`User limit reached for this client (${capacity.limit}).`);
    const user=await createClientAdmin(platformDb,{clientId,email:input.email,fullName:input.full_name,moduleKey:input.module_key as ModuleKey,grants,actorId:req.auth!.userId});
    await audit(platformDb,req,{action:'client_admin.invite',entity:'membership',entityId:user.membershipId,clientId,after:{email:input.email,module_key:input.module_key,grant_count:grants.length}});
    res.status(201).json({data:{user_id:user.userId,membership_id:user.membershipId,email:input.email.toLowerCase(),module_key:input.module_key,invite_token:user.token,expires_in_seconds:config.inviteTtlHours*3600}});
  }));
  router.patch('/clients/:id/admins/:membershipId',requireCsrf,asyncHandler(async(req,res)=>{
    const clientId=body(uuid,req.params.id);const membershipId=body(uuid,req.params.membershipId);
    const input=body(z.object({action:z.enum(['suspend','reactivate','reset_password','revoke_sessions'])}),req.body);
    const member=await platformDb.query<{user_id:string;module_key:string;status:string}>(`SELECT user_id::text,module_key,status FROM memberships WHERE id=$1 AND client_id=$2 AND role='client_admin'`,[membershipId,clientId]);
    const row=member.rows[0];if(!row)throw new AppError('NOT_FOUND');
    if(input.action==='suspend'||input.action==='reactivate'){
      const status=input.action==='suspend'?'suspended':'active';
      await platformDb.query('UPDATE memberships SET status=$2 WHERE id=$1',[membershipId,status]);
      if(input.action==='suspend')await platformDb.query(`UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND realm='tenant' AND revoked_at IS NULL`,[row.user_id]);
      await audit(platformDb,req,{action:`client_admin.${input.action}`,entity:'membership',entityId:membershipId,clientId,before:{status:row.status},after:{status}});
      res.json({data:{membership_id:membershipId,status}});return;
    }
    if(input.action==='revoke_sessions'){
      const revoked=await platformDb.query(`UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND realm='tenant' AND revoked_at IS NULL RETURNING id`,[row.user_id]);
      await audit(platformDb,req,{action:'client_admin.sessions.revoke',entity:'user',entityId:row.user_id,clientId,after:{revoked_count:revoked.rowCount??0}});
      res.json({data:{revoked_count:revoked.rowCount??0}});return;
    }
    const token=randomBytes(32).toString('base64url');
    await platformDb.transaction(async(tx)=>{
      await tx.query(`UPDATE users SET password_hash=NULL,status='invited',must_change_password=true,invite_expires_at=now()+interval '7 days' WHERE id=$1 AND deleted_at IS NULL`,[row.user_id]);
      await tx.query(`UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND realm='tenant' AND revoked_at IS NULL`,[row.user_id]);
      await tx.query(`INSERT INTO invite_tokens(user_id,client_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,now()+interval '7 days',$4)`,[row.user_id,clientId,createHash('sha256').update(token).digest('hex'),req.auth!.userId]);
    });
    await audit(platformDb,req,{action:'client_admin.password.reset',entity:'user',entityId:row.user_id,clientId});
    res.json({data:{user_id:row.user_id,invite_token:token,expires_in_seconds:604800}});
  }));
  router.get('/clients/:id/usage',asyncHandler(async(req,res)=>{
    const result=await platformDb.query('SELECT module_key,metric,value,period_start FROM usage_counters WHERE client_id=$1 ORDER BY period_start DESC,metric',[body(uuid,req.params.id)]);res.json({data:result.rows});
  }));
  router.get('/clients/:id/audit',asyncHandler(async(req,res)=>{
    const result=await platformDb.query(`SELECT id::text,actor_type,actor_id::text,module_key,action,entity,entity_id::text,"before","after",created_at FROM audit_events WHERE client_id=$1 ORDER BY created_at DESC LIMIT 200`,[body(uuid,req.params.id)]);res.json({data:result.rows});
  }));
  router.post('/clients/:id/modules/:module/deprovision',requireCsrf,asyncHandler(async(req,res)=>{
    const clientId=body(uuid,req.params.id);const key=body(moduleKey,req.params.module) as ModuleKey;
    const result=await requestDeprovisioning(platformDb,{clientId,moduleKey:key,createdBy:req.auth!.userId});
    await audit(platformDb,req,{action:'module.deprovision.request',entity:'client_module',clientId,after:{module_key:key,...result}});res.status(202).json({data:result});
  }));

  return router;
}

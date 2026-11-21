import type { PlatformDb } from '../db/platform';
import { withTenantTx } from '../db/tenant';
import type { TenantRequestContext } from '../tenancy/context';
import { sanitizeAuditValue } from './sanitize';

export type AuditEventInput = {
  actorId?: string | null;
  actorType: 'platform' | 'tenant' | 'system';
  action: string;
  entity?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  reason?: string | null;
  platformOverride?: boolean;
};

function safeJson(value: unknown): string | null {
  const sanitized = sanitizeAuditValue(value);
  return sanitized === null ? null : JSON.stringify(sanitized);
}

export async function writePlatformAudit(
  platformDb: PlatformDb,
  input: AuditEventInput & { clientId?: string | null; moduleKey?: string | null },
): Promise<void> {
  await platformDb.query(
    `INSERT INTO audit_events (
       actor_type, actor_id, client_id, module_key, action, entity, entity_id,
       "before", "after", ip, user_agent, request_id, platform_override
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13)`,
    [
      input.actorType,
      input.actorId ?? null,
      input.clientId ?? null,
      input.moduleKey ?? null,
      input.action,
      input.entity ?? null,
      input.entityId ?? null,
      safeJson(input.before),
      safeJson(input.after),
      input.ip ?? null,
      input.userAgent ?? null,
      input.requestId ?? null,
      input.platformOverride ?? false,
    ],
  );
}

export async function writeModuleAudit(
  context: TenantRequestContext,
  input: AuditEventInput,
): Promise<void> {
  const actorId = input.actorId ?? context.actor.userId;
  const actorType = input.actorType;
  const platformOverride = input.platformOverride ?? context.actor.kind === 'platform';

  await withTenantTx(context.pool, context, async (client) => {
    await client.query(
      `INSERT INTO module_audit (
         client_id, module_key, actor_id, actor_type, action, entity, entity_id,
         "before", "after", reason, platform_override, request_id, ip
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13)`,
      [
        context.clientId,
        context.moduleKey,
        actorId,
        actorType,
        input.action,
        input.entity ?? null,
        input.entityId ?? null,
        safeJson(input.before),
        safeJson(input.after),
        input.reason ?? (context.actor.kind === 'platform' ? context.actor.reason : null),
        platformOverride,
        input.requestId ?? null,
        input.ip ?? null,
      ],
    );
  });
}

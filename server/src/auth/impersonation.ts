import { config } from '../config';
import type { PlatformDb } from '../db/platform';
import { AppError } from '../http/errors';

export type StartImpersonationInput = {
  platformUserId: string;
  targetUserId: string;
  clientId: string;
  reason: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
};

export type ImpersonationHandle = {
  id: string;
  startedAt: Date;
  expiresAt: Date;
};

export function impersonationExpiresAt(startedAt: Date): Date {
  return new Date(startedAt.getTime() + config.impersonationTtlMinutes * 60_000);
}

export function isImpersonationExpired(startedAt: Date, now = new Date()): boolean {
  return impersonationExpiresAt(startedAt).getTime() <= now.getTime();
}

export async function startImpersonation(
  platformDb: PlatformDb,
  input: StartImpersonationInput,
): Promise<ImpersonationHandle> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new AppError('VALIDATION_ERROR', 'A reason is required for impersonation.', {
      field: 'reason',
    });
  }

  const membership = await platformDb.query(
    `SELECT 1
       FROM memberships m
       JOIN users u
         ON u.id = m.user_id
        AND u.status = 'active'
        AND u.deleted_at IS NULL
       JOIN clients c
         ON c.id = m.client_id
        AND c.status = 'active'
        AND c.deleted_at IS NULL
      WHERE m.user_id = $1
        AND m.client_id = $2
        AND m.status = 'active'
      LIMIT 1`,
    [input.targetUserId, input.clientId],
  );

  if ((membership.rowCount ?? 0) === 0) {
    throw new AppError('FORBIDDEN', 'The target user has no active membership in this client.');
  }

  const result = await platformDb.query<{ id: string; started_at: Date }>(
    `INSERT INTO impersonation_sessions (
       platform_user_id,
       target_user_id,
       client_id,
       reason
     )
     VALUES ($1, $2, $3, $4)
     RETURNING id::text, started_at`,
    [input.platformUserId, input.targetUserId, input.clientId, reason],
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('INTERNAL', 'Unable to start impersonation.');
  }

  const expiresAt = impersonationExpiresAt(row.started_at);

  await platformDb.query(
    `INSERT INTO audit_events (
       actor_type,
       actor_id,
       client_id,
       action,
       entity,
       entity_id,
       after,
       ip,
       user_agent,
       request_id
     )
     VALUES (
       'platform',
       $1,
       $2,
       'impersonation.start',
       'impersonation_session',
       $3,
       $4::jsonb,
       $5,
       $6,
       $7
     )`,
    [
      input.platformUserId,
      input.clientId,
      row.id,
      JSON.stringify({ reason, target_user_id: input.targetUserId }),
      input.ip ?? null,
      input.userAgent ?? null,
      input.requestId ?? null,
    ],
  );

  return {
    id: row.id,
    startedAt: row.started_at,
    expiresAt,
  };
}

export async function loadActiveImpersonation(
  platformDb: PlatformDb,
  id: string,
  platformUserId: string,
): Promise<ImpersonationHandle | null> {
  const result = await platformDb.query<{
    id: string;
    started_at: Date;
    ended_at: Date | null;
  }>(
    `SELECT id::text, started_at, ended_at
       FROM impersonation_sessions
      WHERE id = $1
        AND platform_user_id = $2`,
    [id, platformUserId],
  );

  const row = result.rows[0];
  if (!row || row.ended_at || isImpersonationExpired(row.started_at)) {
    return null;
  }

  return {
    id: row.id,
    startedAt: row.started_at,
    expiresAt: impersonationExpiresAt(row.started_at),
  };
}

export async function endImpersonation(
  platformDb: PlatformDb,
  input: {
    id: string;
    platformUserId: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  },
): Promise<void> {
  const result = await platformDb.query<{
    id: string;
    client_id: string;
    target_user_id: string;
  }>(
    `UPDATE impersonation_sessions
        SET ended_at = now()
      WHERE id = $1
        AND platform_user_id = $2
        AND ended_at IS NULL
      RETURNING id::text, client_id::text, target_user_id::text`,
    [input.id, input.platformUserId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('NOT_FOUND', 'Active impersonation session was not found.');
  }

  await platformDb.query(
    `INSERT INTO audit_events (
       actor_type,
       actor_id,
       client_id,
       action,
       entity,
       entity_id,
       after,
       ip,
       user_agent,
       request_id
     )
     VALUES (
       'platform',
       $1,
       $2,
       'impersonation.end',
       'impersonation_session',
       $3,
       $4::jsonb,
       $5,
       $6,
       $7
     )`,
    [
      input.platformUserId,
      row.client_id,
      row.id,
      JSON.stringify({ target_user_id: row.target_user_id }),
      input.ip ?? null,
      input.userAgent ?? null,
      input.requestId ?? null,
    ],
  );
}

import { config } from '../config';
import type { PlatformDb } from '../db/platform';
import { createRefreshToken } from './tokens';
import type { Realm, SessionRecord } from './types';

const SESSION_COLUMNS = `id::text,
  actor_type,
  realm,
  user_id::text,
  refresh_token_hash,
  csrf_secret,
  expires_at,
  refresh_expires_at,
  revoked_at,
  client_id::text,
  active_module,
  host(ip) AS ip,
  user_agent,
  created_at,
  last_used_at`;

export type CreateSessionInput = {
  realm: Realm;
  userId: string;
  clientId: string | null;
  activeModule: string | null;
  csrfSecret: string;
  ip?: string | null;
  userAgent?: string | null;
};

export type CreatedSession = {
  id: string;
  refreshToken: string;
  csrfSecret: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
};

export type SessionListRow = {
  id: string;
  realm: Realm;
  client_id: string | null;
  active_module: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date;
  refresh_expires_at: Date;
  revoked_at: Date | null;
};

export async function createSession(
  platformDb: PlatformDb,
  input: CreateSessionInput,
): Promise<CreatedSession> {
  const refresh = createRefreshToken();

  const result = await platformDb.query<{ id: string; expires_at: Date; refresh_expires_at: Date }>(
    `INSERT INTO sessions (
       actor_type,
       realm,
       user_id,
       client_id,
       active_module,
       refresh_token_hash,
       csrf_secret,
       expires_at,
       refresh_expires_at,
       ip,
       user_agent
     )
     VALUES (
       $1,
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       now() + ($7 * interval '1 second'),
       now() + ($8 * interval '1 day'),
       $9,
       $10
     )
     RETURNING id::text, expires_at, refresh_expires_at`,
    [
      input.realm,
      input.userId,
      input.clientId,
      input.activeModule,
      refresh.hash,
      input.csrfSecret,
      config.accessTokenTtlSeconds,
      config.refreshTokenTtlDays,
      input.ip ?? null,
      input.userAgent ?? null,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to create session');
  }

  return {
    id: row.id,
    refreshToken: refresh.token,
    csrfSecret: input.csrfSecret,
    expiresAt: row.expires_at,
    refreshExpiresAt: row.refresh_expires_at,
  };
}

export async function findSessionByRefreshHash(
  platformDb: PlatformDb,
  hash: string,
): Promise<SessionRecord | null> {
  const result = await platformDb.query<SessionRecord>(
    `SELECT ${SESSION_COLUMNS}
       FROM sessions
      WHERE refresh_token_hash = $1
        AND revoked_at IS NULL
        AND refresh_expires_at > now()`,
    [hash],
  );

  return result.rows[0] ?? null;
}

export async function loadSessionForRequest(
  platformDb: PlatformDb,
  sessionId: string,
  realm: Realm,
): Promise<SessionRecord | null> {
  const result = await platformDb.query<SessionRecord>(
    `SELECT ${SESSION_COLUMNS}
       FROM sessions
      WHERE id = $1
        AND realm = $2
        AND revoked_at IS NULL
        AND refresh_expires_at > now()`,
    [sessionId, realm],
  );

  return result.rows[0] ?? null;
}

export async function rotateRefreshSession(
  platformDb: PlatformDb,
  currentHash: string,
  accessTtlSeconds: number,
  refreshTtlDays: number,
): Promise<{ session: SessionRecord; refreshToken: string } | null> {
  const next = createRefreshToken();

  const session = await platformDb.transaction(async (client) => {
    const result = await client.query<SessionRecord>(
      `SELECT ${SESSION_COLUMNS}
         FROM sessions
        WHERE refresh_token_hash = $1
          AND revoked_at IS NULL
          AND refresh_expires_at > now()
        FOR UPDATE`,
      [currentHash],
    );

    const current = result.rows[0];
    if (!current) {
      return null;
    }

    await client.query(
      `UPDATE sessions
          SET refresh_token_hash = $2,
              expires_at = now() + ($3 * interval '1 second'),
              refresh_expires_at = now() + ($4 * interval '1 day'),
              last_used_at = now()
        WHERE id = $1`,
      [current.id, next.hash, accessTtlSeconds, refreshTtlDays],
    );

    return current;
  });

  return session ? { session, refreshToken: next.token } : null;
}

export async function revokeSession(
  platformDb: PlatformDb,
  sessionId: string,
  userId: string,
  realm: Realm,
): Promise<boolean> {
  const result = await platformDb.query(
    `UPDATE sessions
        SET revoked_at = now()
      WHERE id = $1
        AND user_id = $2
        AND realm = $3
        AND revoked_at IS NULL`,
    [sessionId, userId, realm],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function revokeSessionById(
  platformDb: PlatformDb,
  sessionId: string,
  userId: string,
  realm: Realm,
): Promise<boolean> {
  return revokeSession(platformDb, sessionId, userId, realm);
}

export async function revokeOtherSessions(
  platformDb: PlatformDb,
  userId: string,
  realm: Realm,
  keepSessionId: string,
): Promise<number> {
  const result = await platformDb.query(
    `UPDATE sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND realm = $2
        AND id <> $3
        AND revoked_at IS NULL`,
    [userId, realm, keepSessionId],
  );

  return result.rowCount ?? 0;
}

export async function revokeAllUserSessions(
  platformDb: PlatformDb,
  userId: string,
  realm: Realm,
): Promise<number> {
  const result = await platformDb.query(
    `UPDATE sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND realm = $2
        AND revoked_at IS NULL`,
    [userId, realm],
  );

  return result.rowCount ?? 0;
}

export async function listSessions(
  platformDb: PlatformDb,
  userId: string,
  realm: Realm,
): Promise<SessionListRow[]> {
  const result = await platformDb.query<SessionListRow>(
    `SELECT id::text,
            realm,
            client_id::text,
            active_module,
            host(ip) AS ip,
            user_agent,
            created_at,
            last_used_at,
            expires_at,
            refresh_expires_at,
            revoked_at
       FROM sessions
      WHERE user_id = $1
        AND realm = $2
        AND revoked_at IS NULL
        AND refresh_expires_at > now()
      ORDER BY created_at DESC`,
    [userId, realm],
  );

  return result.rows;
}

export async function touchSession(platformDb: PlatformDb, sessionId: string): Promise<void> {
  await platformDb.query('UPDATE sessions SET last_used_at = now() WHERE id = $1', [sessionId]);
}

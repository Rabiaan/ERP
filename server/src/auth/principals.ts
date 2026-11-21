import { AppError } from '../http/errors';
import type { PlatformDb } from '../db/platform';
import type { AuthUserRecord, Realm, TenantMembership } from './types';
import { resolveUserMembershipPermissionHashes } from '../authz/resolver';

type MembershipRow = {
  id: string;
  client_id: string;
  client_name: string;
  module_key: string;
  role: string;
};

type FailedLoginRow = {
  failed_login_count: number;
  locked_until: Date | null;
};

type InviteRow = {
  id: string;
  user_id: string;
  client_id: string | null;
  expires_at: Date;
  user_email: string;
  user_full_name: string;
  user_status: string;
  user_invite_expires_at: Date | null;
};

const USER_COLUMNS = `id::text,
  email::text,
  full_name,
  password_hash,
  status,
  mfa_enabled,
  mfa_secret_enc,
  must_change_password,
  failed_login_count,
  locked_until,
  last_login_at`;

export async function loadPlatformUserByEmail(
  platformDb: PlatformDb,
  email: string,
): Promise<AuthUserRecord | null> {
  const result = await platformDb.query<AuthUserRecord>(
    `SELECT ${USER_COLUMNS}
       FROM platform_users
      WHERE email = $1`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function loadTenantUserByEmail(
  platformDb: PlatformDb,
  email: string,
): Promise<AuthUserRecord | null> {
  const result = await platformDb.query<AuthUserRecord>(
    `SELECT ${USER_COLUMNS}
       FROM users
      WHERE email = $1
        AND deleted_at IS NULL`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function loadUserById(
  platformDb: PlatformDb,
  realm: Realm,
  userId: string,
): Promise<AuthUserRecord | null> {
  const table = realm === 'platform' ? 'platform_users' : 'users';
  const result = await platformDb.query<AuthUserRecord>(
    `SELECT ${USER_COLUMNS}
       FROM ${table}
      WHERE id = $1${realm === 'tenant' ? ' AND deleted_at IS NULL' : ''}`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function loadTenantMemberships(
  platformDb: PlatformDb,
  userId: string,
): Promise<TenantMembership[]> {
  const result = await platformDb.query<MembershipRow>(
    `SELECT m.client_id::text,
            m.id::text,
            c.name AS client_name,
            m.module_key,
            m.role,
            m.status
       FROM memberships m
       JOIN clients c
         ON c.id = m.client_id
        AND c.status = 'active'
        AND c.deleted_at IS NULL
       JOIN client_modules cm
         ON cm.client_id = m.client_id
        AND cm.module_key = m.module_key
        AND cm.status = 'active'
      WHERE m.user_id = $1
        AND m.status = 'active'
      ORDER BY c.name, m.module_key`,
    [userId],
  );

  const hashes = await resolveUserMembershipPermissionHashes(platformDb, userId);
  return result.rows.map((row) => {
    const permissionsHash = hashes.get(row.id);
    if (!permissionsHash) {
      throw new AppError('INTERNAL', 'Unable to resolve effective membership permissions.');
    }

    return {
      clientId: row.client_id,
      clientName: row.client_name,
      moduleKey: row.module_key,
      role: row.role,
      permissionsHash,
    };
  });
}

export async function recordFailedLogin(
  platformDb: PlatformDb,
  realm: Realm,
  userId: string,
  maxFailures: number,
  lockMinutes: number,
): Promise<{ locked: boolean; failedCount: number; lockedUntil: Date | null }> {
  const table = realm === 'platform' ? 'platform_users' : 'users';
  const result = await platformDb.query<FailedLoginRow>(
    `UPDATE ${table}
        SET failed_login_count = failed_login_count + 1,
            locked_until = CASE
              WHEN failed_login_count + 1 >= $2
              THEN now() + ($3 * interval '1 minute')
              ELSE locked_until
            END
      WHERE id = $1
      RETURNING failed_login_count, locked_until`,
    [userId, maxFailures, lockMinutes],
  );

  const row = result.rows[0];
  if (!row) {
    return { locked: false, failedCount: 0, lockedUntil: null };
  }

  return {
    locked: row.failed_login_count >= maxFailures,
    failedCount: row.failed_login_count,
    lockedUntil: row.locked_until,
  };
}

export async function clearLoginFailures(
  platformDb: PlatformDb,
  realm: Realm,
  userId: string,
): Promise<void> {
  const table = realm === 'platform' ? 'platform_users' : 'users';
  await platformDb.query(
    `UPDATE ${table}
        SET failed_login_count = 0,
            locked_until = NULL,
            last_login_at = now()
      WHERE id = $1`,
    [userId],
  );
}

export async function updatePasswordHash(
  platformDb: PlatformDb,
  realm: Realm,
  userId: string,
  passwordHash: string,
  options?: { mustChangePassword?: boolean; activate?: boolean },
): Promise<void> {
  const table = realm === 'platform' ? 'platform_users' : 'users';
  const assignments = ['password_hash = $2'];
  const values: unknown[] = [userId, passwordHash];

  if (options?.mustChangePassword !== undefined) {
    values.push(options.mustChangePassword);
    assignments.push(`must_change_password = $${values.length}`);
  }

  if (options?.activate && realm === 'tenant') {
    assignments.push("status = 'active'");
  }

  await platformDb.query(
    `UPDATE ${table}
        SET ${assignments.join(', ')}
      WHERE id = $1`,
    values,
  );
}

export async function setMfaSecret(
  platformDb: PlatformDb,
  realm: Realm,
  userId: string,
  encryptedSecret: string,
): Promise<void> {
  const table = realm === 'platform' ? 'platform_users' : 'users';
  await platformDb.query(`UPDATE ${table} SET mfa_secret_enc = $2 WHERE id = $1`, [
    userId,
    encryptedSecret,
  ]);
}

export async function setMfaEnabled(
  platformDb: PlatformDb,
  realm: Realm,
  userId: string,
  enabled: boolean,
): Promise<void> {
  const table = realm === 'platform' ? 'platform_users' : 'users';
  await platformDb.query(`UPDATE ${table} SET mfa_enabled = $2 WHERE id = $1`, [
    userId,
    enabled,
  ]);
}

export async function findInviteByHash(
  platformDb: PlatformDb,
  tokenHash: string,
): Promise<InviteRow | null> {
  const result = await platformDb.query<InviteRow>(
    `SELECT it.id::text,
            it.user_id::text,
            it.client_id::text,
            it.expires_at,
            u.email::text AS user_email,
            u.full_name AS user_full_name,
            u.status AS user_status,
            u.invite_expires_at AS user_invite_expires_at
       FROM invite_tokens it
       JOIN users u ON u.id = it.user_id
      WHERE it.token_hash = $1
        AND it.used_at IS NULL
        AND u.deleted_at IS NULL`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function markInviteUsed(
  platformDb: PlatformDb,
  inviteId: string,
  userId: string,
  passwordHash: string,
  fullName: string,
): Promise<void> {
  await platformDb.transaction(async (client) => {
    const update = await client.query(
      `UPDATE invite_tokens
          SET used_at = now()
        WHERE id = $1
          AND used_at IS NULL`,
      [inviteId],
    );

    if ((update.rowCount ?? 0) === 0) {
      throw new Error('Invite token was already used');
    }

    await client.query(
      `UPDATE users
          SET password_hash = $2,
              full_name = $3,
              status = 'active',
              must_change_password = false,
              invite_expires_at = NULL,
              failed_login_count = 0,
              locked_until = NULL
        WHERE id = $1`,
      [userId, passwordHash, fullName],
    );
  });
}

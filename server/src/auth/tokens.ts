import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config';
import { AppError } from '../http/errors';
import type { AccessClaims, MfaChallengeClaims, Realm } from './types';

const ISSUER = 'lilac-office';
const ACCESS_AUDIENCE = 'lilac-api';
const MFA_AUDIENCE = 'lilac-mfa';
const MODULE_ACCESS_AUDIENCE = 'lilac-module-access';
export const MODULE_ACCESS_TTL_SECONDS = 30 * 60;

function deriveKey(label: string): Buffer {
  return createHash('sha256').update(`${config.appSecret}:${label}`, 'utf8').digest();
}

const JWT_KEY = deriveKey('jwt');
const REFRESH_BYTES = 32;

export type RefreshToken = {
  token: string;
  hash: string;
};

export function createRefreshToken(): RefreshToken {
  const token = randomBytes(REFRESH_BYTES).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const { sub, ...payload } = claims;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(ACCESS_AUDIENCE)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .setJti(randomBytes(16).toString('base64url'))
    .sign(JWT_KEY);
}

function isMembershipClaim(value: unknown): value is AccessClaims['memberships'][number] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.module_key === 'string' &&
    typeof item.role === 'string' &&
    typeof item.permissions_hash === 'string'
  );
}

export async function verifyAccessToken(
  token: string,
  expectedRealm: Realm,
): Promise<AccessClaims> {
  let payload: Record<string, unknown>;

  try {
    const verified = await jwtVerify(token, JWT_KEY, {
      issuer: ISSUER,
      audience: ACCESS_AUDIENCE,
      algorithms: ['HS256'],
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Session token is invalid or expired.');
  }

  const realm = payload.realm;
  if (realm !== expectedRealm) {
    throw new AppError('FORBIDDEN', 'This token belongs to a different realm.');
  }

  if (
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string' ||
    (payload.actor_type !== 'platform' && payload.actor_type !== 'tenant') ||
    (payload.realm !== 'platform' && payload.realm !== 'tenant') ||
    !Array.isArray(payload.memberships) ||
    !payload.memberships.every(isMembershipClaim) ||
    typeof payload.platform_override !== 'boolean' ||
    typeof payload.must_change_password !== 'boolean'
  ) {
    throw new AppError('UNAUTHENTICATED', 'Session token is invalid or expired.');
  }

  const clientId = payload.client_id;
  const activeModule = payload.active_module;
  const impersonatedBy = payload.impersonated_by;

  if (
    (clientId !== null && typeof clientId !== 'string') ||
    (activeModule !== null && typeof activeModule !== 'string') ||
    (impersonatedBy !== null && typeof impersonatedBy !== 'string')
  ) {
    throw new AppError('UNAUTHENTICATED', 'Session token is invalid or expired.');
  }

  return {
    sub: payload.sub,
    sid: payload.sid,
    actor_type: payload.actor_type,
    realm: payload.realm,
    client_id: clientId,
    memberships: payload.memberships,
    active_module: activeModule,
    platform_override: payload.platform_override,
    impersonated_by: impersonatedBy,
    must_change_password: payload.must_change_password,
  };
}

export async function signMfaChallenge(claims: MfaChallengeClaims): Promise<string> {
  const { sub, ...payload } = claims;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(MFA_AUDIENCE)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${config.mfaChallengeTtlSeconds}s`)
    .setJti(randomBytes(16).toString('base64url'))
    .sign(JWT_KEY);
}

export type ModuleAccessClaims = {
  platformUserId: string;
  accessId: string;
  clientId: string;
  moduleKey: string;
  mode: 'inspect' | 'support';
  reason: string;
};

export async function signModuleAccessToken(claims: ModuleAccessClaims): Promise<string> {
  return new SignJWT({
    purpose: 'module_access',
    access_id: claims.accessId,
    client_id: claims.clientId,
    module_key: claims.moduleKey,
    mode: claims.mode,
    reason: claims.reason,
    platform_override: true,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(MODULE_ACCESS_AUDIENCE)
    .setSubject(claims.platformUserId)
    .setIssuedAt()
    .setExpirationTime(`${MODULE_ACCESS_TTL_SECONDS}s`)
    .setJti(randomBytes(16).toString('base64url'))
    .sign(JWT_KEY);
}

export async function verifyModuleAccessToken(token: string): Promise<ModuleAccessClaims> {
  let payload: Record<string, unknown>;

  try {
    const verified = await jwtVerify(token, JWT_KEY, {
      issuer: ISSUER,
      audience: MODULE_ACCESS_AUDIENCE,
      algorithms: ['HS256'],
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Module access token is invalid or expired.');
  }

  if (
    typeof payload.sub !== 'string' ||
    payload.purpose !== 'module_access' ||
    typeof payload.access_id !== 'string' ||
    typeof payload.client_id !== 'string' ||
    typeof payload.module_key !== 'string' ||
    (payload.mode !== 'inspect' && payload.mode !== 'support') ||
    typeof payload.reason !== 'string' ||
    payload.platform_override !== true
  ) {
    throw new AppError('UNAUTHENTICATED', 'Module access token is invalid or expired.');
  }

  return {
    platformUserId: payload.sub,
    accessId: payload.access_id,
    clientId: payload.client_id,
    moduleKey: payload.module_key,
    mode: payload.mode,
    reason: payload.reason,
  };
}

export async function verifyMfaChallenge(
  token: string,
  expectedRealm: Realm,
): Promise<MfaChallengeClaims> {
  let payload: Record<string, unknown>;

  try {
    const verified = await jwtVerify(token, JWT_KEY, {
      issuer: ISSUER,
      audience: MFA_AUDIENCE,
      algorithms: ['HS256'],
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw new AppError('UNAUTHENTICATED', 'The MFA challenge is invalid or expired.');
  }

  if (payload.realm !== expectedRealm) {
    throw new AppError('FORBIDDEN', 'This MFA challenge belongs to a different realm.');
  }

  if (
    typeof payload.sub !== 'string' ||
    payload.purpose !== 'mfa' ||
    (payload.client_id !== null && typeof payload.client_id !== 'string') ||
    (payload.active_module !== null && typeof payload.active_module !== 'string')
  ) {
    throw new AppError('UNAUTHENTICATED', 'The MFA challenge is invalid or expired.');
  }

  return {
    sub: payload.sub,
    realm: expectedRealm,
    purpose: 'mfa',
    client_id: payload.client_id,
    active_module: payload.active_module,
  };
}

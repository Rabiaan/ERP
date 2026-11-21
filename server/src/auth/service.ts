import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { config } from '../config';
import type { PlatformDb } from '../db/platform';
import { AppError } from '../http/errors';
import type { KmsProvider } from '../kms/local';
import { createCsrfNonce, createCsrfToken } from './csrf';
import {
  assertPasswordAllowed,
  hashPassword,
  passwordNeedsRehash,
  verifyDummyPassword,
  verifyPassword,
} from './password';
import {
  clearLoginFailures,
  findInviteByHash,
  loadPlatformUserByEmail,
  loadTenantMemberships,
  loadTenantUserByEmail,
  loadUserById,
  markInviteUsed,
  recordFailedLogin,
  setMfaEnabled,
  setMfaSecret,
  updatePasswordHash,
} from './principals';
import { enforceRateLimit } from './rate-limit';
import {
  createSession,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  rotateRefreshSession,
  type SessionListRow,
} from './sessions';
import { buildTotpUri, generateTotpSecret, verifyTotp } from './totp';
import {
  hashRefreshToken,
  signAccessToken,
  signMfaChallenge,
  verifyMfaChallenge,
} from './tokens';
import type {
  AccessClaims,
  AuthContext,
  AuthUserRecord,
  AuthUserView,
  MembershipClaim,
  Realm,
  TenantMembership,
} from './types';

const INVALID_CREDENTIALS = 'Invalid email or password.';
const MAX_USER_AGENT_LENGTH = 512;
const MAX_FULL_NAME_LENGTH = 160;

export type SessionIssued = {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessExpiresIn: number;
  refreshExpiresIn: number;
  user: AuthUserView;
};

export type LoginResult =
  | { status: 'authenticated'; auth: SessionIssued }
  | {
      status: 'mfa_required';
      challengeToken: string;
      enrollmentRequired: boolean;
      otpauthUri?: string;
    };

export type LoginInput = {
  realm: Realm;
  email: string;
  password: string;
  clientId?: string;
  moduleKey?: string;
  ip?: string;
  userAgent?: string;
};

export type RefreshResult = SessionIssued;

export type MfaConfirmResult =
  | { status: 'authenticated'; auth: SessionIssued }
  | { status: 'enabled' };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeIp(ip: string | undefined): string | null {
  if (!ip) {
    return null;
  }

  const cleaned = ip.replace(/^::ffff:/, '');
  return isIP(cleaned) ? cleaned : null;
}

function normalizeUserAgent(userAgent: string | undefined): string | null {
  return userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null;
}

function lockedError(lockedUntil: Date | null): AppError {
  const retryAfter = lockedUntil
    ? Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000))
    : config.loginLockMinutes * 60;

  return new AppError('ACCOUNT_LOCKED', 'This account is temporarily locked.', {
    retry_after_seconds: retryAfter,
  });
}

function resolveMembership(
  memberships: TenantMembership[],
  clientId?: string,
  moduleKey?: string,
): TenantMembership {
  const candidates = memberships.filter(
    (membership) =>
      (!clientId || membership.clientId === clientId) &&
      (!moduleKey || membership.moduleKey === moduleKey),
  );

  const selected = candidates[0];
  if (!selected) {
    throw new AppError('FORBIDDEN', 'No active client module is available for this account.');
  }

  return selected;
}

function toMembershipClaims(memberships: TenantMembership[]): MembershipClaim[] {
  return memberships.map((membership) => ({
    module_key: membership.moduleKey,
    role: membership.role,
    permissions_hash: membership.permissionsHash,
  }));
}

function toUserView(
  user: AuthUserRecord,
  realm: Realm,
  memberships: MembershipClaim[],
  clientId: string | null,
  activeModule: string | null,
): AuthUserView {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    realm,
    status: user.status,
    mfa_enabled: user.mfa_enabled,
    must_change_password: user.must_change_password,
    client_id: clientId,
    active_module: activeModule,
    memberships,
  };
}

function buildClaims(
  user: AuthUserRecord,
  realm: Realm,
  sessionId: string,
  memberships: MembershipClaim[],
  clientId: string | null,
  activeModule: string | null,
  platformOverride = false,
  impersonatedBy: string | null = null,
): AccessClaims {
  return {
    sub: user.id,
    sid: sessionId,
    actor_type: realm,
    realm,
    client_id: clientId,
    memberships,
    active_module: activeModule,
    platform_override: platformOverride,
    impersonated_by: impersonatedBy,
    must_change_password: user.must_change_password,
  };
}

async function issueSession(
  platformDb: PlatformDb,
  user: AuthUserRecord,
  realm: Realm,
  memberships: TenantMembership[],
  selected: TenantMembership | null,
  ip?: string,
  userAgent?: string,
): Promise<SessionIssued> {
  const membershipClaims = toMembershipClaims(memberships);
  const clientId = selected?.clientId ?? null;
  const activeModule = selected?.moduleKey ?? null;
  const csrfSecret = createCsrfNonce();
  const session = await createSession(platformDb, {
    realm,
    userId: user.id,
    clientId,
    activeModule,
    csrfSecret,
    ip: normalizeIp(ip),
    userAgent: normalizeUserAgent(userAgent),
  });

  const claims = buildClaims(
    user,
    realm,
    session.id,
    membershipClaims,
    clientId,
    activeModule,
  );
  const accessToken = await signAccessToken(claims);

  return {
    sessionId: session.id,
    accessToken,
    refreshToken: session.refreshToken,
    csrfToken: createCsrfToken(csrfSecret),
    accessExpiresIn: config.accessTokenTtlSeconds,
    refreshExpiresIn: config.refreshTokenTtlDays * 24 * 60 * 60,
    user: toUserView(user, realm, membershipClaims, clientId, activeModule),
  };
}

async function loadMembershipContext(
  platformDb: PlatformDb,
  realm: Realm,
  user: AuthUserRecord,
  clientId: string | null,
  activeModule: string | null,
): Promise<{ memberships: TenantMembership[]; selected: TenantMembership | null }> {
  if (realm === 'platform') {
    return { memberships: [], selected: null };
  }

  const memberships = await loadTenantMemberships(platformDb, user.id);
  const selected = resolveMembership(
    memberships,
    clientId ?? undefined,
    activeModule ?? undefined,
  );
  return { memberships, selected };
}

export async function login(
  platformDb: PlatformDb,
  kms: KmsProvider,
  input: LoginInput,
): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  const user =
    input.realm === 'platform'
      ? await loadPlatformUserByEmail(platformDb, email)
      : await loadTenantUserByEmail(platformDb, email);

  if (!user) {
    await verifyDummyPassword(input.password);
    throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS);
  }

  if (user.status !== 'active') {
    await verifyDummyPassword(input.password);
    throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS);
  }

  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    throw lockedError(user.locked_until);
  }

  const valid = user.password_hash
    ? await verifyPassword(user.password_hash, input.password)
    : false;

  if (!valid) {
    if (!user.password_hash) {
      await verifyDummyPassword(input.password);
    }

    const failed = await recordFailedLogin(
      platformDb,
      input.realm,
      user.id,
      config.loginMaxFailures,
      config.loginLockMinutes,
    );

    if (failed.locked) {
      throw lockedError(failed.lockedUntil);
    }

    throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS);
  }

  if (user.password_hash && passwordNeedsRehash(user.password_hash)) {
    await updatePasswordHash(platformDb, input.realm, user.id, await hashPassword(input.password));
  }

  await clearLoginFailures(platformDb, input.realm, user.id);

  const { memberships, selected } = await loadMembershipContext(
    platformDb,
    input.realm,
    user,
    input.clientId ?? null,
    input.moduleKey ?? null,
  );

  if (user.mfa_enabled) {
    const challengeToken = await signMfaChallenge({
      sub: user.id,
      realm: input.realm,
      purpose: 'mfa',
      client_id: selected?.clientId ?? null,
      active_module: selected?.moduleKey ?? null,
    });

    return {
      status: 'mfa_required',
      challengeToken,
      enrollmentRequired: false,
    };
  }

  if (input.realm === 'platform' && config.mfaRequiredPlatform) {
    const secret = generateTotpSecret();
    const encrypted = await kms.encrypt(secret);
    await setMfaSecret(platformDb, input.realm, user.id, encrypted);

    const challengeToken = await signMfaChallenge({
      sub: user.id,
      realm: input.realm,
      purpose: 'mfa',
      client_id: null,
      active_module: null,
    });

    return {
      status: 'mfa_required',
      challengeToken,
      enrollmentRequired: true,
      otpauthUri: buildTotpUri(secret, user.email, config.mfaIssuer),
    };
  }

  return {
    status: 'authenticated',
    auth: await issueSession(
      platformDb,
      user,
      input.realm,
      memberships,
      selected,
      input.ip,
      input.userAgent,
    ),
  };
}

export async function verifyMfa(
  platformDb: PlatformDb,
  kms: KmsProvider,
  input: {
    realm: Realm;
    challengeToken: string;
    code: string;
    ip?: string;
    userAgent?: string;
  },
): Promise<SessionIssued> {
  const challenge = await verifyMfaChallenge(input.challengeToken, input.realm);

  await enforceRateLimit(
    platformDb,
    `mfa:user:${createHash('sha256').update(challenge.sub).digest('hex')}`,
    config.authMfaUserLimit,
    config.authWindowSeconds,
  );

  const user = await loadUserById(platformDb, input.realm, challenge.sub);
  if (!user || user.status !== 'active' || !user.mfa_enabled || !user.mfa_secret_enc) {
    throw new AppError('UNAUTHENTICATED', 'This MFA challenge cannot be completed.');
  }

  const secret = await kms.decrypt(user.mfa_secret_enc);
  if (!verifyTotp(secret, input.code)) {
    throw new AppError('UNAUTHENTICATED', 'The authentication code is invalid.');
  }

  const { memberships, selected } = await loadMembershipContext(
    platformDb,
    input.realm,
    user,
    challenge.client_id,
    challenge.active_module,
  );

  await clearLoginFailures(platformDb, input.realm, user.id);

  return issueSession(
    platformDb,
    user,
    input.realm,
    memberships,
    selected,
    input.ip,
    input.userAgent,
  );
}

export async function enrollMfa(
  platformDb: PlatformDb,
  kms: KmsProvider,
  realm: Realm,
  userId: string,
): Promise<{ otpauthUri: string }> {
  const user = await loadUserById(platformDb, realm, userId);
  if (!user || user.status !== 'active') {
    throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
  }

  if (user.mfa_enabled) {
    throw new AppError('CONFLICT', 'Multi-factor authentication is already enabled.');
  }

  const secret = generateTotpSecret();
  await setMfaSecret(platformDb, realm, userId, await kms.encrypt(secret));

  return {
    otpauthUri: buildTotpUri(secret, user.email, config.mfaIssuer),
  };
}

export async function confirmMfa(
  platformDb: PlatformDb,
  kms: KmsProvider,
  input: {
    realm: Realm;
    code: string;
    auth?: AuthContext;
    challengeToken?: string;
    ip?: string;
    userAgent?: string;
  },
): Promise<MfaConfirmResult> {
  let userId: string;
  let challengeClientId: string | null = null;
  let challengeActiveModule: string | null = null;

  if (input.challengeToken) {
    const challenge = await verifyMfaChallenge(input.challengeToken, input.realm);
    userId = challenge.sub;
    challengeClientId = challenge.client_id;
    challengeActiveModule = challenge.active_module;
  } else if (input.auth && input.auth.realm === input.realm) {
    userId = input.auth.userId;
  } else {
    throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
  }

  const user = await loadUserById(platformDb, input.realm, userId);
  if (!user || user.status !== 'active' || !user.mfa_secret_enc) {
    throw new AppError('UNAUTHENTICATED', 'MFA enrollment could not be completed.');
  }

  const secret = await kms.decrypt(user.mfa_secret_enc);
  if (!verifyTotp(secret, input.code)) {
    throw new AppError('UNAUTHENTICATED', 'The authentication code is invalid.');
  }

  await setMfaEnabled(platformDb, input.realm, userId, true);

  if (!input.challengeToken) {
    return { status: 'enabled' };
  }

  const { memberships, selected } = await loadMembershipContext(
    platformDb,
    input.realm,
    user,
    challengeClientId,
    challengeActiveModule,
  );

  return {
    status: 'authenticated',
    auth: await issueSession(
      platformDb,
      user,
      input.realm,
      memberships,
      selected,
      input.ip,
      input.userAgent,
    ),
  };
}

export async function refreshSession(
  platformDb: PlatformDb,
  realm: Realm,
  refreshToken: string,
  ip?: string,
  userAgent?: string,
): Promise<RefreshResult> {
  const rotated = await rotateRefreshSession(
    platformDb,
    hashRefreshToken(refreshToken),
    config.accessTokenTtlSeconds,
    config.refreshTokenTtlDays,
  );

  if (!rotated || rotated.session.realm !== realm) {
    throw new AppError('UNAUTHENTICATED', 'Your session has expired. Sign in again.');
  }

  const user = await loadUserById(platformDb, realm, rotated.session.user_id);
  if (!user || user.status !== 'active') {
    await revokeSession(platformDb, rotated.session.id, rotated.session.user_id, realm);
    throw new AppError('UNAUTHENTICATED', 'Your session is no longer valid.');
  }

  const { memberships, selected } = await loadMembershipContext(
    platformDb,
    realm,
    user,
    rotated.session.client_id,
    rotated.session.active_module,
  );

  const membershipClaims = toMembershipClaims(memberships);
  const claims = buildClaims(
    user,
    realm,
    rotated.session.id,
    membershipClaims,
    selected?.clientId ?? null,
    selected?.moduleKey ?? null,
  );
  const accessToken = await signAccessToken(claims);
  const nextRefresh = rotated.refreshToken;

  await platformDb.query(
    `UPDATE sessions
        SET ip = COALESCE($2, ip),
            user_agent = COALESCE($3, user_agent)
      WHERE id = $1`,
    [rotated.session.id, normalizeIp(ip), normalizeUserAgent(userAgent)],
  );

  return {
    sessionId: rotated.session.id,
    accessToken,
    refreshToken: nextRefresh,
    csrfToken: createCsrfToken(rotated.session.csrf_secret),
    accessExpiresIn: config.accessTokenTtlSeconds,
    refreshExpiresIn: config.refreshTokenTtlDays * 24 * 60 * 60,
    user: toUserView(
      user,
      realm,
      membershipClaims,
      selected?.clientId ?? null,
      selected?.moduleKey ?? null,
    ),
  };
}

export async function logout(
  platformDb: PlatformDb,
  auth: AuthContext,
): Promise<void> {
  await revokeSession(platformDb, auth.sessionId, auth.userId, auth.realm);
}

export async function changePassword(
  platformDb: PlatformDb,
  auth: AuthContext,
  currentPassword: string,
  newPassword: string,
): Promise<AccessClaims> {
  const user = await loadUserById(platformDb, auth.realm, auth.userId);
  if (!user || !user.password_hash) {
    throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
  }

  if (!(await verifyPassword(user.password_hash, currentPassword))) {
    throw new AppError('UNAUTHENTICATED', 'The current password is incorrect.');
  }

  await assertPasswordAllowed(newPassword);
  if (currentPassword === newPassword) {
    throw new AppError('VALIDATION_ERROR', 'Choose a password different from the current one.', {
      field: 'new_password',
    });
  }

  await updatePasswordHash(
    platformDb,
    auth.realm,
    auth.userId,
    await hashPassword(newPassword),
    { mustChangePassword: false },
  );
  await revokeOtherSessions(platformDb, auth.userId, auth.realm, auth.sessionId);

  return {
    ...auth.claims,
    must_change_password: false,
  };
}

export async function acceptInvite(
  platformDb: PlatformDb,
  input: { token: string; password: string; fullName: string },
): Promise<void> {
  const invite = await findInviteByHash(
    platformDb,
    createHash('sha256').update(input.token, 'utf8').digest('hex'),
  );

  if (!invite) {
    throw new AppError('BAD_REQUEST', 'This invite is invalid or has already been used.');
  }

  if (invite.expires_at.getTime() <= Date.now()) {
    throw new AppError('BAD_REQUEST', 'This invite has expired.');
  }

  if (invite.user_invite_expires_at && invite.user_invite_expires_at.getTime() <= Date.now()) {
    throw new AppError('BAD_REQUEST', 'This invite has expired.');
  }

  if (invite.user_status !== 'invited') {
    throw new AppError('BAD_REQUEST', 'This invite is no longer available.');
  }

  const fullName = input.fullName.trim();
  if (fullName.length < 2 || fullName.length > MAX_FULL_NAME_LENGTH) {
    throw new AppError('VALIDATION_ERROR', 'Enter a valid full name.', { field: 'full_name' });
  }

  await assertPasswordAllowed(input.password);
  await markInviteUsed(
    platformDb,
    invite.id,
    invite.user_id,
    await hashPassword(input.password),
    fullName,
  );
}

export async function resetPassword(
  platformDb: PlatformDb,
  token: string,
  password: string,
): Promise<void> {
  const invite = await findInviteByHash(
    platformDb,
    createHash('sha256').update(token, 'utf8').digest('hex'),
  );

  if (!invite || invite.expires_at.getTime() <= Date.now()) {
    throw new AppError('BAD_REQUEST', 'This reset link is invalid or has expired.');
  }

  await assertPasswordAllowed(password);
  await markInviteUsed(
    platformDb,
    invite.id,
    invite.user_id,
    await hashPassword(password),
    invite.user_full_name,
  );
}

export async function authUser(
  platformDb: PlatformDb,
  auth: AuthContext,
): Promise<AuthUserView> {
  const user = await loadUserById(platformDb, auth.realm, auth.userId);
  if (!user || user.status !== 'active') {
    throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
  }

  return toUserView(
    user,
    auth.realm,
    auth.claims.memberships,
    auth.claims.client_id,
    auth.claims.active_module,
  );
}

export async function sessionHistory(
  platformDb: PlatformDb,
  auth: AuthContext,
): Promise<SessionListRow[]> {
  return listSessions(platformDb, auth.userId, auth.realm);
}

export async function revokeUserSession(
  platformDb: PlatformDb,
  auth: AuthContext,
  sessionId: string,
): Promise<void> {
  const revoked = await revokeSession(platformDb, sessionId, auth.userId, auth.realm);
  if (!revoked) {
    throw new AppError('NOT_FOUND', 'Session was not found.');
  }
}

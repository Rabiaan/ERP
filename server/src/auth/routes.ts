import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config';
import type { PlatformDb } from '../db/platform';
import { AppError, asyncHandler } from '../http/errors';
import type { KmsProvider } from '../kms/local';
import {
  accessCookieOptions,
  authCookieNames,
  clearAuthCookies,
  readCookie,
  setAuthCookies,
  setCsrfCookie,
} from './cookies';
import { assertCsrf, createCsrfToken, requireCsrf } from './csrf';
import {
  optionalRouteSession,
  requirePasswordChangeComplete,
  requireRouteSession,
} from './middleware';
import { enforceRateLimit, rateKey } from './rate-limit';
import {
  acceptInvite,
  authUser,
  changePassword,
  confirmMfa,
  enrollMfa,
  login,
  logout,
  refreshSession,
  resetPassword,
  revokeUserSession,
  sessionHistory,
  verifyMfa,
  type SessionIssued,
} from './service';
import { signAccessToken } from './tokens';
import { isRealm, type Realm } from './types';

const MODULE_KEYS = ['hr', 'retail', 'school', 'accounts'] as const;
const TOKEN_MAX_LENGTH = 512;

const loginSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
  client_id: z.string().uuid().optional(),
  module_key: z.enum(MODULE_KEYS).optional(),
});

const mfaChallengeSchema = z.object({
  challenge_token: z.string().min(20).max(TOKEN_MAX_LENGTH),
  code: z.string().trim().min(6).max(12),
});

const mfaConfirmSchema = z.object({
  code: z.string().trim().min(6).max(12),
  challenge_token: z.string().min(20).max(TOKEN_MAX_LENGTH).optional(),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: z.string().min(1).max(128),
});

const inviteAcceptSchema = z.object({
  token: z.string().min(20).max(TOKEN_MAX_LENGTH),
  password: z.string().min(1).max(128),
  full_name: z.string().trim().min(2).max(160),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().min(3).max(254),
});

const resetPasswordSchema = z.object({
  token: z.string().min(20).max(TOKEN_MAX_LENGTH),
  password: z.string().min(1).max(128),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
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

function requireRealm(req: Request): Realm {
  const value = req.params.realm;
  if (!value || !isRealm(value)) {
    throw new AppError('NOT_FOUND');
  }
  return value;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function clientAddress(req: Request): string {
  return req.ip ?? 'unknown';
}

function sendSession(res: Response, realm: Realm, session: SessionIssued): void {
  setAuthCookies(res, realm, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    csrfToken: session.csrfToken,
  });

  res.json({
    data: {
      user: session.user,
      access_expires_in: session.accessExpiresIn,
      refresh_expires_in: session.refreshExpiresIn,
      csrf_token: session.csrfToken,
    },
  });
}

export function createAuthRouter(platformDb: PlatformDb, kms: KmsProvider): Router {
  const router = Router();

  router.post(
    '/csrf',
    asyncHandler(async (_req, res) => {
      const csrfToken = createCsrfToken();
      setCsrfCookie(res, csrfToken);
      res.set('Cache-Control', 'no-store').json({ data: { csrf_token: csrfToken } });
    }),
  );

  router.post(
    '/:realm/login',
    asyncHandler(async (req, res) => {
      const realm = requireRealm(req);
      const body = parse(loginSchema, req.body);
      const email = body.email.toLowerCase();

      await enforceRateLimit(
        platformDb,
        rateKey('login:ip', realm, clientAddress(req)),
        config.authLoginIpLimit,
        config.authWindowSeconds,
        res,
      );
      await enforceRateLimit(
        platformDb,
        rateKey('login:email', realm, email),
        config.authLoginEmailLimit,
        config.authWindowSeconds,
        res,
      );

      const result = await login(platformDb, kms, {
        realm,
        email,
        password: body.password,
        clientId: body.client_id,
        moduleKey: body.module_key,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });

      if (result.status === 'mfa_required') {
        throw new AppError('MFA_REQUIRED', 'Enter your authentication code.', {
          challenge_token: result.challengeToken,
          enrollment_required: result.enrollmentRequired,
          ...(result.otpauthUri ? { otpauth_uri: result.otpauthUri } : {}),
        });
      }

      sendSession(res, realm, result.auth);
    }),
  );

  router.post(
    '/:realm/mfa/verify',
    asyncHandler(async (req, res) => {
      const realm = requireRealm(req);
      const body = parse(mfaChallengeSchema, req.body);

      await enforceRateLimit(
        platformDb,
        rateKey('mfa:ip', realm, clientAddress(req)),
        config.authMfaIpLimit,
        config.authWindowSeconds,
        res,
      );

      const session = await verifyMfa(platformDb, kms, {
        realm,
        challengeToken: body.challenge_token,
        code: body.code,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });

      sendSession(res, realm, session);
    }),
  );

  router.post(
    '/:realm/mfa/enroll',
    requireRouteSession(platformDb),
    requirePasswordChangeComplete,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const realm = requireRealm(req);
      if (!req.auth || req.auth.realm !== realm) {
        throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
      }

      const result = await enrollMfa(platformDb, kms, realm, req.auth.userId);
      res.json({ data: { otpauth_uri: result.otpauthUri } });
    }),
  );

  router.post(
    '/:realm/mfa/confirm',
    optionalRouteSession(platformDb),
    asyncHandler(async (req, res) => {
      const realm = requireRealm(req);
      const body = parse(mfaConfirmSchema, req.body);

      if (req.auth) {
        if (req.auth.realm !== realm) {
          throw new AppError('FORBIDDEN', 'This session belongs to a different realm.');
        }
        assertCsrf(req);
      }

      const result = await confirmMfa(platformDb, kms, {
        realm,
        code: body.code,
        challengeToken: body.challenge_token,
        ...(req.auth ? { auth: req.auth } : {}),
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });

      if (result.status === 'enabled') {
        res.json({ data: { enabled: true } });
        return;
      }

      sendSession(res, realm, result.auth);
    }),
  );

  router.post(
    '/:realm/refresh',
    requireCsrf,
    asyncHandler(async (req, res) => {
      const realm = requireRealm(req);
      const names = authCookieNames(realm);

      await enforceRateLimit(
        platformDb,
        rateKey('refresh:ip', realm, clientAddress(req)),
        config.authRefreshLimit,
        config.authWindowSeconds,
        res,
      );

      const refreshToken = readCookie(req, names.refresh);
      if (!refreshToken) {
        throw new AppError('UNAUTHENTICATED', 'Your session has expired. Sign in again.');
      }

      try {
        const session = await refreshSession(
          platformDb,
          realm,
          refreshToken,
          req.ip,
          req.get('user-agent') ?? undefined,
        );
        sendSession(res, realm, session);
      } catch (error) {
        clearAuthCookies(res, realm);
        throw error;
      }
    }),
  );

  router.post(
    '/:realm/logout',
    requireRouteSession(platformDb),
    requireCsrf,
    asyncHandler(async (req, res) => {
      const realm = requireRealm(req);
      if (!req.auth || req.auth.realm !== realm) {
        throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
      }

      await logout(platformDb, req.auth);
      clearAuthCookies(res, realm);
      res.json({ data: { logged_out: true } });
    }),
  );

  router.get(
    '/:realm/me',
    requireRouteSession(platformDb),
    asyncHandler(async (req, res) => {
      const realm = requireRealm(req);
      if (!req.auth || req.auth.realm !== realm) {
        throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
      }

      const user = await authUser(platformDb, req.auth);
      res.json({ data: { user } });
    }),
  );

  router.get(
    '/:realm/sessions',
    requireRouteSession(platformDb),
    requirePasswordChangeComplete,
    asyncHandler(async (req, res) => {
      const realm = requireRealm(req);
      if (!req.auth || req.auth.realm !== realm) {
        throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
      }

      const sessions = await sessionHistory(platformDb, req.auth);
      res.json({
        data: sessions.map((session) => ({
          id: session.id,
          current: session.id === req.auth?.sessionId,
          client_id: session.client_id,
          active_module: session.active_module,
          ip: session.ip,
          user_agent: session.user_agent,
          created_at: session.created_at,
          last_used_at: session.last_used_at,
          expires_at: session.expires_at,
          refresh_expires_at: session.refresh_expires_at,
        })),
      });
    }),
  );

  router.delete(
    '/:realm/sessions/:id',
    requireRouteSession(platformDb),
    requirePasswordChangeComplete,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const realm = requireRealm(req);
      if (!req.auth || req.auth.realm !== realm) {
        throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
      }

      const sessionId = parse(z.string().uuid(), req.params.id);
      await revokeUserSession(platformDb, req.auth, sessionId);
      res.json({ data: { revoked: true } });
    }),
  );

  router.post(
    '/:realm/password/change',
    requireRouteSession(platformDb),
    requireCsrf,
    asyncHandler(async (req, res) => {
      const realm = requireRealm(req);
      if (!req.auth || req.auth.realm !== realm) {
        throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
      }

      const body = parse(changePasswordSchema, req.body);
      const claims = await changePassword(
        platformDb,
        req.auth,
        body.current_password,
        body.new_password,
      );
      const accessToken = await signAccessToken(claims);
      res.cookie(authCookieNames(realm).access, accessToken, accessCookieOptions());
      res.json({ data: { changed: true } });
    }),
  );

  router.post(
    '/invite/accept',
    asyncHandler(async (req, res) => {
      const body = parse(inviteAcceptSchema, req.body);

      await enforceRateLimit(
        platformDb,
        rateKey('invite:ip', clientAddress(req)),
        config.authForgotLimit,
        config.authWindowSeconds,
        res,
      );
      await enforceRateLimit(
        platformDb,
        rateKey('invite:token', hashToken(body.token)),
        config.authForgotLimit,
        config.authWindowSeconds,
        res,
      );

      await acceptInvite(platformDb, {
        token: body.token,
        password: body.password,
        fullName: body.full_name,
      });
      res.json({ data: { accepted: true } });
    }),
  );

  router.post(
    '/password/forgot',
    asyncHandler(async (req, res) => {
      const body = parse(forgotPasswordSchema, req.body);
      const email = body.email.toLowerCase();

      await enforceRateLimit(
        platformDb,
        rateKey('forgot:ip', clientAddress(req)),
        config.authForgotLimit,
        config.authWindowSeconds,
        res,
      );
      await enforceRateLimit(
        platformDb,
        rateKey('forgot:email', email),
        config.authForgotLimit,
        config.authWindowSeconds,
        res,
      );

      res.status(202).json({ data: { accepted: true } });
    }),
  );

  router.post(
    '/password/reset',
    asyncHandler(async (req, res) => {
      const body = parse(resetPasswordSchema, req.body);

      await enforceRateLimit(
        platformDb,
        rateKey('reset:token', hashToken(body.token)),
        config.authLoginEmailLimit,
        config.authWindowSeconds,
        res,
      );

      await resetPassword(platformDb, body.token, body.password);
      res.json({ data: { reset: true } });
    }),
  );

  return router;
}

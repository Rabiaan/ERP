import type { Request, RequestHandler } from 'express';
import type { PlatformDb } from '../db/platform';
import { AppError } from '../http/errors';
import { authCookieNames, bearerToken, readCookie } from './cookies';
import { loadSessionForRequest } from './sessions';
import { verifyAccessToken } from './tokens';
import { isRealm, type Realm } from './types';

async function attachSession(
  platformDb: PlatformDb,
  realm: Realm,
  req: Request,
  required: boolean,
): Promise<boolean> {
  const name = authCookieNames(realm);
  const token = bearerToken(req) ?? readCookie(req, name.access);

  if (!token) {
    if (required) {
      throw new AppError('UNAUTHENTICATED', 'Authentication is required.');
    }
    return false;
  }

  const claims = await verifyAccessToken(token, realm);
  const session = await loadSessionForRequest(platformDb, claims.sid, realm);

  if (!session || session.user_id !== claims.sub) {
    throw new AppError('UNAUTHENTICATED', 'Session has been revoked or expired.');
  }

  if (session.client_id !== claims.client_id || session.active_module !== claims.active_module) {
    throw new AppError('UNAUTHENTICATED', 'Session context has changed.');
  }

  req.auth = {
    sessionId: session.id,
    realm,
    userId: session.user_id,
    csrfSecret: session.csrf_secret,
    claims,
  };
  return true;
}

function named(name: string, handler: RequestHandler): RequestHandler {
  Object.defineProperty(handler, 'name', { value: name, configurable: true });
  return handler;
}

export function requireSession(platformDb: PlatformDb, realm: Realm): RequestHandler {
  return named('requireSession', (req, _res, next) => {
    void attachSession(platformDb, realm, req, true).then(() => next()).catch(next);
  });
}

export function optionalSession(platformDb: PlatformDb, realm: Realm): RequestHandler {
  return named('optionalSession', (req, _res, next) => {
    void attachSession(platformDb, realm, req, false).then(() => next()).catch(next);
  });
}

function routeRealm(req: Request): Realm {
  const realm = req.params.realm;
  if (!realm || !isRealm(realm)) {
    throw new AppError('NOT_FOUND');
  }
  return realm;
}

export function requireRouteSession(platformDb: PlatformDb): RequestHandler {
  return named('requireRouteSession', (req, res, next) => {
    try {
      requireSession(platformDb, routeRealm(req))(req, res, next);
    } catch (error) {
      next(error);
    }
  });
}

export function optionalRouteSession(platformDb: PlatformDb): RequestHandler {
  return named('optionalRouteSession', (req, res, next) => {
    try {
      optionalSession(platformDb, routeRealm(req))(req, res, next);
    } catch (error) {
      next(error);
    }
  });
}

export const requirePasswordChangeComplete: RequestHandler = (req, _res, next) => {
  if (req.auth?.claims.must_change_password) {
    next(new AppError('FORBIDDEN', 'You must change your password before continuing.'));
    return;
  }

  next();
};

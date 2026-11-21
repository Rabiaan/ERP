import type { CookieOptions, Request, Response } from 'express';
import { config } from '../config';
import type { Realm } from './types';

const ACCESS_MAX_AGE_MS = config.accessTokenTtlSeconds * 1000;
const REFRESH_MAX_AGE_MS = config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
const MODULE_ACCESS_MAX_AGE_MS = 30 * 60 * 1000;
export const MODULE_ACCESS_COOKIE = 'lilac_module_access';

export type AuthCookieNames = {
  access: string;
  refresh: string;
  csrf: string;
};

export function authCookieNames(realm: Realm): AuthCookieNames {
  const prefix = realm === 'platform' ? 'lilac_platform' : 'lilac_tenant';
  return {
    access: `${prefix}_at`,
    refresh: `${prefix}_rt`,
    csrf: 'lilac_csrf',
  };
}

export function baseCookieOptions(secure = config.cookieSecure): CookieOptions {
  return {
    secure,
    sameSite: 'lax',
    path: '/',
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };
}

export function accessCookieOptions(secure = config.cookieSecure): CookieOptions {
  return {
    ...baseCookieOptions(secure),
    httpOnly: true,
    maxAge: ACCESS_MAX_AGE_MS,
  };
}

export function refreshCookieOptions(secure = config.cookieSecure): CookieOptions {
  return {
    ...baseCookieOptions(secure),
    httpOnly: true,
    maxAge: REFRESH_MAX_AGE_MS,
  };
}

export function csrfCookieOptions(secure = config.cookieSecure): CookieOptions {
  return {
    ...baseCookieOptions(secure),
    httpOnly: false,
    maxAge: REFRESH_MAX_AGE_MS,
  };
}

export type IssuedAuthCookies = {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
};

export function setAuthCookies(
  res: Response,
  realm: Realm,
  tokens: IssuedAuthCookies,
): void {
  const names = authCookieNames(realm);
  res.cookie(names.access, tokens.accessToken, accessCookieOptions());
  res.cookie(names.refresh, tokens.refreshToken, refreshCookieOptions());
  res.cookie(names.csrf, tokens.csrfToken, csrfCookieOptions());
}

export function setCsrfCookie(res: Response, csrfToken: string): void {
  res.cookie(authCookieNames('tenant').csrf, csrfToken, csrfCookieOptions());
}

export function clearAuthCookies(res: Response, realm: Realm): void {
  const names = authCookieNames(realm);
  const options = baseCookieOptions();

  res.clearCookie(names.access, { ...options, httpOnly: true });
  res.clearCookie(names.refresh, { ...options, httpOnly: true });
  res.clearCookie(names.csrf, { ...options, httpOnly: false });
}

export function setModuleAccessCookie(res: Response, token: string): void {
  res.cookie(MODULE_ACCESS_COOKIE, token, {
    ...baseCookieOptions(),
    httpOnly: true,
    maxAge: MODULE_ACCESS_MAX_AGE_MS,
  });
}

export function clearModuleAccessCookie(res: Response): void {
  res.clearCookie(MODULE_ACCESS_COOKIE, { ...baseCookieOptions(), httpOnly: true });
}

export function moduleAccessToken(req: Request): string | undefined {
  return bearerToken(req) ?? readCookie(req, MODULE_ACCESS_COOKIE);
}

export function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' ? value : undefined;
}

export function bearerToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

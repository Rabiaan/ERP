export const APP_PUBLIC_ROUTES = ['GET /api/health'] as const;

export const AUTH_PUBLIC_ROUTES = [
  'POST /csrf',
  'POST /:realm/login',
  'POST /:realm/mfa/verify',
  'POST /:realm/mfa/confirm',
  'POST /:realm/refresh',
  'POST /invite/accept',
  'POST /password/forgot',
  'POST /password/reset',
] as const;

export const AUTH_SESSION_ROUTES = [
  'POST /:realm/mfa/enroll',
  'POST /:realm/logout',
  'GET /:realm/me',
  'GET /:realm/sessions',
  'DELETE /:realm/sessions/:id',
  'POST /:realm/password/change',
] as const;

export type AuthRouteKey =
  | (typeof AUTH_PUBLIC_ROUTES)[number]
  | (typeof AUTH_SESSION_ROUTES)[number];

export const AUTH_PASSWORD_CHANGE_EXEMPT_ROUTES = [
  'GET /:realm/me',
  'POST /:realm/logout',
  'POST /:realm/password/change',
] as const;

export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

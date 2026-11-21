import type { ApiEnvelope, Realm } from './types';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

let csrfToken: string | null = null;
let currentRealm: Realm = 'tenant';

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setActiveRealm(realm: Realm): void {
  currentRealm = realm;
}

export function getActiveRealm(): Realm {
  return currentRealm;
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? '') : null;
}

export function csrfFromCookie(): string | null {
  return readCookie('lilac_csrf');
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  realm?: Realm;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  skipCsrf?: boolean;
  skipRefresh?: boolean;
  responseType?: 'json' | 'blob';
  envelope?: boolean;
}

function withQuery(path: string, query?: RequestOptions['query']): string {
  if (!query) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

async function perform<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {};
  const method = options.method ?? 'GET';
  const isMutation = method !== 'GET';
  let body: BodyInit | undefined;

  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const token = options.skipCsrf ? null : csrfToken ?? csrfFromCookie();
  if (isMutation && token && !options.skipCsrf) headers['x-csrf-token'] = token;

  const response = await fetch(withQuery(path, options.query), {
    method,
    headers,
    body,
    credentials: 'include',
    signal: options.signal,
  });

  if (!response.ok) {
    let payload: {
      error?: { code?: string; message?: string; details?: unknown; request_id?: string };
    } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = {};
    }
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'REQUEST_FAILED',
      payload.error?.message ?? `Request failed (${response.status}).`,
      payload.error?.details,
      payload.error?.request_id,
    );
  }

  if (options.responseType === 'blob') return (await response.blob()) as T;
  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as ApiEnvelope<T> & { meta?: unknown };
  if (options.envelope === false) return payload as T;
  if (payload.meta !== undefined) return { data: payload.data, meta: payload.meta } as T;
  return payload.data;
}

async function refreshSession(realm: Realm, signal?: AbortSignal): Promise<boolean> {
  try {
    if (!csrfToken && !csrfFromCookie()) await issueCsrf();
    const data = await perform<{ csrf_token: string }>(
      `/api/auth/${realm}/refresh`,
      { method: 'POST', signal, skipRefresh: true },
    );
    setCsrfToken(data.csrf_token);
    return true;
  } catch {
    setCsrfToken(null);
    return false;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const realm = options.realm ?? currentRealm;
  try {
    return await perform<T>(path, options);
  } catch (error) {
    if (
      !options.skipRefresh &&
      error instanceof ApiError &&
      error.status === 401 &&
      error.code !== 'MFA_REQUIRED' &&
      !path.includes('/auth/')
    ) {
      if (await refreshSession(realm, options.signal)) {
        return perform<T>(path, options);
      }
      window.dispatchEvent(new CustomEvent('lilac:unauthenticated', { detail: { realm } }));
    }
    throw error;
  }
}

export async function issueCsrf(): Promise<string> {
  const data = await apiRequest<{ csrf_token: string }>('/api/auth/csrf', {
    method: 'POST',
    skipCsrf: true,
    skipRefresh: true,
  });
  setCsrfToken(data.csrf_token);
  return data.csrf_token;
}

export async function apiDownload(path: string, filename: string, options: RequestOptions = {}): Promise<void> {
  const blob = await apiRequest<Blob>(path, { ...options, responseType: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

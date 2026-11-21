import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { config } from '../config';
import { AppError } from '../http/errors';
import { bearerToken, readCookie } from './cookies';

const CSRF_COOKIE = 'lilac_csrf';
const NONCE_BYTES = 32;

function csrfKey(): Buffer {
  return createHash('sha256').update(`${config.appSecret}:csrf`, 'utf8').digest();
}

function signature(nonce: string): string {
  return createHmac('sha256', csrfKey()).update(nonce, 'utf8').digest('base64url');
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createCsrfNonce(): string {
  return randomBytes(NONCE_BYTES).toString('base64url');
}

export function createCsrfToken(nonce = createCsrfNonce()): string {
  return `${nonce}.${signature(nonce)}`;
}

export function parseCsrfToken(token: string): { nonce: string; valid: boolean } {
  const separator = token.lastIndexOf('.');
  if (separator <= 0 || separator === token.length - 1) {
    return { nonce: '', valid: false };
  }

  const nonce = token.slice(0, separator);
  const supplied = token.slice(separator + 1);
  const expected = signature(nonce);

  return {
    nonce,
    valid: constantTimeEqual(supplied, expected),
  };
}

export function assertCsrf(req: Request): void {
  if (bearerToken(req)) {
    return;
  }

  const cookie = readCookie(req, CSRF_COOKIE);
  const header = req.get('x-csrf-token');

  if (!cookie || !header || !constantTimeEqual(cookie, header)) {
    throw new AppError('FORBIDDEN', 'CSRF validation failed.');
  }

  const parsed = parseCsrfToken(header);
  if (!parsed.valid) {
    throw new AppError('FORBIDDEN', 'CSRF validation failed.');
  }

  if (req.auth && !constantTimeEqual(parsed.nonce, req.auth.csrfSecret)) {
    throw new AppError('FORBIDDEN', 'CSRF validation failed.');
  }
}

export const requireCsrf: RequestHandler = (req, _res, next) => {
  try {
    assertCsrf(req);
    next();
  } catch (error) {
    next(error);
  }
};

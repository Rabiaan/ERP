import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  MFA_REQUIRED: 401,
  FORBIDDEN: 403,
  PERMISSION_ESCALATION: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  ACCOUNT_LOCKED: 423,
  MODULE_NOT_ENABLED: 403,
  MODULE_PROVISIONING: 503,
  MODULE_ARCHIVED: 403,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'The request is not valid.',
  VALIDATION_ERROR: 'Request validation failed.',
  UNAUTHENTICATED: 'Authentication is required.',
  MFA_REQUIRED: 'Multi-factor authentication is required.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  PERMISSION_ESCALATION: 'You cannot grant permissions you do not hold.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'The request conflicts with the current state.',
  PAYLOAD_TOO_LARGE: 'The request body is too large.',
  RATE_LIMITED: 'Too many requests. Try again later.',
  ACCOUNT_LOCKED: 'This account is temporarily locked.',
  MODULE_NOT_ENABLED: 'This module is not enabled for the client.',
  MODULE_PROVISIONING: 'This module is still being provisioned.',
  MODULE_ARCHIVED: 'This module has been archived.',
  SERVICE_UNAVAILABLE: 'A required service is temporarily unavailable.',
  INTERNAL: 'An unexpected error occurred.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

type ErrorWithCode = { code?: unknown };

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const code = (error as ErrorWithCode).code;
  return typeof code === 'string' ? code : undefined;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const code = readErrorCode(error);

  if (code === 'LIMIT_FILE_SIZE' || code === 'LIMIT_FILE_COUNT') {
    return new AppError('PAYLOAD_TOO_LARGE');
  }

  if (code === '23505' || code === '23503' || code === '40001') {
    return new AppError('CONFLICT');
  }

  if (code === '22P02' || code === '22007' || code === '22008' || code === '23514') {
    return new AppError('VALIDATION_ERROR');
  }

  if (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === '08001' ||
    code === '08006' ||
    code === '57P01' ||
    code === '3D000'
  ) {
    return new AppError('SERVICE_UNAVAILABLE');
  }

  return new AppError('INTERNAL');
}

export type ErrorPayload = {
  error: {
    code: ErrorCode;
    message: string;
    request_id: string;
    details?: Record<string, unknown>;
  };
};

export function errorPayload(error: AppError, requestId: string): ErrorPayload {
  return {
    error: {
      code: error.code,
      message: error.message,
      request_id: requestId,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

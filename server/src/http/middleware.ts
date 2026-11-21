import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import helmet from 'helmet';
import { config } from '../config';
import { AppError, errorPayload, toAppError } from './errors';
import { logger } from './log';
import './types';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const JSON_BODY_LIMIT = '256kb';

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      frameSrc: ["'none'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: config.isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  frameguard: { action: 'deny' },
  hsts: config.isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

  req.requestId = id;
  req.log = logger.child({ requestId: id });
  res.setHeader('x-request-id', id);
  next();
};

export const securityHeaders: RequestHandler = (req, res, next) => {
  helmetMiddleware(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }

    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    next();
  });
};

function logPath(req: express.Request): string {
  if (req.route?.path) {
    return `${req.baseUrl}${String(req.route.path)}`;
  }

  return req.path
    .split('/')
    .map((segment) => (segment.length > 32 ? ':param' : segment))
    .join('/');
}

export const requestLogger: RequestHandler = (req, res, next) => {
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    req.log.info('http.request', {
      method: req.method,
      path: logPath(req),
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      ip: req.ip,
    });
  });

  next();
};

export const jsonBody: RequestHandler = express.json({
  limit: JSON_BODY_LIMIT,
  strict: true,
  type: ['application/json', 'application/*+json'],
});

export const urlEncodedBody: RequestHandler = express.urlencoded({
  extended: false,
  limit: JSON_BODY_LIMIT,
  parameterLimit: 100,
});

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND'));
};

type BodyParserError = {
  type?: unknown;
  status?: unknown;
  body?: unknown;
};

function bodyParserError(error: unknown): AppError | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const parser = error as BodyParserError;

  if (parser.type === 'entity.too.large') {
    return new AppError('PAYLOAD_TOO_LARGE');
  }

  if (parser.type === 'entity.parse.failed' || (parser.status === 400 && 'body' in parser)) {
    return new AppError('VALIDATION_ERROR', 'Request body is not valid JSON.');
  }

  return undefined;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = bodyParserError(error) ?? toAppError(error);
  const log = req.log ?? logger;

  log.error('http.error', {
    method: req.method,
    path: logPath(req),
    status: appError.status,
    code: appError.code,
    error,
  });

  res.status(appError.status).json(errorPayload(appError, req.requestId ?? 'unknown'));
};

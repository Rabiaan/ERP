import type { RequestHandler } from 'express';
import { config } from '../config';
import { AppError } from '../http/errors';

const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'content-type, authorization, x-csrf-token, x-request-id';
const EXPOSED_HEADERS = 'x-request-id, retry-after';

export const strictCors: RequestHandler = (req, res, next) => {
  const origin = req.get('origin');

  res.vary('Origin');

  if (!origin) {
    next();
    return;
  }

  if (origin !== config.appUrl) {
    next(new AppError('FORBIDDEN', 'Origin is not allowed.'));
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
};

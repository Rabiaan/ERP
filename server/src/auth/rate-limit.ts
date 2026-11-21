import { createHash } from 'node:crypto';
import type { Response } from 'express';
import type { PlatformDb } from '../db/platform';
import { AppError } from '../http/errors';

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
};

type BucketRow = {
  count: number;
  window_start: Date;
  now: Date;
};

export function rateKey(scope: string, ...parts: string[]): string {
  return createHash('sha256')
    .update([scope, ...parts].join('\u0000'), 'utf8')
    .digest('hex');
}

export async function consumeRateLimit(
  platformDb: PlatformDb,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const result = await platformDb.query<BucketRow>(
    `WITH bucket AS (
       INSERT INTO rate_limit_buckets (bucket_key, window_start, count)
       VALUES (
         $1,
         to_timestamp(floor(extract(epoch FROM now()) / $2) * $2),
         1
       )
       ON CONFLICT (bucket_key, window_start)
       DO UPDATE SET count = rate_limit_buckets.count + 1,
                     updated_at = now()
       RETURNING count, window_start
     )
     SELECT count, window_start, now() AS now FROM bucket`,
    [key, windowSeconds],
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('INTERNAL', 'Unable to evaluate the rate limit.');
  }

  const elapsedSeconds = (row.now.getTime() - row.window_start.getTime()) / 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil(windowSeconds - elapsedSeconds));

  return {
    allowed: row.count <= limit,
    count: row.count,
    limit,
    retryAfterSeconds,
  };
}

export async function enforceRateLimit(
  platformDb: PlatformDb,
  key: string,
  limit: number,
  windowSeconds: number,
  res?: Response,
): Promise<void> {
  const result = await consumeRateLimit(platformDb, key, limit, windowSeconds);

  if (result.allowed) {
    return;
  }

  res?.set('Retry-After', String(result.retryAfterSeconds));
  throw new AppError('RATE_LIMITED', 'Too many requests. Try again later.', {
    retry_after_seconds: result.retryAfterSeconds,
  });
}

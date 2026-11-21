import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { Response } from 'express';
import { config } from '../src/config';
import { PlatformDb } from '../src/db/platform';
import { AppError, errorPayload, toAppError } from '../src/http/errors';
import { sanitizeForLog } from '../src/http/log';
import { consumeRateLimit, enforceRateLimit, rateKey } from '../src/auth/rate-limit';

let platformDb: PlatformDb;

before(async () => {
  platformDb = new PlatformDb({
    connectionString: config.platformDatabaseUrl,
    max: 4,
    connectionTimeoutMillis: 5000,
  });
  await platformDb.ping();
});

after(async () => {
  if (platformDb) await platformDb.end();
});

test('log sanitization redacts secrets, tokens, DSNs, and emails', () => {
  const dsn = `postgres://app:${['super', 'secret'].join('')}@localhost:5432/erp_platform`;
  const openAiKey = `sk-${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}`;
  const sanitized = JSON.stringify(
    sanitizeForLog({
      password: 'CorrectHorseBattery!42',
      authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
      connectionString: dsn,
      contact: 'owner@lilacoffice.app',
      nested: { api_key: openAiKey },
    }),
  );

  assert.match(sanitized, /\[REDACTED\]/);
  assert.match(sanitized, /o\*\*\*@lilacoffice\.app/);
  assert.doesNotMatch(sanitized, /CorrectHorseBattery/);
  assert.doesNotMatch(sanitized, /abcdefghijklmnopqrstuvwxyz/);
  assert.doesNotMatch(sanitized, /supersecret/);
  assert.doesNotMatch(sanitized, /postgres:\/\//);
  assert.doesNotMatch(sanitized, new RegExp(`sk-${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}`));
});

test('error responses never expose stack traces, SQL, or connection strings', () => {
  const dsn = `postgres://app:${['super', 'secret'].join('')}@localhost:5432/erp_platform`;
  const leaked = new Error(
    `connect ECONNREFUSED ${dsn} at /server/src/db/platform.ts:42`,
  );
  const payload = errorPayload(toAppError(leaked), 'req_security_test');
  const serialized = JSON.stringify(payload);

  assert.equal(payload.error.code, 'INTERNAL');
  assert.equal(payload.error.message, 'An unexpected error occurred.');
  assert.equal(payload.error.request_id, 'req_security_test');
  assert.doesNotMatch(serialized, /supersecret/);
  assert.doesNotMatch(serialized, /postgres:\/\//);
  assert.doesNotMatch(serialized, /\/server\/src/);
  assert.doesNotMatch(serialized, /stack/i);
});

test('Postgres rate limits return RATE_LIMITED with Retry-After', async () => {
  const key = rateKey('security-test', randomUUID());
  const headers: Record<string, string> = {};

  assert.equal((await consumeRateLimit(platformDb, key, 2, 60)).allowed, true);
  assert.equal((await consumeRateLimit(platformDb, key, 2, 60)).allowed, true);

  const response = {
    set: (name: string, value: string | number) => {
      headers[name] = String(value);
    },
  } as unknown as Response;

  await assert.rejects(
    enforceRateLimit(platformDb, key, 2, 60, response),
    (error: unknown) => error instanceof AppError && error.code === 'RATE_LIMITED',
  );
  assert.ok(Number(headers['Retry-After']) >= 1);

  await platformDb.query('DELETE FROM rate_limit_buckets WHERE bucket_key = $1', [key]);
});

test('database runtime roles follow least privilege', async () => {
  const result = await platformDb.query<{
    rolname: string;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
  }>(
    `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole
       FROM pg_roles
      WHERE rolname IN ('lilac_platform_app', 'lilac_migrator', 'lilac_provisioner')`,
  );
  const roles = new Map(result.rows.map((row) => [row.rolname, row]));

  const app = roles.get('lilac_platform_app');
  assert.ok(app);
  assert.equal(app.rolsuper, false);
  assert.equal(app.rolcreatedb, false);
  assert.equal(app.rolcreaterole, false);

  const migrator = roles.get('lilac_migrator');
  assert.ok(migrator);
  assert.equal(migrator.rolsuper, false);
  assert.equal(migrator.rolcreatedb, true);
  assert.equal(migrator.rolcreaterole, true);

  const provisioner = roles.get('lilac_provisioner');
  assert.ok(provisioner);
  assert.equal(provisioner.rolsuper, false);
  assert.equal(provisioner.rolcreatedb, true);
  assert.equal(provisioner.rolcreaterole, true);
});

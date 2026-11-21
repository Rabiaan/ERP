import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const testAppSecret = `production_${'test_app_secret'.repeat(3)}_chars`;
const testKmsKey = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const testDatabaseUrl = `postgres://lilac_platform_app:${'unusedpassword'}@localhost:5432/erp_platform`;

process.env.NODE_ENV = 'production';
process.env.APP_URL = 'https://lilac.test';
process.env.COOKIE_SECURE = 'true';
process.env.MFA_REQUIRED_PLATFORM = 'true';
process.env.APP_SECRET = testAppSecret;
process.env.KMS_LOCAL_KEY = testKmsKey;
process.env.PLATFORM_DATABASE_URL = testDatabaseUrl;
process.env.BOOT_STRICT = 'false';
process.env.LOG_LEVEL = 'error';

const { createApp } = await import('../src/app');
const { config } = await import('../src/config');

let server: Server | undefined;
let baseUrl = '';

after(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
});

test('production responses carry security headers and secure config', async () => {
  const app = createApp({
    platformDb: { ping: async () => undefined } as never,
    registry: { poolCount: 0 } as never,
    kms: {} as never,
    startedAt: Date.now(),
    version: 'production-test',
  });

  await new Promise<void>((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve());
    server = instance;
    instance.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;

  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);

  const csp = response.headers.get('content-security-policy') ?? '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(response.headers.get('strict-transport-security') ?? '', /max-age=31536000/);
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.ok(response.headers.get('x-request-id'));
  assert.equal(config.cookieSecure, true);
  assert.equal(config.mfaRequiredPlatform, true);
});

test('production boot rejects insecure cookie settings', () => {
  const tsxCli = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const script = [
    "process.env.NODE_ENV = 'production';",
    "process.env.APP_URL = 'https://lilac.test';",
    "process.env.COOKIE_SECURE = 'false';",
    "process.env.MFA_REQUIRED_PLATFORM = 'true';",
    `process.env.APP_SECRET = ${JSON.stringify(testAppSecret)};`,
    `process.env.KMS_LOCAL_KEY = ${JSON.stringify(testKmsKey)};`,
    `process.env.PLATFORM_DATABASE_URL = ${JSON.stringify(testDatabaseUrl)};`,
    "import('./server/src/config.ts')",
    '  .then(() => process.exit(0))',
    '  .catch((error) => { console.error(error.message); process.exit(1); });',
  ].join('\n');

  const result = spawnSync(process.execPath, [tsxCli, '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /COOKIE_SECURE must be true in production/);
});

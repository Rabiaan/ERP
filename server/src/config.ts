import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv({ quiet: true });

const BASE64_KEY_BYTES = 32;

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
}

function booleanEnv(fallback: boolean) {
  return z.preprocess((value) => {
    if (value === undefined || value === '') {
      return fallback;
    }
    const parsed = parseBoolean(value);
    return parsed === undefined ? value : parsed;
  }, z.boolean());
}

function optionalBooleanEnv() {
  return z.preprocess((value) => {
    if (value === undefined || value === '') {
      return undefined;
    }
    const parsed = parseBoolean(value);
    return parsed === undefined ? value : parsed;
  }, z.boolean().optional());
}

function urlEnv(protocols: readonly string[]) {
  return z.string().min(1).refine((value) => {
    try {
      return protocols.includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, `must be a URL using ${protocols.join(' or ')}`);
}

const base64KeyEnv = z.string().min(1).refine((value) => {
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === BASE64_KEY_BYTES;
}, `must be a base64-encoded ${BASE64_KEY_BYTES}-byte key`);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),
  APP_URL: urlEnv(['http:', 'https:']).default('http://localhost:3000'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  BOOT_STRICT: booleanEnv(true),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PLATFORM_DATABASE_URL: urlEnv(['postgres:', 'postgresql:']),
  PROVISIONING_DATABASE_URL: urlEnv(['postgres:', 'postgresql:']).optional(),
  PG_DUMP_DOCKER_CONTAINER: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/)
    .optional(),
  PLATFORM_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  PLATFORM_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(5000),
  APP_SECRET: z.string().min(32),
  KMS_LOCAL_KEY: base64KeyEnv,
  COOKIE_SECURE: optionalBooleanEnv(),
  MFA_REQUIRED_PLATFORM: optionalBooleanEnv(),
  ALLOW_INSECURE_COOKIES: booleanEnv(false),
  ALLOW_MFA_DISABLED: booleanEnv(false),
  TENANT_POOL_MAX: z.coerce.number().int().min(1).max(8).default(4),
  TENANT_POOL_GLOBAL_MAX: z.coerce.number().int().min(1).max(200).default(40),
  TENANT_POOL_IDLE_MS: z.coerce.number().int().min(5000).max(600000).default(60000),
  TENANT_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(5000),
  TENANT_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  TENANT_REGISTRY_CACHE_TTL_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  COOKIE_DOMAIN: z.string().min(1).optional(),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  MFA_CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  MFA_ISSUER: z.string().min(1).max(80).default('Lilac Office'),
  LOGIN_MAX_FAILURES: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  INVITE_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  AUTH_LOGIN_IP_LIMIT: z.coerce.number().int().min(1).max(10000).default(100),
  AUTH_LOGIN_EMAIL_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
  AUTH_MFA_IP_LIMIT: z.coerce.number().int().min(1).max(1000).default(50),
  AUTH_MFA_USER_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
  AUTH_REFRESH_LIMIT: z.coerce.number().int().min(1).max(10000).default(300),
  AUTH_FORGOT_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
  AUTH_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  IMPERSONATION_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  UPLOAD_DIR: z.string().min(1).default('storage/uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(2097152).default(2097152),
  BACKUP_DIR: z.string().min(1).default('storage/backups'),
});

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function looksLikePlaceholder(value: string): boolean {
  return /(change[-_ ]?me|replace|placeholder|example|dev[-_ ]?secret|dev[-_ ]?key)/i.test(value);
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new ConfigError(`Invalid environment: ${formatIssues(parsed.error)}`);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === 'production';
const cookieSecure = raw.COOKIE_SECURE ?? isProduction;
const mfaRequiredPlatform = raw.MFA_REQUIRED_PLATFORM ?? isProduction;
const appUrl = raw.APP_URL.replace(/\/+$/, '');
const productionProblems: string[] = [];

if (isProduction) {
  if (!cookieSecure && !raw.ALLOW_INSECURE_COOKIES) {
    productionProblems.push('COOKIE_SECURE must be true in production');
  }
  if (!mfaRequiredPlatform && !raw.ALLOW_MFA_DISABLED) {
    productionProblems.push('MFA_REQUIRED_PLATFORM must be true in production');
  }
  if (!appUrl.startsWith('https://')) {
    productionProblems.push('APP_URL must use https in production');
  }
  if (looksLikePlaceholder(raw.APP_SECRET)) {
    productionProblems.push('APP_SECRET must not use a development placeholder in production');
  }
  if (looksLikePlaceholder(raw.KMS_LOCAL_KEY)) {
    productionProblems.push('KMS_LOCAL_KEY must not use a development placeholder in production');
  }
}

if (productionProblems.length > 0) {
  throw new ConfigError(`Unsafe production configuration: ${productionProblems.join('; ')}`);
}

export type LogLevel = z.infer<typeof envSchema>['LOG_LEVEL'];
export type NodeEnv = z.infer<typeof envSchema>['NODE_ENV'];

export type AppConfig = {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  host: string;
  appUrl: string;
  trustProxy: number;
  bootStrict: boolean;
  logLevel: LogLevel;
  platformDatabaseUrl: string;
  provisioningDatabaseUrl?: string;
  pgDumpDockerContainer?: string;
  platformPoolMax: number;
  platformConnectionTimeoutMs: number;
  appSecret: string;
  kmsLocalKey: string;
  cookieSecure: boolean;
  mfaRequiredPlatform: boolean;
  allowInsecureCookies: boolean;
  allowMfaDisabled: boolean;
  tenantPoolMax: number;
  tenantPoolGlobalMax: number;
  tenantPoolIdleMs: number;
  tenantConnectionTimeoutMs: number;
  tenantStatementTimeoutMs: number;
  tenantRegistryCacheTtlMs: number;
  cookieDomain?: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  mfaChallengeTtlSeconds: number;
  mfaIssuer: string;
  loginMaxFailures: number;
  loginLockMinutes: number;
  inviteTtlHours: number;
  authLoginIpLimit: number;
  authLoginEmailLimit: number;
  authMfaIpLimit: number;
  authMfaUserLimit: number;
  authRefreshLimit: number;
  authForgotLimit: number;
  authWindowSeconds: number;
  impersonationTtlMinutes: number;
  uploadDir: string;
  uploadMaxBytes: number;
  backupDir: string;
};

export const config: AppConfig = Object.freeze({
  nodeEnv: raw.NODE_ENV,
  isProduction,
  port: raw.PORT,
  host: raw.HOST,
  appUrl,
  trustProxy: raw.TRUST_PROXY,
  bootStrict: raw.BOOT_STRICT,
  logLevel: raw.LOG_LEVEL,
  platformDatabaseUrl: raw.PLATFORM_DATABASE_URL,
  ...(raw.PROVISIONING_DATABASE_URL
    ? { provisioningDatabaseUrl: raw.PROVISIONING_DATABASE_URL }
    : {}),
  ...(raw.PG_DUMP_DOCKER_CONTAINER
    ? { pgDumpDockerContainer: raw.PG_DUMP_DOCKER_CONTAINER }
    : {}),
  platformPoolMax: raw.PLATFORM_POOL_MAX,
  platformConnectionTimeoutMs: raw.PLATFORM_CONNECTION_TIMEOUT_MS,
  appSecret: raw.APP_SECRET,
  kmsLocalKey: raw.KMS_LOCAL_KEY,
  cookieSecure,
  mfaRequiredPlatform,
  allowInsecureCookies: raw.ALLOW_INSECURE_COOKIES,
  allowMfaDisabled: raw.ALLOW_MFA_DISABLED,
  tenantPoolMax: raw.TENANT_POOL_MAX,
  tenantPoolGlobalMax: raw.TENANT_POOL_GLOBAL_MAX,
  tenantPoolIdleMs: raw.TENANT_POOL_IDLE_MS,
  tenantConnectionTimeoutMs: raw.TENANT_CONNECTION_TIMEOUT_MS,
  tenantStatementTimeoutMs: raw.TENANT_STATEMENT_TIMEOUT_MS,
  tenantRegistryCacheTtlMs: raw.TENANT_REGISTRY_CACHE_TTL_MS,
  ...(raw.COOKIE_DOMAIN ? { cookieDomain: raw.COOKIE_DOMAIN } : {}),
  accessTokenTtlSeconds: raw.ACCESS_TOKEN_TTL_SECONDS,
  refreshTokenTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
  mfaChallengeTtlSeconds: raw.MFA_CHALLENGE_TTL_SECONDS,
  mfaIssuer: raw.MFA_ISSUER,
  loginMaxFailures: raw.LOGIN_MAX_FAILURES,
  loginLockMinutes: raw.LOGIN_LOCK_MINUTES,
  inviteTtlHours: raw.INVITE_TTL_HOURS,
  authLoginIpLimit: raw.AUTH_LOGIN_IP_LIMIT,
  authLoginEmailLimit: raw.AUTH_LOGIN_EMAIL_LIMIT,
  authMfaIpLimit: raw.AUTH_MFA_IP_LIMIT,
  authMfaUserLimit: raw.AUTH_MFA_USER_LIMIT,
  authRefreshLimit: raw.AUTH_REFRESH_LIMIT,
  authForgotLimit: raw.AUTH_FORGOT_LIMIT,
  authWindowSeconds: raw.AUTH_WINDOW_SECONDS,
  impersonationTtlMinutes: raw.IMPERSONATION_TTL_MINUTES,
  uploadDir: raw.UPLOAD_DIR,
  uploadMaxBytes: raw.UPLOAD_MAX_BYTES,
  backupDir: raw.BACKUP_DIR,
});

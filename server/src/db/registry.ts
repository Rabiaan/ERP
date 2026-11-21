import { Pool, type QueryResultRow } from 'pg';
import { AppError } from '../http/errors';
import { logger } from '../http/log';
import type { KmsProvider } from '../kms/local';
import type { PlatformDb } from './platform';

type RegistryRow = QueryResultRow & {
  client_id: string;
  module_key: string;
  db_name: string;
  secret_ref: string;
  pool_config: unknown;
  health: string;
  schema_version: string | null;
};

type RegistryCacheEntry = {
  row: RegistryRow | null;
  expiresAt: number;
};

type PoolRecord = {
  pool: Pool;
  lastUsedAt: number;
};

type TenantPoolConfig = {
  max: number;
  statementTimeoutMs: number;
};

export type TenantPoolRegistryOptions = {
  platformDb: PlatformDb;
  kms: KmsProvider;
  maxPerTenant: number;
  globalMax: number;
  idleMs: number;
  cacheTtlMs: number;
  connectionTimeoutMs: number;
  defaultStatementTimeoutMs: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODULE_PATTERN = /^(hr|retail|school|accounts)$/;
const MIN_STATEMENT_TIMEOUT_MS = 1000;
const MAX_STATEMENT_TIMEOUT_MS = 120000;
const MAX_POOL_PER_TENANT = 8;

function readInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function assertTenantKey(clientId: string, moduleKey: string): void {
  if (!UUID_PATTERN.test(clientId) || !MODULE_PATTERN.test(moduleKey)) {
    throw new AppError('INTERNAL', 'Invalid tenant registry key');
  }
}

export class TenantPoolRegistry {
  readonly #platformDb: PlatformDb;
  readonly #kms: KmsProvider;
  readonly #maxPerTenant: number;
  readonly #globalMax: number;
  readonly #idleMs: number;
  readonly #cacheTtlMs: number;
  readonly #connectionTimeoutMs: number;
  readonly #defaultStatementTimeoutMs: number;
  readonly #pools = new Map<string, PoolRecord>();
  readonly #creating = new Map<string, Promise<Pool>>();
  readonly #cache = new Map<string, RegistryCacheEntry>();
  readonly #timer: NodeJS.Timeout;

  constructor(options: TenantPoolRegistryOptions) {
    this.#platformDb = options.platformDb;
    this.#kms = options.kms;
    this.#maxPerTenant = options.maxPerTenant;
    this.#globalMax = options.globalMax;
    this.#idleMs = options.idleMs;
    this.#cacheTtlMs = options.cacheTtlMs;
    this.#connectionTimeoutMs = options.connectionTimeoutMs;
    this.#defaultStatementTimeoutMs = options.defaultStatementTimeoutMs;

    this.#timer = setInterval(
      () => this.#evictIdle(),
      Math.max(5000, Math.min(this.#idleMs, 30000)),
    );
    this.#timer.unref();
  }

  get poolCount(): number {
    return this.#pools.size;
  }

  async getPool(clientId: string, moduleKey: string): Promise<Pool> {
    assertTenantKey(clientId, moduleKey);

    const key = this.#key(clientId, moduleKey);
    const existing = this.#pools.get(key);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.pool;
    }

    const pending = this.#creating.get(key);
    if (pending) {
      return pending;
    }

    const creation = this.#createPool(clientId, moduleKey, key).finally(() => {
      this.#creating.delete(key);
    });
    this.#creating.set(key, creation);
    return creation;
  }

  async checkHealth(clientId: string, moduleKey: string): Promise<'healthy' | 'down'> {
    try {
      const pool = await this.getPool(clientId, moduleKey);
      await pool.query('SELECT 1');
      await this.#setHealth(clientId, moduleKey, 'healthy');
      return 'healthy';
    } catch (error) {
      logger.warn('tenant.health.failed', { clientId, moduleKey, error });
      await this.#setHealth(clientId, moduleKey, 'down').catch(() => undefined);
      return 'down';
    }
  }

  async invalidate(clientId: string, moduleKey: string): Promise<void> {
    assertTenantKey(clientId, moduleKey);

    const key = this.#key(clientId, moduleKey);
    this.#cache.delete(key);

    const record = this.#pools.get(key);
    if (!record) {
      return;
    }

    this.#pools.delete(key);
    await record.pool.end().catch(() => undefined);
  }

  async closeAll(): Promise<void> {
    clearInterval(this.#timer);

    const records = [...this.#pools.values()];
    this.#pools.clear();
    this.#creating.clear();
    this.#cache.clear();

    await Promise.all(
      records.map(async (record) => {
        await record.pool.end().catch(() => undefined);
      }),
    );
  }

  #key(clientId: string, moduleKey: string): string {
    return `${clientId}:${moduleKey}`;
  }

  async #createPool(clientId: string, moduleKey: string, key: string): Promise<Pool> {
    this.#evictIdle();

    if (this.#pools.size + this.#creating.size + 1 > this.#globalMax) {
      this.#evictOldestIdle();
    }

    if (this.#pools.size + this.#creating.size + 1 > this.#globalMax) {
      throw new AppError('SERVICE_UNAVAILABLE', 'Tenant connection capacity reached.');
    }

    const row = await this.#loadRow(clientId, moduleKey, key);
    const connectionString = await this.#decryptSecret(row.secret_ref);
    const poolConfig = this.#readPoolConfig(row.pool_config);

    const pool = new Pool({
      connectionString,
      max: poolConfig.max,
      statement_timeout: poolConfig.statementTimeoutMs,
      idleTimeoutMillis: this.#idleMs,
      connectionTimeoutMillis: this.#connectionTimeoutMs,
      application_name: `lilac-tenant-${moduleKey}`,
    });

    pool.on('error', (error) => {
      logger.warn('tenant.pool.error', { clientId, moduleKey, error });
    });

    this.#pools.set(key, {
      pool,
      lastUsedAt: Date.now(),
    });

    return pool;
  }

  async #loadRow(clientId: string, moduleKey: string, key: string): Promise<RegistryRow> {
    const now = Date.now();
    const cached = this.#cache.get(key);

    if (cached && cached.expiresAt > now) {
      if (cached.row) {
        return cached.row;
      }
      throw new AppError('SERVICE_UNAVAILABLE', 'Tenant database is not registered.');
    }

    const result = await this.#platformDb.query<RegistryRow>(
      `SELECT client_id::text,
              module_key,
              db_name,
              secret_ref,
              pool_config,
              health,
              schema_version
         FROM db_registry
        WHERE client_id = $1
          AND module_key = $2`,
      [clientId, moduleKey],
    );

    const row = result.rows[0] ?? null;
    this.#cache.set(key, {
      row,
      expiresAt: now + this.#cacheTtlMs,
    });

    if (!row) {
      throw new AppError('SERVICE_UNAVAILABLE', 'Tenant database is not registered.');
    }

    return row;
  }

  async #decryptSecret(secretRef: string): Promise<string> {
    let plaintext: string;

    try {
      plaintext = await this.#kms.decrypt(secretRef);
    } catch (error) {
      logger.error('tenant.secret.decrypt_failed', { error });
      throw new AppError('SERVICE_UNAVAILABLE', 'Tenant database credentials are unavailable.');
    }

    const trimmed = plaintext.trim();
    let connectionString: string | undefined;

    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as { connectionString?: unknown };
        if (typeof parsed.connectionString === 'string') {
          connectionString = parsed.connectionString;
        }
      } catch {
        connectionString = undefined;
      }
    } else {
      connectionString = trimmed;
    }

    if (!connectionString) {
      throw new AppError('SERVICE_UNAVAILABLE', 'Tenant database credentials are invalid.');
    }

    try {
      const url = new URL(connectionString);
      if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      throw new AppError('SERVICE_UNAVAILABLE', 'Tenant database credentials are invalid.');
    }

    return connectionString;
  }

  #readPoolConfig(value: unknown): TenantPoolConfig {
    const raw =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    return {
      max: readInt(raw.max, this.#maxPerTenant, 1, MAX_POOL_PER_TENANT),
      statementTimeoutMs: readInt(
        raw.statementTimeoutMs,
        this.#defaultStatementTimeoutMs,
        MIN_STATEMENT_TIMEOUT_MS,
        MAX_STATEMENT_TIMEOUT_MS,
      ),
    };
  }

  async #setHealth(
    clientId: string,
    moduleKey: string,
    health: 'healthy' | 'down',
  ): Promise<void> {
    await this.#platformDb.query(
      `UPDATE db_registry
          SET health = $3,
              last_checked_at = now()
        WHERE client_id = $1
          AND module_key = $2`,
      [clientId, moduleKey, health],
    );
  }

  #evictIdle(): void {
    const now = Date.now();

    for (const [key, record] of this.#pools) {
      const isIdle = record.pool.idleCount === record.pool.totalCount;
      if (isIdle && now - record.lastUsedAt >= this.#idleMs) {
        this.#pools.delete(key);
        void record.pool.end().catch(() => undefined);
      }
    }
  }

  #evictOldestIdle(): void {
    let oldestKey: string | undefined;
    let oldestRecord: PoolRecord | undefined;

    for (const [key, record] of this.#pools) {
      if (record.pool.idleCount !== record.pool.totalCount) {
        continue;
      }
      if (!oldestRecord || record.lastUsedAt < oldestRecord.lastUsedAt) {
        oldestKey = key;
        oldestRecord = record;
      }
    }

    if (oldestKey && oldestRecord) {
      this.#pools.delete(oldestKey);
      void oldestRecord.pool.end().catch(() => undefined);
    }
  }
}

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { logger } from '../http/log';

export type PlatformDbOptions = {
  connectionString: string;
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis?: number;
};

export class PlatformDb {
  readonly #pool: Pool;

  constructor(options: PlatformDbOptions) {
    this.#pool = new Pool({
      connectionString: options.connectionString,
      max: options.max,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
      idleTimeoutMillis: options.idleTimeoutMillis ?? 30000,
      application_name: 'lilac-platform-api',
    });

    this.#pool.on('error', (error) => {
      logger.error('platform.pool.error', { error });
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.#pool.query<T>(text, values as unknown[]);
  }

  async transaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();

    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<void> {
    await this.#pool.query('SELECT 1');
  }

  get totalCount(): number {
    return this.#pool.totalCount;
  }

  get idleCount(): number {
    return this.#pool.idleCount;
  }

  get waitingCount(): number {
    return this.#pool.waitingCount;
  }

  async end(): Promise<void> {
    await this.#pool.end();
  }
}

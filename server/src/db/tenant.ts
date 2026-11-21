import type { Pool, PoolClient } from 'pg';
import { AppError } from '../http/errors';

export type TenantContext = {
  clientId: string;
  moduleKey: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODULE_PATTERN = /^(hr|retail|school|accounts)$/;

function assertTenantContext(context: TenantContext): void {
  if (!UUID_PATTERN.test(context.clientId) || !MODULE_PATTERN.test(context.moduleKey)) {
    throw new AppError('INTERNAL', 'Invalid tenant context');
  }
}

export async function withTenantTx<T>(
  pool: Pool,
  context: TenantContext,
  handler: (client: PoolClient) => Promise<T>,
): Promise<T> {
  assertTenantContext(context);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.client_id', $1, true),
              set_config('app.module_key', $2, true)`,
      [context.clientId, context.moduleKey],
    );
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

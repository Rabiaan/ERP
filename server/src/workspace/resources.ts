import type { PoolClient } from 'pg';
import type { Response } from 'express';
import { AppError } from '../http/errors';
import type { TenantRequestContext } from '../tenancy/context';
import { withTenantTx } from '../db/tenant';
import type { ResourceDescriptor } from '../modules/descriptors';

const RESERVED = new Set([
  'id', 'client_id', 'module_key', 'created_at', 'updated_at', 'deleted_at',
  'created_by', 'updated_by',
]);

const columnCache = new Map<string, Set<string>>();

export type ListQuery = {
  q: string;
  page: number;
  perPage: number;
  sort?: string;
  dir: 'asc' | 'desc';
  filters: Array<{ column: string; value: string }>;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function parseListQuery(query: Record<string, unknown>): ListQuery {
  const page = Number(query.page ?? 1);
  const perPage = Number(query.per_page ?? 25);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 500) {
    throw new AppError('VALIDATION_ERROR', 'Invalid pagination parameters.');
  }
  const dir = text(query.dir) === 'asc' ? 'asc' : 'desc';
  let filters: Array<{ column: string; value: string }> = [];
  if (query.filters !== undefined) {
    try {
      const parsed: unknown = typeof query.filters === 'string' ? JSON.parse(query.filters) : query.filters;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
      filters = Object.entries(parsed as Record<string, unknown>).map(([column, value]) => ({
        column,
        value: String(value),
      }));
    } catch {
      throw new AppError('VALIDATION_ERROR', 'filters must be a JSON object.');
    }
  }
  return { q: text(query.q).slice(0, 200), page, perPage, sort: text(query.sort) || undefined, dir, filters };
}

function ident(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function writableColumns(client: PoolClient, table: string): Promise<Set<string>> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  const columns = new Set(result.rows.map((row) => row.column_name));
  columnCache.set(table, columns);
  return columns;
}

function safeColumns(descriptor: ResourceDescriptor, requested: string[], allowed: readonly string[]): string[] {
  return [...new Set(requested.filter((column) => (allowed as readonly string[]).includes(column)))];
}

function buildWhere(descriptor: ResourceDescriptor, query: ListQuery): { sql: string; params: string[] } {
  const clauses = ['r.deleted_at IS NULL'];
  const params: string[] = [];

  for (const filter of query.filters) {
    if (!descriptor.filters.includes(filter.column)) {
      throw new AppError('VALIDATION_ERROR', `Unsupported filter: ${filter.column}`, { column: filter.column });
    }
    params.push(filter.value);
    clauses.push(`r.${ident(filter.column)}::text = $${params.length}`);
  }

  if (query.q) {
    const search = safeColumns(descriptor, descriptor.search, descriptor.search);
    if (search.length > 0) {
      params.push(`%${query.q}%`);
      const placeholder = `$${params.length}`;
      clauses.push(`(${search.map((column) => `r.${ident(column)}::text ILIKE ${placeholder}`).join(' OR ')})`);
    }
  }

  return { sql: clauses.join(' AND '), params };
}

export type ListResult = { rows: Record<string, unknown>[]; total: number };

export async function listResource(
  context: TenantRequestContext,
  descriptor: ResourceDescriptor,
  query: ListQuery,
): Promise<ListResult> {
  return withTenantTx(context.pool, context, async (client) => {
    const { sql, params } = buildWhere(descriptor, query);
    const from = descriptor.select ?? `SELECT * FROM ${ident(descriptor.table)}`;
    const count = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM (${from}) AS r WHERE ${sql}`,
      params,
    );

    const sort = query.sort && descriptor.sort.includes(query.sort) ? query.sort : 'created_at';
    const order = `r.${ident(sort)} ${query.dir === 'asc' ? 'ASC' : 'DESC'}, r.id DESC`;
    const dataParams = [...params, String(query.perPage), String((query.page - 1) * query.perPage)];
    const rows = await client.query<Record<string, unknown>>(
      `SELECT r.* FROM (${from}) AS r WHERE ${sql} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams,
    );
    return { rows: rows.rows, total: Number(count.rows[0]?.count ?? 0) };
  });
}

export async function getResource(
  context: TenantRequestContext,
  descriptor: ResourceDescriptor,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  return withTenantTx(context.pool, context, async (client) => {
    const from = descriptor.select ?? `SELECT * FROM ${ident(descriptor.table)}`;
    const result = await client.query<Record<string, unknown>>(
      `SELECT r.* FROM (${from}) AS r WHERE r.id = $1 AND r.deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return result.rows[0];
  });
}

function assertWritable(descriptor: ResourceDescriptor): void {
  if (descriptor.readOnly || descriptor.select) {
    throw new AppError('FORBIDDEN', 'This resource is read-only.');
  }
}

function validateBody(body: unknown, allowed: Set<string>): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError('VALIDATION_ERROR', 'A JSON object is required.');
  }
  const entries = Object.entries(body as Record<string, unknown>);
  for (const [key] of entries) {
    if (RESERVED.has(key) || !allowed.has(key)) {
      throw new AppError('VALIDATION_ERROR', `Unsupported field: ${key}`, { field: key });
    }
  }
  if (entries.length === 0) throw new AppError('VALIDATION_ERROR', 'No fields supplied.');
  return Object.fromEntries(entries);
}

export async function createResource(
  context: TenantRequestContext,
  descriptor: ResourceDescriptor,
  body: unknown,
): Promise<Record<string, unknown>> {
  assertWritable(descriptor);
  return withTenantTx(context.pool, context, async (client) => {
    const allowed = await writableColumns(client, descriptor.table);
    const values = validateBody(body, allowed);
    const keys = ['client_id', 'module_key', ...Object.keys(values), 'created_by', 'updated_by'];
    const params = [
      context.clientId,
      context.moduleKey,
      ...Object.values(values),
      context.actor.userId,
      context.actor.userId,
    ];
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    const result = await client.query<Record<string, unknown>>(
      `INSERT INTO ${ident(descriptor.table)} (${keys.map(ident).join(', ')})
       VALUES (${placeholders}) RETURNING *`,
      params,
    );
    return result.rows[0]!;
  });
}

export async function updateResource(
  context: TenantRequestContext,
  descriptor: ResourceDescriptor,
  id: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  assertWritable(descriptor);
  return withTenantTx(context.pool, context, async (client) => {
    const allowed = await writableColumns(client, descriptor.table);
    const values = validateBody(body, allowed);
    const keys = Object.keys(values);
    const sets = keys.map((key, index) => `${ident(key)} = $${index + 1}`);
    const params: unknown[] = [...Object.values(values), context.actor.userId, id];
    sets.push(`updated_by = $${params.length - 1}`, 'updated_at = now()');
    const result = await client.query<Record<string, unknown>>(
      `UPDATE ${ident(descriptor.table)} SET ${sets.join(', ')}
        WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
      params,
    );
    const row = result.rows[0];
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  });
}

export async function deleteResource(
  context: TenantRequestContext,
  descriptor: ResourceDescriptor,
  id: string,
): Promise<void> {
  assertWritable(descriptor);
  await withTenantTx(context.pool, context, async (client) => {
    const result = await client.query(
      `UPDATE ${ident(descriptor.table)}
          SET deleted_at = now(), updated_at = now(), updated_by = $1
        WHERE id = $2 AND deleted_at IS NULL`,
      [context.actor.userId, id],
    );
    if ((result.rowCount ?? 0) === 0) throw new AppError('NOT_FOUND');
  });
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function sendCsv(res: Response, rows: Record<string, unknown>[], fileName: string): void {
  const columns = rows.length > 0
    ? Object.keys(rows[0]!)
    : ['id', 'created_at'];
  const lines = [columns.map((column) => `"${column}"`).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvValue(row[column])).join(','));
  }
  res
    .status(200)
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="${fileName.replace(/[^a-z0-9_-]/gi, '_')}.csv"`)
    .set('Cache-Control', 'no-store')
    .send(lines.join('\n'));
}

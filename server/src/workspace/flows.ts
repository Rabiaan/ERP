import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AppError } from '../http/errors';
import { withTenantTx } from '../db/tenant';
import type { TenantRequestContext } from '../tenancy/context';

type Row = Record<string, unknown>;

function num(value: unknown): number {
  return Number(value ?? 0);
}

function generateNumber(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

async function lockRow(client: PoolClient, table: string, id: string): Promise<Row> {
  const result = await client.query<Row>(
    `SELECT * FROM ${table} WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new AppError('NOT_FOUND');
  return row;
}

async function resolveWarehouse(client: PoolClient, preferred: unknown): Promise<string> {
  if (typeof preferred === 'string' && preferred.length > 0) return preferred;
  const result = await client.query<{ id: string }>(
    `SELECT id FROM warehouses WHERE is_default = true AND deleted_at IS NULL LIMIT 1`,
  );
  const id = result.rows[0]?.id;
  if (!id) throw new AppError('VALIDATION_ERROR', 'No warehouse is configured for stock movements.');
  return id;
}

async function adjustStock(
  client: PoolClient,
  context: TenantRequestContext,
  productId: string,
  warehouseId: string,
  quantity: number,
  type: 'in' | 'out',
  referenceType: string,
  referenceId: string,
): Promise<void> {
  if (quantity <= 0 || !productId) return;

  if (type === 'out') {
    const current = await client.query<{ quantity: string }>(
      `SELECT quantity FROM product_stock
        WHERE product_id = $1 AND warehouse_id = $2 AND deleted_at IS NULL`,
      [productId, warehouseId],
    );
    if (num(current.rows[0]?.quantity) < quantity) {
      throw new AppError('CONFLICT', 'Insufficient stock to complete this operation.', {
        productId,
        available: num(current.rows[0]?.quantity),
        required: quantity,
      });
    }
    await client.query(
      `UPDATE product_stock SET quantity = quantity - $1, updated_at = now(), updated_by = $2
        WHERE product_id = $3 AND warehouse_id = $4 AND deleted_at IS NULL`,
      [quantity, context.actor.userId, productId, warehouseId],
    );
  } else {
    const upsert = await client.query(
      `INSERT INTO product_stock (
         client_id, module_key, product_id, warehouse_id, quantity, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (client_id, product_id, warehouse_id)
       DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                     updated_at = now(), updated_by = EXCLUDED.updated_by
       RETURNING id`,
      [context.clientId, context.moduleKey, productId, warehouseId, quantity, context.actor.userId],
    );
    if (!upsert.rows[0]) throw new AppError('INTERNAL', 'Stock update failed.');
  }

  await client.query(
    `INSERT INTO stock_movements (
       client_id, module_key, product_id, warehouse_id, type, quantity,
       reference_type, reference_id, note, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
    [
      context.clientId,
      context.moduleKey,
      productId,
      warehouseId,
      type,
      quantity,
      referenceType,
      referenceId,
      `${referenceType} ${referenceId}`,
      context.actor.userId,
    ],
  );
}

async function recalculateInvoice(client: PoolClient, invoiceId: string, actorId: string): Promise<Row> {
  const totals = await client.query<{ subtotal: string; discount: string; tax: string; total: string }>(
    `SELECT
       coalesce(sum(rate * quantity - discount), 0)::text AS subtotal,
       coalesce(sum(discount), 0)::text AS discount,
       coalesce(sum(tax), 0)::text AS tax,
       coalesce(sum(rate * quantity - discount + tax), 0)::text AS total
     FROM invoice_lines WHERE invoice_id = $1 AND deleted_at IS NULL`,
    [invoiceId],
  );
  const result = await client.query<Row>(
    `UPDATE invoices
        SET subtotal = $2, discount = $3, tax = $4, total = $5,
            balance = greatest($5 - paid, 0), updated_at = now(), updated_by = $6
      WHERE id = $1 RETURNING *`,
    [
      invoiceId,
      totals.rows[0]!.subtotal,
      totals.rows[0]!.discount,
      totals.rows[0]!.tax,
      totals.rows[0]!.total,
      actorId,
    ],
  );
  return result.rows[0]!;
}

export async function finalizeInvoice(
  context: TenantRequestContext,
  invoiceId: string,
): Promise<Row> {
  return withTenantTx(context.pool, context, async (client) => {
    const invoice = await lockRow(client, 'invoices', invoiceId);
    if (invoice.status !== 'draft') throw new AppError('CONFLICT', 'Only draft invoices can be finalized.');

    const lines = await client.query<Row>(
      `SELECT * FROM invoice_lines WHERE invoice_id = $1 AND deleted_at IS NULL`,
      [invoiceId],
    );
    if (lines.rows.length === 0) throw new AppError('VALIDATION_ERROR', 'Invoice has no lines.');

    const warehouseId = await resolveWarehouse(client, invoice.warehouse_id);
    for (const line of lines.rows) {
      if (typeof line.product_id === 'string') {
        await adjustStock(
          client,
          context,
          line.product_id,
          warehouseId,
          num(line.quantity),
          'out',
          'invoice',
          invoiceId,
        );
      }
    }

    const updated = await recalculateInvoice(client, invoiceId, context.actor.userId);
    const result = await client.query<Row>(
      `UPDATE invoices SET status = 'finalized', updated_by = $2
        WHERE id = $1 RETURNING *`,
      [invoiceId, context.actor.userId],
    );

    if (typeof invoice.customer_id === 'string') {
      await client.query(
        `UPDATE customers SET balance = balance + $2, updated_at = now(), updated_by = $3
          WHERE id = $1`,
        [invoice.customer_id, num(updated.balance), context.actor.userId],
      );
    }

    return result.rows[0]!;
  });
}

export async function duplicateInvoice(
  context: TenantRequestContext,
  invoiceId: string,
  input: { number?: string; date?: string },
): Promise<Row> {
  return withTenantTx(context.pool, context, async (client) => {
    const source = await lockRow(client, 'invoices', invoiceId);
    const lines = await client.query<Row>(
      `SELECT * FROM invoice_lines WHERE invoice_id = $1 AND deleted_at IS NULL ORDER BY created_at, id`,
      [invoiceId],
    );
    if (lines.rows.length === 0) throw new AppError('VALIDATION_ERROR', 'Invoice has no lines.');

    const number = input.number?.trim() || generateNumber('INV');
    const created = await client.query<Row>(
      `INSERT INTO invoices (
         client_id, module_key, number, customer_id, branch_id, warehouse_id, salesman_id, date,
         created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, coalesce($8::date, current_date), $9, $9)
       RETURNING *`,
      [
        context.clientId,
        context.moduleKey,
        number,
        source.customer_id ?? null,
        source.branch_id ?? null,
        source.warehouse_id ?? null,
        source.salesman_id ?? null,
        input.date ?? null,
        context.actor.userId,
      ],
    );
    const copy = created.rows[0]!;

    for (const line of lines.rows) {
      let rate = num(line.rate);
      let description = String(line.description ?? '');
      if (typeof line.product_id === 'string') {
        const product = await client.query<{ sale_price: string; name: string }>(
          `SELECT sale_price, name FROM products WHERE id = $1 AND deleted_at IS NULL`,
          [line.product_id],
        );
        if (product.rows[0]) {
          rate = num(product.rows[0].sale_price);
          description = product.rows[0].name;
        }
      }
      await client.query(
        `INSERT INTO invoice_lines (
           client_id, module_key, invoice_id, product_id, description, quantity,
           rate, discount, tax, line_total, created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                    round($6::numeric * $7::numeric - $8::numeric + $9::numeric, 2), $10, $10)`,
        [
          context.clientId,
          context.moduleKey,
          copy.id,
          line.product_id ?? null,
          description,
          line.quantity,
          rate,
          line.discount ?? 0,
          line.tax ?? 0,
          context.actor.userId,
        ],
      );
    }

    return recalculateInvoice(client, String(copy.id), context.actor.userId);
  });
}

export async function approveRefund(context: TenantRequestContext, refundId: string): Promise<Row> {
  return withTenantTx(context.pool, context, async (client) => {
    const refund = await lockRow(client, 'refunds', refundId);
    if (refund.status !== 'pending') throw new AppError('CONFLICT', 'Only pending refunds can be approved.');
    if (num(refund.total) <= 0) throw new AppError('VALIDATION_ERROR', 'Refund total must be positive.');

    const invoice = await lockRow(client, 'invoices', String(refund.invoice_id));
    if (invoice.status !== 'finalized' && invoice.status !== 'paid') {
      throw new AppError('CONFLICT', 'Refund requires a finalized invoice.');
    }

    const prior = await client.query<{ total: string }>(
      `SELECT coalesce(sum(total), 0)::text AS total FROM refunds
        WHERE invoice_id = $1 AND status = 'approved' AND deleted_at IS NULL AND id <> $2`,
      [refund.invoice_id, refundId],
    );
    if (num(prior.rows[0]?.total) + num(refund.total) > num(invoice.total)) {
      throw new AppError('VALIDATION_ERROR', 'Refund total exceeds the invoice total.');
    }

    const warehouseId = await resolveWarehouse(client, invoice.warehouse_id);
    const lines = await client.query<Row>(
      `SELECT product_id, quantity FROM invoice_lines
        WHERE invoice_id = $1 AND deleted_at IS NULL`,
      [invoice.id],
    );
    for (const line of lines.rows) {
      if (typeof line.product_id === 'string') {
        await adjustStock(
          client,
          context,
          line.product_id,
          warehouseId,
          num(line.quantity),
          'in',
          'refund',
          refundId,
        );
      }
    }

    const customerId = refund.customer_id ?? invoice.customer_id;
    if (typeof customerId === 'string') {
      await client.query(
        `UPDATE customers SET balance = greatest(balance - $2, 0), updated_at = now(), updated_by = $3
          WHERE id = $1`,
        [customerId, refund.total, context.actor.userId],
      );
    }

    const result = await client.query<Row>(
      `UPDATE refunds SET status = 'approved', approved_by = $2, updated_by = $2
        WHERE id = $1 RETURNING *`,
      [refundId, context.actor.userId],
    );
    return result.rows[0]!;
  });
}

export async function rejectRefund(
  context: TenantRequestContext,
  refundId: string,
  reason?: string,
): Promise<Row> {
  return withTenantTx(context.pool, context, async (client) => {
    const refund = await lockRow(client, 'refunds', refundId);
    if (refund.status !== 'pending') throw new AppError('CONFLICT', 'Only pending refunds can be rejected.');
    const result = await client.query<Row>(
      `UPDATE refunds SET status = 'rejected', reason = coalesce($2, reason), updated_by = $3
        WHERE id = $1 RETURNING *`,
      [refundId, reason ?? null, context.actor.userId],
    );
    return result.rows[0]!;
  });
}

export async function approvePurchaseReturn(
  context: TenantRequestContext,
  returnId: string,
): Promise<Row> {
  return withTenantTx(context.pool, context, async (client) => {
    const record = await lockRow(client, 'purchase_returns', returnId);
    if (record.status !== 'pending') throw new AppError('CONFLICT', 'Only pending returns can be approved.');
    const purchase = await lockRow(client, 'purchases', String(record.purchase_id));
    if (purchase.status !== 'received' && purchase.status !== 'paid') {
      throw new AppError('CONFLICT', 'Return requires a received purchase.');
    }

    const warehouseId = await resolveWarehouse(client, purchase.warehouse_id);
    const lines = await client.query<Row>(
      `SELECT product_id, quantity FROM purchase_lines WHERE purchase_id = $1 AND deleted_at IS NULL`,
      [record.purchase_id],
    );
    for (const line of lines.rows) {
      if (typeof line.product_id === 'string') {
        await adjustStock(
          client,
          context,
          line.product_id,
          warehouseId,
          num(line.quantity),
          'in',
          'purchase_return',
          returnId,
        );
      }
    }

    if (typeof record.vendor_id === 'string') {
      await client.query(
        `UPDATE vendors SET balance = greatest(balance - $2, 0), updated_at = now(), updated_by = $3
          WHERE id = $1`,
        [record.vendor_id, record.total, context.actor.userId],
      );
    }

    const result = await client.query<Row>(
      `UPDATE purchase_returns SET status = 'approved', updated_by = $2
        WHERE id = $1 RETURNING *`,
      [returnId, context.actor.userId],
    );
    return result.rows[0]!;
  });
}

export async function approveExpense(context: TenantRequestContext, expenseId: string): Promise<Row> {
  return withTenantTx(context.pool, context, async (client) => {
    const expense = await lockRow(client, 'expenses', expenseId);
    if (expense.status !== 'pending') throw new AppError('CONFLICT', 'Only pending expenses can be approved.');
    if (typeof expense.bank_id === 'string') {
      await client.query(
        `UPDATE banks SET current_balance = current_balance - $2, updated_at = now(), updated_by = $3
          WHERE id = $1`,
        [expense.bank_id, expense.amount, context.actor.userId],
      );
    }
    const result = await client.query<Row>(
      `UPDATE expenses SET status = 'approved', approved_by = $2, updated_by = $2
        WHERE id = $1 RETURNING *`,
      [expenseId, context.actor.userId],
    );
    return result.rows[0]!;
  });
}

export async function receivePurchase(context: TenantRequestContext, purchaseId: string): Promise<Row> {
  return withTenantTx(context.pool, context, async (client) => {
    const purchase = await lockRow(client, 'purchases', purchaseId);
    if (purchase.status !== 'draft') throw new AppError('CONFLICT', 'Only draft purchases can be received.');

    const lines = await client.query<Row>(
      `SELECT product_id, quantity FROM purchase_lines WHERE purchase_id = $1 AND deleted_at IS NULL`,
      [purchaseId],
    );
    if (lines.rows.length === 0) throw new AppError('VALIDATION_ERROR', 'Purchase has no lines.');
    const warehouseId = await resolveWarehouse(client, purchase.warehouse_id);

    for (const line of lines.rows) {
      if (typeof line.product_id === 'string') {
        await adjustStock(
          client,
          context,
          line.product_id,
          warehouseId,
          num(line.quantity),
          'in',
          'purchase',
          purchaseId,
        );
      }
    }

    if (typeof purchase.vendor_id === 'string') {
      await client.query(
        `UPDATE vendors SET balance = balance + $2, updated_at = now(), updated_by = $3
          WHERE id = $1`,
        [purchase.vendor_id, num(purchase.balance), context.actor.userId],
      );
    }

    const result = await client.query<Row>(
      `UPDATE purchases SET status = 'received', updated_by = $2 WHERE id = $1 RETURNING *`,
      [purchaseId, context.actor.userId],
    );
    return result.rows[0]!;
  });
}

export async function decideLeaveRequest(
  context: TenantRequestContext,
  requestId: string,
  decision: 'approve' | 'reject',
  comment?: string,
): Promise<Row> {
  return withTenantTx(context.pool, context, async (client) => {
    const request = await lockRow(client, 'leave_requests', requestId);
    if (request.status !== 'pending') throw new AppError('CONFLICT', 'Only pending leave requests can be decided.');

    if (decision === 'approve') {
      const year = Number(String(request.start_date).slice(0, 4));
      const balance = await client.query<Row>(
        `SELECT * FROM leave_balances
          WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3 AND deleted_at IS NULL FOR UPDATE`,
        [request.employee_id, request.leave_type_id, year],
      );
      const current = balance.rows[0];
      if (!current) throw new AppError('CONFLICT', 'No leave balance exists for this request.');
      if (num(current.entitled) - num(current.used) < num(request.days)) {
        throw new AppError('VALIDATION_ERROR', 'Insufficient leave balance.');
      }
      await client.query(
        `UPDATE leave_balances
            SET used = used + $2, pending = greatest(pending - $2, 0), updated_at = now(), updated_by = $3
          WHERE id = $1`,
        [current.id, request.days, context.actor.userId],
      );
    }

    const result = await client.query<Row>(
      `UPDATE leave_requests
          SET status = $2, approver_id = $3, decided_at = now(), comment = coalesce($4, comment), updated_by = $3
        WHERE id = $1 RETURNING *`,
      [requestId, decision === 'approve' ? 'approved' : 'rejected', context.actor.userId, comment ?? null],
    );
    return result.rows[0]!;
  });
}

export async function approvePayRun(context: TenantRequestContext, payRunId: string): Promise<Row> {
  return withTenantTx(context.pool, context, async (client) => {
    const run = await lockRow(client, 'pay_runs', payRunId);
    if (run.status !== 'draft' && run.status !== 'processing') {
      throw new AppError('CONFLICT', 'Only draft or processing pay runs can be approved.');
    }
    const result = await client.query<Row>(
      `UPDATE pay_runs SET status = 'approved', approved_by = $2, updated_by = $2
        WHERE id = $1 RETURNING *`,
      [payRunId, context.actor.userId],
    );
    await client.query(
      `UPDATE payslips SET status = 'approved', updated_at = now(), updated_by = $2
        WHERE pay_run_id = $1 AND status = 'pending'`,
      [payRunId, context.actor.userId],
    );
    return result.rows[0]!;
  });
}

export async function postJournal(context: TenantRequestContext, journalId: string): Promise<Row> {
  return withTenantTx(context.pool, context, async (client) => {
    const journal = await lockRow(client, 'journal_entries', journalId);
    if (journal.status !== 'draft') throw new AppError('CONFLICT', 'Only draft journals can be posted.');

    if (typeof journal.period_id === 'string') {
      const period = await client.query<{ status: string }>(
        `SELECT status FROM fiscal_periods WHERE id = $1 AND deleted_at IS NULL`,
        [journal.period_id],
      );
      if (period.rows[0]?.status !== 'open') {
        throw new AppError('CONFLICT', 'The fiscal period is not open.');
      }
    }

    const totals = await client.query<{ debit: string; credit: string; count: number }>(
      `SELECT coalesce(sum(debit), 0)::text AS debit, coalesce(sum(credit), 0)::text AS credit,
              count(*)::int AS count
         FROM journal_lines WHERE journal_entry_id = $1 AND deleted_at IS NULL`,
      [journalId],
    );
    const summary = totals.rows[0]!;
    if (Number(summary.count) === 0) throw new AppError('VALIDATION_ERROR', 'Journal has no lines.');
    if (num(summary.debit) !== num(summary.credit) || num(summary.debit) === 0) {
      throw new AppError('VALIDATION_ERROR', 'Journal debits and credits must balance.', {
        debit: summary.debit,
        credit: summary.credit,
      });
    }

    const result = await client.query<Row>(
      `UPDATE journal_entries
          SET status = 'posted', posted_at = now(), posted_by = $2, updated_by = $2
        WHERE id = $1 RETURNING *`,
      [journalId, context.actor.userId],
    );
    return result.rows[0]!;
  });
}

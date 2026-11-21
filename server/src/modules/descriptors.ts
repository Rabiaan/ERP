import type { ModuleKey } from '../authz/catalog';

export type ResourceAction = 'view' | 'create' | 'update' | 'delete' | 'export' | 'approve' | 'manage' | 'print' | 'post' | 'run';

export type ResourceDescriptor = {
  table: string;
  permission: string;
  actions: Partial<Record<ResourceAction, true>>;
  search: string[];
  sort: string[];
  filters: string[];
  select?: string;
  readOnly?: boolean;
};

type Options = {
  permission?: string;
  actions?: Partial<Record<ResourceAction, true>>;
  search?: string[];
  sort?: string[];
  filters?: string[];
  select?: string;
  readOnly?: boolean;
};

const BASE_SORT = ['id', 'created_at', 'updated_at'];

function descriptor(table: string, options: Options = {}): ResourceDescriptor {
  const readOnly = options.readOnly ?? false;
  return {
    table,
    permission: options.permission ?? table,
    actions: readOnly
      ? { view: true, export: true }
      : (options.actions ?? { view: true, create: true, update: true, delete: true, export: true }),
    search: options.search ?? ['name', 'code', 'number'],
    sort: [...BASE_SORT, ...(options.sort ?? [])],
    filters: options.filters ?? ['status'],
    ...(options.select ? { select: options.select } : {}),
    ...(readOnly ? { readOnly: true } : {}),
  };
}

const RETAIL: Record<string, ResourceDescriptor> = {
  categories: descriptor('categories', { permission: 'products', search: ['name'] }),
  products: descriptor('products', { search: ['name', 'sku'], filters: ['is_active', 'category_id'] }),
  customers: descriptor('customers', { search: ['name', 'code', 'phone', 'email'], filters: ['is_active'] }),
  vendors: descriptor('vendors', { search: ['name', 'code', 'phone', 'email'], filters: ['is_active'] }),
  stock: descriptor('product_stock', {
    permission: 'stock',
    actions: { view: true, update: true, export: true },
    filters: ['warehouse_id', 'branch_id'],
  }),
  'stock-movements': descriptor('stock_movements', {
    permission: 'stock',
    readOnly: true,
    search: ['reference_type', 'note'],
    filters: ['type', 'product_id', 'warehouse_id'],
  }),
  expenses: descriptor('expenses', {
    actions: { view: true, create: true, update: true, delete: true, approve: true, export: true },
    search: ['category', 'reference'],
  }),
  invoices: descriptor('invoices', {
    actions: { view: true, create: true, update: true, delete: true, approve: true, print: true, export: true },
    search: ['number'],
  }),
  sales: descriptor('sales', {
    readOnly: true,
    search: ['number', 'customer_name'],
    filters: ['status'],
    select: `SELECT i.id, i.client_id, i.module_key, i.number, i.date, i.customer_id,
                    c.name AS customer_name, i.subtotal, i.discount, i.tax, i.total,
                    i.paid, i.balance, i.status, i.created_at, i.updated_at, i.deleted_at
             FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id`,
  }),
  refunds: descriptor('refunds', {
    actions: { view: true, create: true, approve: true, print: true, export: true },
    search: ['number', 'reason'],
  }),
  banks: descriptor('banks', {
    actions: { view: true, create: true, update: true, delete: true, manage: true, export: true },
    search: ['name', 'account_number'],
  }),
  'bank-transactions': descriptor('bank_transactions', {
    permission: 'banks',
    readOnly: true,
    search: ['reference', 'note'],
    filters: ['type', 'bank_id'],
  }),
  'purchase-orders': descriptor('purchase_orders', {
    permission: 'purchases',
    actions: { view: true, create: true, update: true, approve: true, export: true },
    search: ['number'],
  }),
  purchases: descriptor('purchases', {
    actions: { view: true, create: true, update: true, approve: true, export: true },
    search: ['number'],
  }),
  'purchase-returns': descriptor('purchase_returns', {
    actions: { view: true, create: true, approve: true, export: true },
    search: ['number', 'reason'],
  }),
  salesmen: descriptor('salesmen', { search: ['name', 'phone', 'territory'] }),
};

const HR: Record<string, ResourceDescriptor> = {
  employees: descriptor('employees', { search: ['first_name', 'last_name', 'email', 'employee_no'], filters: ['status', 'department_id'] }),
  departments: descriptor('departments', { search: ['name', 'code'] }),
  locations: descriptor('locations', { permission: 'employees', search: ['name', 'address'] }),
  attendance: descriptor('attendance', { actions: { view: true, create: true, update: true, approve: true, export: true }, search: ['source', 'notes'], filters: ['status', 'employee_id'] }),
  'leave-types': descriptor('leave_types', { permission: 'leave', search: ['name', 'code'] }),
  'leave-requests': descriptor('leave_requests', {
    permission: 'leave',
    actions: { view: true, create: true, update: true, approve: true, export: true },
    filters: ['status', 'employee_id', 'leave_type_id'],
  }),
  'pay-runs': descriptor('pay_runs', { permission: 'payroll', actions: { view: true, run: true, approve: true, export: true }, search: ['period_label'] }),
  payslips: descriptor('payslips', { actions: { view: true, print: true, export: true }, filters: ['status', 'pay_run_id'] }),
  'salary-structures': descriptor('salary_structures', { search: ['currency'], filters: ['employee_id'] }),
  'job-openings': descriptor('job_openings', { search: ['title', 'experience_level'], filters: ['status', 'department_id'] }),
  candidates: descriptor('candidates', { search: ['name', 'email', 'phone'], filters: ['stage', 'job_id'] }),
  interviews: descriptor('interviews', { actions: { view: true, create: true, update: true }, search: ['mode'], filters: ['status', 'candidate_id'] }),
  goals: descriptor('goals', { search: ['title', 'category'], filters: ['status', 'employee_id'] }),
  reviews: descriptor('reviews', { actions: { view: true, create: true, update: true, approve: true }, filters: ['status', 'cycle_id'] }),
  documents: descriptor('documents', { search: ['name', 'type'], filters: ['status', 'employee_id'] }),
};

const SCHOOL: Record<string, ResourceDescriptor> = {
  students: descriptor('students', { search: ['first_name', 'last_name', 'admission_no'], filters: ['status', 'class_id'] }),
  guardians: descriptor('guardians', { search: ['name', 'phone', 'email'] }),
  classes: descriptor('classes', { search: ['name', 'code'] }),
  sections: descriptor('sections', { permission: 'classes', search: ['name'], filters: ['class_id'] }),
  subjects: descriptor('subjects', { search: ['name', 'code'], filters: ['class_id'] }),
  attendance: descriptor('attendance', { actions: { view: true, create: true, update: true, export: true }, filters: ['status', 'student_id', 'date'] }),
  exams: descriptor('exams', { actions: { view: true, create: true, update: true, delete: true, approve: true }, search: ['name', 'term'], filters: ['status'] }),
  grades: descriptor('grades', { actions: { view: true, create: true, update: true, export: true } }),
  'fee-heads': descriptor('fee_heads', { permission: 'fees', search: ['name', 'code'] }),
  'fee-invoices': descriptor('fee_invoices', { permission: 'fees', search: ['number'], filters: ['status', 'student_id'] }),
  'fee-payments': descriptor('fee_payments', { permission: 'fees', actions: { view: true, create: true, approve: true, export: true, print: true }, filters: ['status', 'invoice_id'] }),
  staff: descriptor('staff', { search: ['name', 'employee_no', 'email'] }),
  timetable: descriptor('timetable', { filters: ['class_id', 'day_of_week'] }),
  'transport-routes': descriptor('transport_routes', { permission: 'transport', search: ['name', 'vehicle_no'] }),
  admissions: descriptor('admissions', {
    readOnly: true,
    search: ['first_name', 'last_name', 'admission_no'],
    filters: ['status'],
    select: 'SELECT * FROM students WHERE status = \'applicant\'',
  }),
};

const ACCOUNTS: Record<string, ResourceDescriptor> = {
  'chart-of-accounts': descriptor('chart_of_accounts', { search: ['name', 'code'], filters: ['type', 'is_group', 'is_active'] }),
  journals: descriptor('journal_entries', { permission: 'journals', actions: { view: true, create: true, update: true, delete: true, post: true, print: true, export: true }, search: ['number', 'memo'], filters: ['status', 'period_id'] }),
  'journal-lines': descriptor('journal_lines', { permission: 'journals', readOnly: true, filters: ['journal_entry_id', 'account_id'] }),
  'bank-accounts': descriptor('bank_accounts', { permission: 'banks', actions: { view: true, create: true, update: true, manage: true, export: true }, search: ['name', 'account_number', 'bank_name'] }),
  reconciliations: descriptor('bank_reconciliations', { permission: 'banks', actions: { view: true, create: true, update: true, manage: true }, filters: ['status'] }),
  'ar-open-items': descriptor('ar_open_items', { permission: 'receivables', readOnly: true, search: ['customer_ref', 'invoice_ref'], filters: ['bucket'] }),
  'ap-open-items': descriptor('ap_open_items', { permission: 'payables', readOnly: true, search: ['vendor_ref', 'bill_ref'], filters: ['bucket'] }),
  'fiscal-periods': descriptor('fiscal_periods', { actions: { view: true, manage: true }, search: ['name'], filters: ['status'] }),
  ledgers: descriptor('ledgers', {
    readOnly: true,
    search: ['journal_number', 'account_code', 'account_name', 'description'],
    filters: ['account_id', 'journal_entry_id'],
    select: `SELECT l.id, l.client_id, l.module_key, l.journal_entry_id, j.number AS journal_number,
                    j.date, l.account_id, a.code AS account_code, a.name AS account_name,
                    l.debit, l.credit, l.description, l.created_at, l.updated_at, l.deleted_at
             FROM journal_lines l
             JOIN journal_entries j ON j.id = l.journal_entry_id
             LEFT JOIN chart_of_accounts a ON a.id = l.account_id`,
  }),
};

const DESCRIPTORS: Record<ModuleKey, Record<string, ResourceDescriptor>> = {
  retail: RETAIL,
  hr: HR,
  school: SCHOOL,
  accounts: ACCOUNTS,
};

export function getDescriptor(moduleKey: ModuleKey, resource: string): ResourceDescriptor | undefined {
  return DESCRIPTORS[moduleKey]?.[resource];
}

export function resourceNames(moduleKey: ModuleKey): string[] {
  return Object.keys(DESCRIPTORS[moduleKey]);
}

export function actionFor(descriptor: ResourceDescriptor, action: ResourceAction): ResourceAction {
  if (descriptor.actions[action]) return action;
  for (const fallback of ['manage', 'run', 'approve', 'update', 'create', 'post', 'view'] as ResourceAction[]) {
    if (descriptor.actions[fallback]) return fallback;
  }
  return 'view';
}

import { AppError } from '../http/errors';

export const MODULE_KEYS = ['hr', 'retail', 'school', 'accounts'] as const;
export const PERMISSION_NAMESPACES = [
  'platform',
  'administration',
  ...MODULE_KEYS,
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
export type PermissionNamespace = (typeof PERMISSION_NAMESPACES)[number];

const PERMISSIONS_BY_RESOURCE = {
  platform: {
    clients: ['view', 'manage'],
    modules: ['manage', 'access', 'support'],
    users: ['manage'],
    plans: ['manage'],
    provisioning: ['manage'],
    audit: ['view'],
    usage: ['view'],
    health: ['view'],
    impersonate: ['manage'],
  },
  administration: {
    users: ['manage'],
    roles: ['manage'],
    company: ['manage'],
    branches: ['manage'],
    tax: ['manage'],
    settings: ['manage'],
    audit: ['view'],
  },
  retail: {
    dashboard: ['view'],
    products: ['view', 'create', 'update', 'delete', 'export'],
    customers: ['view', 'create', 'update', 'delete', 'export'],
    vendors: ['view', 'create', 'update', 'delete', 'export'],
    stock: ['view', 'update', 'export'],
    expenses: ['view', 'create', 'update', 'delete', 'approve', 'export'],
    invoices: ['view', 'create', 'update', 'delete', 'approve', 'print', 'export'],
    sales: ['view', 'export'],
    refunds: ['view', 'create', 'approve', 'print', 'export'],
    banks: ['view', 'create', 'update', 'delete', 'manage', 'export'],
    purchases: ['view', 'create', 'update', 'approve', 'export'],
    purchase_returns: ['view', 'create', 'approve', 'export'],
    salesmen: ['view', 'create', 'update', 'delete', 'export'],
    reports: ['view', 'export'],
  },
  hr: {
    dashboard: ['view'],
    employees: ['view', 'create', 'update', 'delete', 'export'],
    departments: ['view', 'create', 'update', 'delete'],
    org_chart: ['view'],
    onboarding: ['view', 'create', 'update'],
    attendance: ['view', 'create', 'update', 'approve', 'export'],
    timesheets: ['view', 'create', 'update', 'approve', 'export'],
    shifts: ['view', 'create', 'update', 'delete'],
    leave: ['view', 'create', 'update', 'approve', 'export'],
    payroll: ['view', 'run', 'approve', 'export'],
    payslips: ['view', 'print', 'export'],
    salary_structures: ['view', 'create', 'update', 'delete', 'export'],
    job_openings: ['view', 'create', 'update', 'delete'],
    candidates: ['view', 'create', 'update', 'delete'],
    interviews: ['view', 'create', 'update'],
    goals: ['view', 'create', 'update', 'delete'],
    reviews: ['view', 'create', 'update', 'approve'],
    documents: ['view', 'create', 'update', 'delete', 'export'],
    assets: ['view', 'create', 'update', 'delete'],
    announcements: ['view', 'create', 'update', 'delete'],
    reports: ['view', 'export'],
  },
  school: {
    dashboard: ['view'],
    students: ['view', 'create', 'update', 'delete', 'export'],
    guardians: ['view', 'create', 'update', 'delete'],
    classes: ['view', 'create', 'update', 'delete'],
    subjects: ['view', 'create', 'update', 'delete'],
    attendance: ['view', 'create', 'update', 'export'],
    exams: ['view', 'create', 'update', 'delete', 'approve'],
    grades: ['view', 'create', 'update', 'export'],
    fees: ['view', 'create', 'update', 'delete', 'collect', 'approve', 'export', 'print'],
    staff: ['view', 'create', 'update', 'delete'],
    timetable: ['view', 'create', 'update', 'delete'],
    transport: ['view', 'create', 'update', 'delete'],
    admissions: ['view', 'create', 'update', 'approve'],
    reports: ['view', 'export'],
  },
  accounts: {
    dashboard: ['view'],
    chart_of_accounts: ['view', 'create', 'update', 'delete', 'manage'],
    journals: ['view', 'create', 'update', 'delete', 'post', 'export', 'print'],
    ledgers: ['view', 'export'],
    receivables: ['view', 'export'],
    payables: ['view', 'export'],
    banks: ['view', 'create', 'update', 'manage', 'export'],
    tax: ['view', 'manage', 'export'],
    fiscal_periods: ['view', 'manage'],
    reports: ['view', 'export'],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>;

type PermissionMap = typeof PERMISSIONS_BY_RESOURCE;
type ActionFor<
  Namespace extends keyof PermissionMap,
  Resource extends keyof PermissionMap[Namespace],
> = PermissionMap[Namespace][Resource] extends readonly (infer Action extends string)[]
  ? Action
  : never;

export type PermissionKey = {
  [Namespace in keyof PermissionMap]: {
    [Resource in keyof PermissionMap[Namespace]]: `${Namespace & string}.${Resource & string}.${ActionFor<Namespace, Resource>}`;
  }[keyof PermissionMap[Namespace]];
}[keyof PermissionMap];

function buildCatalog(): PermissionKey[] {
  const permissions: PermissionKey[] = [];
  for (const [namespace, resources] of Object.entries(PERMISSIONS_BY_RESOURCE)) {
    for (const [resource, actions] of Object.entries(resources) as Array<
      [string, readonly string[]]
    >) {
      for (const action of actions) {
        permissions.push(`${namespace}.${resource}.${action}` as PermissionKey);
      }
    }
  }
  return permissions;
}

export const PERMISSION_CATALOG = buildCatalog();

export const ROLE_PRESETS = ['viewer', 'operator', 'manager', 'module_admin', 'client_admin'] as const;
export type RolePreset = (typeof ROLE_PRESETS)[number];

const OPERATIONAL_RESOURCES = new Set([
  'products',
  'customers',
  'vendors',
  'invoices',
  'expenses',
  'purchases',
  'stock',
  'attendance',
  'leave',
  'candidates',
  'students',
  'fees',
  'journals',
]);

const APPROVAL_RESOURCES = new Set([
  'invoices',
  'refunds',
  'expenses',
  'purchases',
  'leave',
  'payroll',
  'exams',
  'admissions',
]);

export function permissionsForPreset(
  preset: RolePreset,
  enabledModules: readonly ModuleKey[],
): PermissionKey[] {
  const enabled = new Set(enabledModules);
  const catalog = PERMISSION_CATALOG.filter((key) => {
    const namespace = key.split('.')[0]!;
    return namespace === 'administration' || enabled.has(namespace as ModuleKey);
  });
  const result = new Set<PermissionKey>();

  if (preset === 'client_admin') {
    catalog.forEach((key) => result.add(key));
    return [...result].sort();
  }

  for (const key of catalog) {
    const [namespace, resource, action] = key.split('.') as [string, string, string];
    if (namespace === 'administration') {
      if (preset === 'module_admin' && key === 'administration.audit.view') {
        result.add(key);
      }
      continue;
    }

    if (preset === 'module_admin') {
      result.add(key);
      continue;
    }

    if (action === 'view' || (resource === 'reports' && action === 'export')) {
      result.add(key);
      continue;
    }

    if (
      preset !== 'viewer' &&
      ((OPERATIONAL_RESOURCES.has(resource) && ['create', 'update'].includes(action)) ||
        action === 'print')
    ) {
      result.add(key);
      continue;
    }

    if (preset === 'manager') {
      if (action === 'approve' && APPROVAL_RESOURCES.has(resource)) {
        result.add(key);
      } else if (action === 'delete' && OPERATIONAL_RESOURCES.has(resource)) {
        result.add(key);
      }
    }
  }

  return [...result].sort();
}

export function expandPermissionKeys(
  requested: readonly string[],
  options: { enabledModules?: readonly ModuleKey[]; allowPlatform?: boolean } = {},
): PermissionKey[] {
  const enabled = options.enabledModules ? new Set(options.enabledModules) : undefined;
  const expanded = new Set<PermissionKey>();

  for (const value of requested) {
    const candidateKeys = value.endsWith('.*')
      ? PERMISSION_CATALOG.filter((key) => key.startsWith(`${value.slice(0, -1)}`))
      : [value];

    if (candidateKeys.length === 0) {
      throw new AppError('VALIDATION_ERROR', `Unknown permission wildcard: ${value}`);
    }

    for (const key of candidateKeys) {
      if (!(PERMISSION_CATALOG as readonly string[]).includes(key)) {
        throw new AppError('VALIDATION_ERROR', `Unknown permission: ${key}`);
      }

      const namespace = key.split('.')[0];
      if (namespace === 'platform' && !options.allowPlatform) {
        throw new AppError('PERMISSION_ESCALATION', 'Platform permissions cannot be delegated.');
      }
      if (enabled && namespace !== 'administration' && namespace !== 'platform' &&
          !enabled.has(namespace as ModuleKey)) {
        throw new AppError('PERMISSION_ESCALATION', 'Permission is not entitled for an enabled module.', {
          permission: key,
        });
      }
      expanded.add(key as PermissionKey);
    }
  }

  return [...expanded].sort();
}

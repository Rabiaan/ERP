import React, { useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { apiDownload, apiRequest, errorMessage } from '../../api/client';
import type { DashboardCard, ListResponse, Row } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { AsyncView, useApiData } from '../../components/common/Async';
import {
  Card,
  DataGrid,
  Field,
  HeroCard,
  KpiCard,
  Modal,
  PageHeader,
  PillBadge,
  SearchInput,
  StatePanel,
  Toolbar,
  formatCell,
  inputClass,
  toneForStatus,
} from '../../components/common/Ui';

export function WorkspaceDashboardPage() {
  const auth = useAuth();
  const module = auth.workspace?.activeModule ?? 'retail';
  const state = useApiData(() => apiRequest<{ module: string; cards: DashboardCard[] }>(`/api/workspace/${module}/dashboard`), [module]);

  return (
    <>
      <PageHeader
        eyebrow={module}
        title={`${module.charAt(0).toUpperCase()}${module.slice(1)} dashboard`}
        subtitle={auth.workspace?.client ? `${auth.workspace.client.name} · ${auth.workspace.mode} mode` : 'Your workspace at a glance.'}
      />
      <AsyncView state={state}>
        {(result) => {
          const [hero, ...rest] = result.cards;
          return (
            <div className="space-y-5">
              {hero ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <HeroCard
                    eyebrow={auth.workspace?.client?.name ?? 'Workspace'}
                    title={hero.label}
                    value={hero.value}
                    note={`${result.cards.length} live metrics available`}
                    cta={{ label: 'Open ' + hero.label.toLowerCase(), href: hero.href }}
                  />
                  {rest.slice(0, 3).map((card) => (
                    <KpiCard key={card.key} label={card.label} value={card.value} href={card.href} />
                  ))}
                </div>
              ) : (
                <StatePanel kind="denied" title="No dashboard metrics" message="Your role does not include any dashboard view permissions." />
              )}
              {rest.length > 3 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {rest.slice(3).map((card) => (
                    <KpiCard key={card.key} label={card.label} value={card.value} href={card.href} />
                  ))}
                </div>
              ) : null}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Card>
                  <h2 className="mb-4 font-display text-base font-medium">Available in this module</h2>
                  <div className="flex flex-wrap gap-2">
                    {result.cards.map((card) => (
                      <a
                        key={card.key}
                        href={card.href}
                        className="rounded-full bg-[#F7F6FC] px-4 py-2 text-xs font-medium text-[#4B4A60] hover:bg-[#F0EEFC]"
                      >
                        {card.label}
                      </a>
                    ))}
                  </div>
                </Card>
                <StatePanel kind="future" title="Scheduled reports" message="Automated report delivery is not enabled for this workspace yet." />
              </div>
            </div>
          );
        }}
      </AsyncView>
    </>
  );
}

const WORKFLOW_ACTIONS: Record<string, Array<{ label: string; suffix: string; permission: string; body?: unknown }>> = {
  invoices: [
    { label: 'Finalize', suffix: 'finalize', permission: 'approve' },
    { label: 'Duplicate', suffix: 'duplicate', permission: 'create', body: {} },
  ],
  refunds: [
    { label: 'Approve', suffix: 'approve', permission: 'approve' },
    { label: 'Reject', suffix: 'reject', permission: 'approve', body: { reason: 'Rejected from the workspace UI.' } },
  ],
  'purchase-returns': [{ label: 'Approve', suffix: 'approve', permission: 'approve' }],
  expenses: [{ label: 'Approve', suffix: 'approve', permission: 'approve' }],
  purchases: [{ label: 'Receive', suffix: 'receive', permission: 'approve' }],
  'leave-requests': [
    { label: 'Approve', suffix: 'approve', permission: 'approve', body: {} },
    { label: 'Reject', suffix: 'reject', permission: 'approve', body: { comment: 'Rejected from the workspace UI.' } },
  ],
  'pay-runs': [{ label: 'Approve', suffix: 'approve', permission: 'approve' }],
  journals: [{ label: 'Post', suffix: 'post', permission: 'post' }],
};

const RESOURCE_PERMISSIONS: Record<string, string> = {
  'fee-invoices': 'fees',
  'fee-payments': 'fees',
  'fee-heads': 'fees',
  'transport-routes': 'transport',
  'bank-accounts': 'banks',
  'ar-open-items': 'receivables',
  'ap-open-items': 'payables',
  'chart-of-accounts': 'chart_of_accounts',
  'journal-lines': 'journals',
  'stock-movements': 'stock',
  'bank-transactions': 'banks',
  'leave-requests': 'leave',
  'leave-types': 'leave',
  'pay-runs': 'payroll',
  'job-openings': 'job_openings',
};

function permissionKey(module: string, resource: string, action: string): string {
  const name = RESOURCE_PERMISSIONS[resource] ?? resource.replace(/-/g, '_');
  return `${module}.${name}.${action}`;
}

const RESERVED_FIELDS = new Set(['id', 'client_id', 'module_key', 'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at']);

function editableFields(row: Row | undefined): string[] {
  if (!row) return [];
  return Object.keys(row).filter((key) => !RESERVED_FIELDS.has(key)).slice(0, 8);
}

export function ResourcePage({
  module,
  resource,
  title,
  subtitle,
  readOnly = false,
  basePath,
}: {
  module: string;
  resource: string;
  title: string;
  subtitle?: string;
  readOnly?: boolean;
  basePath?: string;
}) {
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canView = auth.can(permissionKey(module, resource, 'view'));
  const canCreate = !readOnly && auth.can(permissionKey(module, resource, 'create'));
  const canUpdate = !readOnly && auth.can(permissionKey(module, resource, 'update'));
  const canDelete = !readOnly && auth.can(permissionKey(module, resource, 'delete'));
  const canExport = auth.canAny([permissionKey(module, resource, 'export'), `${module}.reports.export`]);
  const path = basePath ?? `/api/workspace/${module}/${resource}`;

  const state = useApiData(() => apiRequest<ListResponse<Row>>(path, {
    query: { q: search, page, per_page: 25 },
  }), [module, resource, search, page, path]);

  if (!canView) {
    return (
      <>
        <PageHeader eyebrow={module} title={title} subtitle={subtitle} />
        <StatePanel
          kind="denied"
          title="You cannot view this screen"
          message={`Your role needs ${permissionKey(module, resource, 'view')}. Ask a workspace administrator for access.`}
          action={<a href={`/w/${module}/dashboard`} className="mt-2 text-xs font-medium text-[#5F57C4] hover:underline">Back to dashboard</a>}
        />
      </>
    );
  }

  const rows = state.data?.data ?? [];
  const fields = editableFields(rows[0]);

  function openEditor(row: Row | 'new') {
    setMessage(null);
    setEditing(row);
    setForm(
      row === 'new'
        ? Object.fromEntries(fields.map((field) => [field, '']))
        : Object.fromEntries(Object.entries(row).filter(([key]) => fields.includes(key)).map(([key, value]) => [key, value === null || value === undefined ? '' : String(value)])),
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setMessage(null);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''));
      if (editing === 'new') {
        await apiRequest(path, { method: 'POST', body });
        setMessage('Record created.');
      } else {
        await apiRequest(`${path}/${String(editing.id)}`, { method: 'PATCH', body });
        setMessage('Record updated.');
      }
      setEditing(null);
      state.reload();
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Row) {
    setMessage(null);
    try {
      await apiRequest(`${path}/${String(row.id)}`, { method: 'DELETE' });
      state.reload();
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }

  async function workflow(row: Row, suffix: string, body: unknown) {
    setMessage(null);
    try {
      await apiRequest(`${path}/${String(row.id)}/${suffix}`, { method: 'POST', body });
      state.reload();
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }

  const columns = (() => {
    const preferred = ['id', 'name', 'code', 'number', 'status', 'total', 'amount', 'created_at'];
    const keys = preferred.filter((key) => rows.some((row) => key in row));
    const chosen = keys.length ? keys : Object.keys(rows[0] ?? {}).slice(0, 6);
    return chosen.map((key) => ({
      key,
      header: key.replace(/_/g, ' '),
      render: (row: Row) =>
        key === 'status' ? <PillBadge tone={toneForStatus(row[key])}>{formatCell(row[key])}</PillBadge> : formatCell(row[key]),
    }));
  })();

  const actions = WORKFLOW_ACTIONS[resource] ?? [];

  return (
    <>
      <PageHeader
        eyebrow={module}
        title={title}
        subtitle={subtitle ?? `Live ${resource.replace(/-/g, ' ')} records from this tenant database.`}
        actions={
          <>
            {canExport ? (
              <button
                type="button"
                onClick={() => void apiDownload(`${path}/export`, `${module}-${resource}.csv`)}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-medium shadow-sm hover:bg-[#F8F7FD]"
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> Export
              </button>
            ) : null}
            {canCreate ? (
              <button
                type="button"
                onClick={() => openEditor('new')}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-medium shadow-sm hover:bg-[#F8F7FD]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> New record
              </button>
            ) : null}
          </>
        }
      />
      {message ? <div role="status" className="mb-4 rounded-[16px] bg-[#F2F0FB] p-3 text-xs text-[#4B4A60]">{message}</div> : null}
      <Toolbar>
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={`Search ${resource}`} />
      </Toolbar>
      <AsyncView state={state}>
        {(result) => (
          <Card>
            <div className="mb-3 flex items-center justify-between text-[11px] text-[#9A99AA]">
              <span>{result.meta.total} records</span>
              <span>Page {result.meta.page}</span>
            </div>
            <DataGrid
              rows={result.data}
              columns={[
                ...columns,
                ...(canUpdate || canDelete || actions.length ? [{
                  key: 'actions',
                  header: 'Actions',
                  render: (row: Row) => (
                    <div className="flex flex-wrap gap-2">
                      {canUpdate ? <button type="button" onClick={() => openEditor(row)} className="text-xs font-medium text-[#5F57C4] hover:underline">Edit</button> : null}
                      {actions
                        .filter((action) => auth.can(permissionKey(module, resource, action.permission)))
                        .map((action) => (
                          <button key={action.suffix} type="button" onClick={() => void workflow(row, action.suffix, action.body)} className="text-xs text-[#6B6A85] hover:underline">
                            {action.label}
                          </button>
                        ))}
                      {canDelete ? <button type="button" onClick={() => void remove(row)} className="text-xs text-[#C93B40] hover:underline">Delete</button> : null}
                    </div>
                  ),
                }] : []),
              ]}
            />
            <div className="mt-4 flex items-center justify-between">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="h-9 rounded-full bg-[#F7F6FC] px-4 text-xs font-medium disabled:opacity-40">Previous</button>
              <button type="button" disabled={result.data.length < result.meta.per_page} onClick={() => setPage((value) => value + 1)} className="h-9 rounded-full bg-[#F7F6FC] px-4 text-xs font-medium disabled:opacity-40">Next</button>
            </div>
          </Card>
        )}
      </AsyncView>

      <Modal open={editing !== null} title={editing === 'new' ? `New ${resource}` : `Edit ${resource}`} onClose={() => setEditing(null)} wide>
        <form onSubmit={(event) => void save(event)} className="space-y-3">
          {fields.map((field) => (
            <Field key={field} label={field.replace(/_/g, ' ')} htmlFor={`field-${field}`}>
              <input
                id={`field-${field}`}
                className={inputClass}
                value={form[field] ?? ''}
                onChange={(event) => setForm({ ...form, [field]: event.target.value })}
              />
            </Field>
          ))}
          {!fields.length ? <p className="text-xs text-[#9A99AA]">This resource has no editable fields for your role.</p> : null}
          {message ? <p role="alert" className="text-xs text-[#C93B40]">{message}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditing(null)} className="h-10 rounded-full px-4 text-xs font-medium text-[#6B6A85] hover:bg-[#F5F3FB]">Cancel</button>
            <button type="submit" disabled={busy || !fields.length} className="h-10 rounded-full bg-[#0E0E12] px-5 text-xs font-medium text-white hover:bg-[#1C1C24] disabled:opacity-50">Save</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DuplicateBillPage() {
  const invoices = useApiData(() => apiRequest<ListResponse<Row>>('/api/workspace/retail/invoices', { query: { per_page: 100 } }), []);
  const [invoiceId, setInvoiceId] = useState('');
  const [number, setNumber] = useState('');
  const [date, setDate] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const canCreate = useAuth().can('retail.invoices.create');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const result = await apiRequest<Row>(`/api/workspace/retail/invoices/${invoiceId}/duplicate`, {
        method: 'POST',
        body: { ...(number ? { number } : {}), ...(date ? { date } : {}) },
      });
      setMessage(`Created duplicate invoice ${formatCell(result.number ?? result.id)}.`);
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }

  if (!canCreate) {
    return <StatePanel kind="denied" title="Permission denied" message="Duplicating bills requires retail.invoices.create." />;
  }

  return (
    <>
      <PageHeader eyebrow="Retail" title="Duplicate Bill" subtitle="Copy an existing invoice into a new draft with a fresh number and date." />
      <Card className="max-w-2xl">
        <AsyncView state={invoices}>
          {(result) => (
            <form onSubmit={(event) => void submit(event)} className="space-y-4">
              <Field label="Source invoice" htmlFor="duplicate-source">
                <select id="duplicate-source" className={inputClass} value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} required>
                  <option value="">Choose an invoice</option>
                  {result.data.map((row) => (
                    <option key={String(row.id)} value={String(row.id)}>
                      {formatCell(row.number ?? row.id)} · {formatCell(row.customer_name ?? '')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="New invoice number" htmlFor="duplicate-number" hint="Leave blank to auto-generate.">
                <input id="duplicate-number" className={inputClass} value={number} onChange={(event) => setNumber(event.target.value)} />
              </Field>
              <Field label="Invoice date" htmlFor="duplicate-date">
                <input id="duplicate-date" type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
              {message ? <p role="status" className="text-xs text-[#4B4A60]">{message}</p> : null}
              <button type="submit" className="h-11 rounded-full bg-[#0E0E12] px-6 text-xs font-medium text-white hover:bg-[#1C1C24]">Create duplicate</button>
            </form>
          )}
        </AsyncView>
      </Card>
    </>
  );
}

const HR_COMPONENT_ROUTES: Record<string, () => Promise<{ [key: string]: React.ComponentType }>> = {
  employees: () => import('../EmployeesPage'),
  'org-chart': () => import('../OrgChartPage'),
  onboarding: () => import('../OnboardingPage'),
  attendance: () => import('../AttendancePage'),
  leave: () => import('../LeavePage'),
  payroll: () => import('../PayrollPage'),
  recruitment: () => import('../RecruitmentPage'),
  performance: () => import('../PerformancePage'),
  workplace: () => import('../WorkplacePage'),
  reports: () => import('../ReportsPage'),
  settings: () => import('../SettingsPage'),
};

export function HrPrototypeRoute({ screen }: { screen: string }) {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [failed, setFailed] = useState(false);
  const module = 'hr';
  React.useEffect(() => {
    let active = true;
    const loader = HR_COMPONENT_ROUTES[screen];
    if (!loader) {
      setFailed(true);
      return;
    }
    void loader()
      .then((loaded) => {
        if (!active) return;
        const key = Object.keys(loaded)[0];
        setComponent(key ? (loaded[key] as React.ComponentType) : null);
      })
      .catch(() => setFailed(true));
    return () => { active = false; };
  }, [screen]);

  if (failed) return <StatePanel kind="error" title="Screen unavailable" message={`The ${screen} screen could not be loaded.`} />;
  if (!Component) return <StatePanel kind="loading" title="Loading screen" message="Preparing the HR view…" />;
  return <Component />;
}

export function WorkspaceFallbackPage() {
  return (
    <StatePanel
      kind="future"
      title="Screen not available"
      message="This route is reserved for a future module screen. Use the navigation to open an available view."
    />
  );
}

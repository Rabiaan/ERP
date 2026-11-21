import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowRight, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiDownload, apiRequest, errorMessage } from '../../api/client';
import type {
  ListResponse,
  ModuleKey,
  PlatformOverview,
  Row,
} from '../../api/types';
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

const MODULES: ModuleKey[] = ['hr', 'retail', 'school', 'accounts'];

function fmtDate(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function AccessModal({
  clientId,
  moduleKey,
  onClose,
}: {
  clientId: string;
  moduleKey: ModuleKey;
  onClose: () => void;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'inspect' | 'support'>('inspect');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.enterAccess({ clientId, moduleKey, mode, reason });
      navigate(`/w/${moduleKey}/dashboard`);
    } catch (reason_) {
      setError(errorMessage(reason_));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`Open ${moduleKey} workspace`} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#4B4A60]">Mode</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as 'inspect' | 'support')} className={inputClass}>
            <option value="inspect">Inspect — read-only</option>
            <option value="support">Support — write access</option>
          </select>
        </label>
        <Field label="Reason" htmlFor="access-reason" hint="Required for support mode and written to the access log.">
          <input
            id="access-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={inputClass}
            minLength={3}
            required
          />
        </Field>
        {error ? <p role="alert" className="text-xs text-[#C93B40]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-full px-4 text-xs font-medium text-[#6B6A85] hover:bg-[#F5F3FB]">Cancel</button>
          <button type="submit" disabled={busy} className="h-10 rounded-full bg-[#0E0E12] px-5 text-xs font-medium text-white hover:bg-[#1C1C24] disabled:opacity-50">
            {busy ? 'Opening…' : 'Open workspace'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PlatformOverviewPage() {
  const state = useApiData(async () => {
    const [overview, health] = await Promise.all([
      apiRequest<PlatformOverview>('/api/platform/overview'),
      apiRequest<Row>('/api/platform/health'),
    ]);
    return { overview, health };
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Platform console"
        title="Good morning, Super Admin"
        subtitle="A live view of clients, modules, provisioning, and platform health."
        actions={
          <a href="/platform/clients/new" className="inline-flex h-10 items-center rounded-full bg-white px-4 text-xs font-medium shadow-sm hover:bg-[#F8F7FD]">
            Add client
          </a>
        }
      />
      <AsyncView state={state}>
        {({ overview, health }) => (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <HeroCard
                eyebrow="Active clients"
                title="Clients on the platform"
                value={overview.active_clients}
                note={`${overview.clients} total clients · ${overview.active_modules} active modules`}
                cta={{ label: 'View all clients', href: '/platform/clients' }}
                progress={{ value: overview.active_clients, max: Math.max(overview.clients, 1) }}
              />
              <KpiCard label="Active users" value={overview.active_users} hint="Across all tenant modules" />
              <KpiCard label="Pending jobs" value={overview.pending_jobs} hint={`${overview.failed_jobs} failed`} href="/platform/provisioning" />
              <KpiCard label="Audit events · 24h" value={overview.audit_events_24h} hint={`${overview.tenant_pools} tenant pools`} href="/platform/audit" />
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-base font-medium">Recent activity</h2>
                    <p className="text-[11px] text-[#9A99AA]">Latest platform audit events</p>
                  </div>
                  <a href="/platform/audit" className="text-xs font-medium text-[#5F57C4] hover:underline">View all</a>
                </div>
                <DataGrid
                  rows={overview.recent_activity}
                  emptyTitle="No activity yet"
                  columns={[
                    { key: 'action', header: 'Action', render: (row) => <span className="font-medium">{formatCell(row.action)}</span> },
                    { key: 'entity', header: 'Entity' },
                    { key: 'actor_type', header: 'Actor' },
                    { key: 'created_at', header: 'When', render: (row) => fmtDate(row.created_at) },
                  ]}
                />
              </Card>
              <div className="space-y-4">
                <Card>
                  <h2 className="mb-3 font-display text-base font-medium">System health</h2>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between rounded-[14px] bg-[#F7F6FC] px-3 py-2.5">
                      <span>Platform database</span>
                      <PillBadge tone={String(health.platform_database) === 'up' ? 'success' : 'danger'}>{formatCell(health.platform_database)}</PillBadge>
                    </div>
                    <div className="flex items-center justify-between rounded-[14px] bg-[#F7F6FC] px-3 py-2.5">
                      <span>Tenant pools</span>
                      <span className="font-medium tabular-nums">{formatCell(health.tenant_pools)}</span>
                    </div>
                  </div>
                </Card>
                <Card>
                  <h2 className="mb-3 font-display text-base font-medium">Clients by status</h2>
                  <div className="space-y-2">
                    {overview.clients_by_status.length ? (
                      overview.clients_by_status.map((item) => (
                        <div key={item.status} className="flex items-center justify-between text-xs">
                          <PillBadge tone={toneForStatus(item.status)}>{item.status}</PillBadge>
                          <span className="font-medium tabular-nums">{item.count}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[#9A99AA]">No clients yet.</p>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}
      </AsyncView>
    </>
  );
}

export function ClientsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const state = useApiData(
    () => apiRequest<ListResponse<Row>>('/api/platform/clients', { query: { q: search, status, per_page: 100 } }),
    [search, status],
  );

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Client accounts"
        subtitle="Every client owns isolated module databases."
        actions={<a href="/platform/clients/new" className="inline-flex h-10 items-center rounded-full bg-white px-4 text-xs font-medium shadow-sm hover:bg-[#F8F7FD]">New client</a>}
      />
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search clients" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className={`${inputClass} h-10 w-40 rounded-full`}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>
      </Toolbar>
      <AsyncView state={state}>
        {(result) => (
          <Card>
            <div className="mb-3 text-[11px] text-[#9A99AA]">{result.meta.total} clients</div>
            <DataGrid
              rows={result.data}
              columns={[
                { key: 'name', header: 'Client', render: (row) => <a className="font-medium hover:underline" href={`/platform/clients/${String(row.id)}`}>{formatCell(row.name)}</a> },
                { key: 'slug', header: 'Slug' },
                { key: 'plan_name', header: 'Plan' },
                { key: 'modules', header: 'Modules', render: (row) => {
                  const modules = row.modules as Array<{ module_key: string }> | undefined;
                  return modules?.length ? modules.map((item) => <PillBadge key={item.module_key}>{item.module_key}</PillBadge>) : '—';
                } },
                { key: 'users', header: 'Users', render: (row) => <span className="tabular-nums">{formatCell(row.users)}</span> },
                { key: 'status', header: 'Status', render: (row) => <PillBadge tone={toneForStatus(row.status)}>{formatCell(row.status)}</PillBadge> },
                { key: 'created_at', header: 'Created', render: (row) => fmtDate(row.created_at) },
              ]}
            />
          </Card>
        )}
      </AsyncView>
    </>
  );
}

export function ClientNewPage() {
  const navigate = useNavigate();
  const plans = useApiData(() => apiRequest<Row[]>('/api/platform/plans'), []);
  const [form, setForm] = useState({ name: '', slug: '', plan_key: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiRequest<{ id: string }>('/api/platform/clients', {
        method: 'POST',
        body: { name: form.name, slug: form.slug || slugify(form.name), plan_key: form.plan_key },
      });
      navigate(`/platform/clients/${created.id}`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Clients" title="Create a client" subtitle="Add the account first, then invite an administrator and enable modules." />
      <Card className="max-w-2xl">
        <AsyncView state={plans}>
          {(planRows) => (
            <form onSubmit={(event) => void submit(event)} className="space-y-4">
              <Field label="Client name" htmlFor="client-name">
                <input id="client-name" className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value, slug: slugify(event.target.value) })} required />
              </Field>
              <Field label="Slug" htmlFor="client-slug" hint="Lower-case and hyphenated.">
                <input id="client-slug" className={inputClass} value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} required />
              </Field>
              <Field label="Plan" htmlFor="client-plan">
                <select id="client-plan" className={inputClass} value={form.plan_key} onChange={(event) => setForm({ ...form, plan_key: event.target.value })} required>
                  <option value="">Choose a plan</option>
                  {planRows.map((plan) => <option key={String(plan.id)} value={String(plan.key)}>{formatCell(plan.name)}</option>)}
                </select>
              </Field>
              {error ? <p role="alert" className="text-xs text-[#C93B40]">{error}</p> : null}
              <div className="flex gap-2">
                <a href="/platform/clients" className="inline-flex h-11 items-center rounded-full px-5 text-xs font-medium text-[#6B6A85] hover:bg-[#F5F3FB]">Cancel</a>
                <button type="submit" disabled={busy} className="h-11 rounded-full bg-[#0E0E12] px-6 text-xs font-medium text-white hover:bg-[#1C1C24] disabled:opacity-50">
                  {busy ? 'Creating…' : 'Create client'}
                </button>
              </div>
            </form>
          )}
        </AsyncView>
      </Card>
    </>
  );
}

export function ClientDetailPage() {
  const { clientId = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'modules' | 'users' | 'usage' | 'audit'>('modules');
  const [accessModule, setAccessModule] = useState<ModuleKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enableForm, setEnableForm] = useState({ module_key: 'retail', admin_user_id: '', grants: '' });
  const [adminForm, setAdminForm] = useState({ email: '', full_name: '', module_key: 'retail', module_grants: '' });
  const [reason, setReason] = useState('');

  const state = useApiData(async () => {
    const [client, memberships, usage, audit] = await Promise.all([
      apiRequest<Row>(`/api/platform/clients/${clientId}`),
      apiRequest<Row[]>(`/api/platform/clients/${clientId}/memberships`),
      apiRequest<Row[]>(`/api/platform/clients/${clientId}/usage`),
      apiRequest<Row[]>(`/api/platform/clients/${clientId}/audit`),
    ]);
    return { client, memberships, usage, audit };
  }, [clientId]);

  async function mutate(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(path, { method, body });
      state.reload();
    } catch (reason_) {
      setError(errorMessage(reason_));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Client detail"
        title="Loading client…"
        subtitle={clientId}
      />
      <AsyncView state={state}>
        {({ client, memberships, usage, audit }) => (
          <>
            <PageHeader
              eyebrow={String(client.slug ?? '')}
              title={String(client.name ?? '')}
              subtitle={`${formatCell(client.plan_name)} · ${formatCell(client.status)} · Created ${fmtDate(client.created_at)}`}
              actions={
                <button
                  type="button"
                  onClick={() => void mutate(`/api/platform/clients/${clientId}`, 'PATCH', { status: client.status === 'active' ? 'suspended' : 'active' }).then(() => undefined)}
                  disabled={busy}
                  className="h-11 rounded-full bg-white px-5 text-xs font-medium shadow-sm hover:bg-[#F8F7FD]"
                >
                  {client.status === 'active' ? 'Suspend client' : 'Reactivate client'}
                </button>
              }
            />
            {error ? <div role="alert" className="mb-4 rounded-[16px] bg-[#FDECEC] p-3 text-xs text-[#C93B40]">{error}</div> : null}
            <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Client detail sections">
              {(['modules', 'users', 'usage', 'audit'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={tab === item}
                  onClick={() => setTab(item)}
                  className={`h-9 rounded-full px-4 text-xs font-medium capitalize ${tab === item ? 'bg-[#0E0E12] text-white' : 'bg-white text-[#6B6A85] shadow-sm hover:bg-[#F8F7FD]'}`}
                >
                  {item}
                </button>
              ))}
            </div>

            {tab === 'modules' ? (
              <div className="space-y-4">
                <Card>
                  <h2 className="mb-4 font-display text-base font-medium">Enabled modules</h2>
                  <DataGrid
                    rows={(client.modules as Row[]) ?? []}
                    keyFor={(row) => String(row.module_key)}
                    columns={[
                      { key: 'module_key', header: 'Module' },
                      { key: 'status', header: 'Status', render: (row) => <PillBadge tone={toneForStatus(row.status)}>{formatCell(row.status)}</PillBadge> },
                      { key: 'schema_version', header: 'Schema' },
                      {
                        key: 'access',
                        header: 'Access',
                        render: (row) => (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setAccessModule(String(row.module_key) as ModuleKey)} className="inline-flex items-center gap-1 text-xs font-medium text-[#5F57C4] hover:underline">
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Open
                            </button>
                            <button
                              type="button"
                              onClick={() => void mutate(`/api/platform/clients/${clientId}/modules/${String(row.module_key)}`, 'PATCH', { status: row.status === 'active' ? 'disabled' : 'active' })}
                              className="text-xs text-[#6B6A85] hover:underline"
                            >
                              {row.status === 'active' ? 'Disable' : 'Reactivate'}
                            </button>
                          </div>
                        ),
                      },
                    ]}
                  />
                </Card>
                <Card>
                  <h2 className="mb-4 font-display text-base font-medium">Enable a module</h2>
                  <form onSubmit={(event) => { event.preventDefault(); void mutate(`/api/platform/clients/${clientId}/modules`, 'POST', {
                    module_key: enableForm.module_key,
                    admin_user_id: enableForm.admin_user_id,
                    grants: enableForm.grants.split(',').map((item) => item.trim()).filter(Boolean),
                  }); }} className="grid gap-3 sm:grid-cols-3">
                    <Field label="Module" htmlFor="enable-module">
                      <select id="enable-module" className={inputClass} value={enableForm.module_key} onChange={(event) => setEnableForm({ ...enableForm, module_key: event.target.value })}>
                        {MODULES.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </Field>
                    <Field label="Admin user" htmlFor="enable-admin">
                      <select id="enable-admin" className={inputClass} value={enableForm.admin_user_id} onChange={(event) => setEnableForm({ ...enableForm, admin_user_id: event.target.value })} required>
                        <option value="">Choose an existing user</option>
                        {memberships.map((member) => (
                          <option key={String(member.id)} value={String(member.user_id)}>{formatCell(member.email)}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Extra grants" htmlFor="enable-grants" hint="Comma-separated permission keys.">
                      <input id="enable-grants" className={inputClass} value={enableForm.grants} onChange={(event) => setEnableForm({ ...enableForm, grants: event.target.value })} />
                    </Field>
                    <div className="sm:col-span-3">
                      <button type="submit" disabled={busy || !memberships.length} className="h-10 rounded-full bg-[#0E0E12] px-5 text-xs font-medium text-white hover:bg-[#1C1C24] disabled:opacity-50">
                        Enable module
                      </button>
                      {!memberships.length ? <p className="mt-2 text-[11px] text-[#9A99AA]">Invite an administrator in the Users tab first.</p> : null}
                    </div>
                  </form>
                </Card>
              </div>
            ) : null}

            {tab === 'users' ? (
              <div className="space-y-4">
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-base font-medium">Memberships</h2>
                    <span className="text-[11px] text-[#9A99AA]">{memberships.length} users</span>
                  </div>
                  <DataGrid
                    rows={memberships}
                    columns={[
                      { key: 'full_name', header: 'Name' },
                      { key: 'email', header: 'Email' },
                      { key: 'module_key', header: 'Module', render: (row) => <PillBadge>{formatCell(row.module_key)}</PillBadge> },
                      { key: 'role', header: 'Role' },
                      { key: 'status', header: 'Status', render: (row) => <PillBadge tone={toneForStatus(row.status)}>{formatCell(row.status)}</PillBadge> },
                      {
                        key: 'actions',
                        header: 'Actions',
                        render: (row) => (
                          <div className="flex flex-wrap gap-2">
                            {['suspend', 'reactivate', 'revoke_sessions'].map((action) => (
                              <button key={action} type="button" onClick={() => void mutate(`/api/platform/clients/${clientId}/admins/${String(row.id)}`, 'PATCH', { action })} className="text-xs text-[#5F57C4] hover:underline">
                                {action.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                        ),
                      },
                    ]}
                  />
                </Card>
                <Card>
                  <h2 className="mb-4 font-display text-base font-medium">Invite an administrator</h2>
                  <form onSubmit={(event) => { event.preventDefault(); void mutate(`/api/platform/clients/${clientId}/admins`, 'POST', {
                    email: adminForm.email,
                    full_name: adminForm.full_name,
                    module_key: adminForm.module_key,
                    module_grants: adminForm.module_grants.split(',').map((item) => item.trim()).filter(Boolean),
                  }); }} className="grid gap-3 sm:grid-cols-2">
                    <Field label="Full name" htmlFor="admin-name"><input id="admin-name" className={inputClass} value={adminForm.full_name} onChange={(event) => setAdminForm({ ...adminForm, full_name: event.target.value })} required /></Field>
                    <Field label="Email" htmlFor="admin-email"><input id="admin-email" type="email" className={inputClass} value={adminForm.email} onChange={(event) => setAdminForm({ ...adminForm, email: event.target.value })} required /></Field>
                    <Field label="Module" htmlFor="admin-module">
                      <select id="admin-module" className={inputClass} value={adminForm.module_key} onChange={(event) => setAdminForm({ ...adminForm, module_key: event.target.value })}>
                        {MODULES.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </Field>
                    <Field label="Module grants" htmlFor="admin-grants" hint="Comma-separated, e.g. retail.products.view">
                      <input id="admin-grants" className={inputClass} value={adminForm.module_grants} onChange={(event) => setAdminForm({ ...adminForm, module_grants: event.target.value })} required />
                    </Field>
                    <div>
                      <button type="submit" disabled={busy} className="h-10 rounded-full bg-[#0E0E12] px-5 text-xs font-medium text-white hover:bg-[#1C1C24] disabled:opacity-50">Send invite</button>
                    </div>
                  </form>
                </Card>
                <Card>
                  <h2 className="mb-4 font-display text-base font-medium">Impersonate a user</h2>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label="Reason" htmlFor="impersonate-reason">
                      <input id="impersonate-reason" className={`${inputClass} min-w-64`} value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} />
                    </Field>
                    <select aria-label="User to impersonate" className={`${inputClass} h-10 w-64 rounded-full`} id="impersonate-user">
                      {memberships.map((member) => <option key={String(member.id)} value={String(member.user_id)}>{formatCell(member.email)}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const select = document.getElementById('impersonate-user') as HTMLSelectElement | null;
                        if (select?.value) void mutate('/api/platform/impersonate', 'POST', { user_id: select.value, client_id: clientId, reason });
                      }}
                      className="h-10 rounded-full bg-white px-5 text-xs font-medium shadow-sm hover:bg-[#F8F7FD]"
                    >
                      Impersonate
                    </button>
                  </div>
                </Card>
              </div>
            ) : null}

            {tab === 'usage' ? (
              <Card>
                <h2 className="mb-4 font-display text-base font-medium">Usage counters</h2>
                <DataGrid
                  rows={usage}
                  columns={[
                    { key: 'module_key', header: 'Module' },
                    { key: 'metric', header: 'Metric' },
                    { key: 'value', header: 'Value', render: (row) => <span className="tabular-nums">{formatCell(row.value)}</span> },
                    { key: 'period_start', header: 'Period', render: (row) => fmtDate(row.period_start) },
                  ]}
                />
              </Card>
            ) : null}

            {tab === 'audit' ? (
              <Card>
                <h2 className="mb-4 font-display text-base font-medium">Client audit</h2>
                <DataGrid
                  rows={audit}
                  columns={[
                    { key: 'action', header: 'Action' },
                    { key: 'entity', header: 'Entity' },
                    { key: 'module_key', header: 'Module' },
                    { key: 'actor_type', header: 'Actor' },
                    { key: 'created_at', header: 'When', render: (row) => fmtDate(row.created_at) },
                  ]}
                />
              </Card>
            ) : null}

            {accessModule ? <AccessModal clientId={clientId} moduleKey={accessModule} onClose={() => setAccessModule(null)} /> : null}
            <button type="button" onClick={() => navigate('/platform/clients')} className="mt-5 text-xs font-medium text-[#6B6A85] hover:underline">← Back to clients</button>
          </>
        )}
      </AsyncView>
    </>
  );
}

export function ModulesPage() {
  const state = useApiData(() => apiRequest<Row[]>('/api/platform/modules'), []);
  return (
    <>
      <PageHeader eyebrow="Catalog" title="Module catalog" subtitle="Available modules, versions, and rollout status." />
      <AsyncView state={state}>
        {(rows) => (
          <Card>
            <DataGrid
              rows={rows}
              columns={[
                { key: 'name', header: 'Module', render: (row) => <span className="font-medium">{formatCell(row.name)}</span> },
                { key: 'key', header: 'Key', render: (row) => <code className="rounded bg-[#F5F3FB] px-2 py-1 text-[11px]">{formatCell(row.key)}</code> },
                { key: 'latest_version', header: 'Version' },
                { key: 'instances', header: 'Instances' },
                { key: 'active_instances', header: 'Active' },
                { key: 'is_active', header: 'Available', render: (row) => <PillBadge tone={row.is_active ? 'success' : 'neutral'}>{row.is_active ? 'yes' : 'no'}</PillBadge> },
              ]}
            />
          </Card>
        )}
      </AsyncView>
    </>
  );
}

export function ModuleInstancesPage() {
  const state = useApiData(() => apiRequest<Row[]>('/api/platform/modules/instances'), []);
  const [access, setAccess] = useState<{ clientId: string; moduleKey: ModuleKey } | null>(null);
  return (
    <>
      <PageHeader eyebrow="All modules" title="Module instances" subtitle="Open any client module in Inspect or Support mode." />
      <AsyncView state={state}>
        {(rows) => (
          <Card>
            <DataGrid
              rows={rows}
              columns={[
                { key: 'client_name', header: 'Client', render: (row) => <span className="font-medium">{formatCell(row.client_name)}</span> },
                { key: 'module_name', header: 'Module' },
                { key: 'status', header: 'Status', render: (row) => <PillBadge tone={toneForStatus(row.status)}>{formatCell(row.status)}</PillBadge> },
                { key: 'health', header: 'Health', render: (row) => <PillBadge tone={toneForStatus(row.health)}>{formatCell(row.health)}</PillBadge> },
                { key: 'schema_version', header: 'Version' },
                { key: 'active_users', header: 'Users' },
                { key: 'record_count', header: 'Records' },
                {
                  key: 'open',
                  header: 'Action',
                  render: (row) => (
                    <button
                      type="button"
                      onClick={() => setAccess({ clientId: String(row.client_id), moduleKey: String(row.module_key) as ModuleKey })}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#5F57C4] hover:underline"
                    >
                      Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ),
                },
              ]}
            />
          </Card>
        )}
      </AsyncView>
      {access ? <AccessModal clientId={access.clientId} moduleKey={access.moduleKey} onClose={() => setAccess(null)} /> : null}
    </>
  );
}

export function ProvisioningPage() {
  const state = useApiData(() => apiRequest<Row[]>('/api/platform/provisioning-jobs'), []);
  const [expanded, setExpanded] = useState<string | null>(null);
  async function act(id: string, action: 'retry' | 'cancel') {
    try {
      await apiRequest(`/api/platform/provisioning-jobs/${id}/${action}`, { method: 'POST' });
      state.reload();
    } catch {
      state.reload();
    }
  }
  return (
    <>
      <PageHeader eyebrow="Provisioning" title="Provisioning jobs" subtitle="Database creation, migrations, activation, and deprovisioning." />
      <AsyncView state={state}>
        {(rows) => (
          <Card>
            <DataGrid
              rows={rows}
              columns={[
                { key: 'client_name', header: 'Client' },
                { key: 'module_key', header: 'Module' },
                { key: 'job_type', header: 'Job' },
                { key: 'step', header: 'Step' },
                { key: 'attempts', header: 'Attempts' },
                { key: 'status', header: 'Status', render: (row) => <PillBadge tone={toneForStatus(row.status)}>{formatCell(row.status)}</PillBadge> },
                { key: 'created_at', header: 'Created', render: (row) => fmtDate(row.created_at) },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (row) => (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setExpanded(expanded === String(row.id) ? null : String(row.id))} className="text-xs font-medium text-[#5F57C4] hover:underline">Steps</button>
                      {row.status === 'failed' ? <button type="button" onClick={() => void act(String(row.id), 'retry')} className="text-xs text-[#6B6A85] hover:underline">Retry</button> : null}
                      {row.status === 'queued' ? <button type="button" onClick={() => void act(String(row.id), 'cancel')} className="text-xs text-[#6B6A85] hover:underline">Cancel</button> : null}
                    </div>
                  ),
                },
              ]}
            />
            {expanded ? (
              <div className="mt-4 rounded-[16px] bg-[#F7F6FC] p-4">
                <p className="mb-2 text-xs font-medium">Step timeline</p>
                <pre className="overflow-x-auto text-[11px] leading-relaxed text-[#4B4A60]">
                  {JSON.stringify(rows.find((row) => String(row.id) === expanded)?.steps ?? [], null, 2)}
                </pre>
              </div>
            ) : null}
          </Card>
        )}
      </AsyncView>
    </>
  );
}

export function PlansPage() {
  const state = useApiData(async () => {
    const [plans, usage] = await Promise.all([
      apiRequest<Row[]>('/api/platform/plans'),
      apiRequest<Row[]>('/api/platform/usage'),
    ]);
    return { plans, usage };
  }, []);
  return (
    <>
      <PageHeader eyebrow="Commercial" title="Plans & usage" subtitle="Limits and live counters by client and module." />
      <AsyncView state={state}>
        {({ plans, usage }) => (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <Card key={String(plan.id)}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-display text-base font-medium">{formatCell(plan.name)}</p>
                      <p className="text-[11px] text-[#9A99AA]">{formatCell(plan.key)}</p>
                    </div>
                    <PillBadge tone={plan.is_active ? 'success' : 'neutral'}>{plan.is_active ? 'active' : 'inactive'}</PillBadge>
                  </div>
                  <p className="mt-4 font-display text-2xl font-medium tabular-nums">PKR {formatCell(plan.price_pkr)}</p>
                  <dl className="mt-4 space-y-1.5 text-[11px] text-[#6B6A85]">
                    <div className="flex justify-between"><dt>Users</dt><dd>{formatCell(plan.max_users)}</dd></div>
                    <div className="flex justify-between"><dt>Branches</dt><dd>{formatCell(plan.max_branches)}</dd></div>
                    <div className="flex justify-between"><dt>Modules</dt><dd>{formatCell(plan.max_modules)}</dd></div>
                    <div className="flex justify-between"><dt>Storage</dt><dd>{formatCell(plan.storage_mb)} MB</dd></div>
                  </dl>
                </Card>
              ))}
            </div>
            <Card>
              <h2 className="mb-4 font-display text-base font-medium">Usage counters</h2>
              <DataGrid
                rows={usage}
                columns={[
                  { key: 'client_name', header: 'Client' },
                  { key: 'module_key', header: 'Module' },
                  { key: 'metric', header: 'Metric' },
                  { key: 'value', header: 'Value', render: (row) => <span className="tabular-nums">{formatCell(row.value)}</span> },
                  { key: 'period_start', header: 'Period', render: (row) => fmtDate(row.period_start) },
                ]}
              />
            </Card>
          </div>
        )}
      </AsyncView>
    </>
  );
}

export function PlatformAuditPage() {
  const [action, setAction] = useState('');
  const [clientId, setClientId] = useState('');
  const state = useApiData(
    () => apiRequest<ListResponse<Row>>('/api/platform/audit', { query: { action, client_id: clientId, per_page: 100 } }),
    [action, clientId],
  );
  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Platform audit"
        subtitle="Append-only record of every privileged action."
        actions={
          <button
            type="button"
            onClick={() => void apiDownload('/api/platform/audit/export', 'platform-audit.csv', { query: { action, client_id: clientId } })}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-medium shadow-sm hover:bg-[#F8F7FD]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
          </button>
        }
      />
      <Toolbar>
        <SearchInput value={action} onChange={setAction} placeholder="Filter by action" />
        <input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Client ID" aria-label="Client ID" className={`${inputClass} h-10 w-64 rounded-full`} />
      </Toolbar>
      <AsyncView state={state}>
        {(result) => (
          <Card>
            <div className="mb-3 text-[11px] text-[#9A99AA]">{result.meta.total} events</div>
            <DataGrid
              rows={result.data}
              columns={[
                { key: 'created_at', header: 'When', render: (row) => fmtDate(row.created_at) },
                { key: 'action', header: 'Action', render: (row) => <span className="font-medium">{formatCell(row.action)}</span> },
                { key: 'actor_type', header: 'Actor' },
                { key: 'module_key', header: 'Module' },
                { key: 'entity', header: 'Entity' },
                { key: 'platform_override', header: 'Override', render: (row) => (row.platform_override ? 'Yes' : 'No') },
                { key: 'request_id', header: 'Request' },
              ]}
            />
          </Card>
        )}
      </AsyncView>
    </>
  );
}

export function AccessLogPage() {
  const state = useApiData(async () => {
    const [log, active] = await Promise.all([
      apiRequest<Row[]>('/api/platform/access/log'),
      apiRequest<Row[]>('/api/platform/access/active'),
    ]);
    return { log, active };
  }, []);
  return (
    <>
      <PageHeader eyebrow="Governance" title="Super Admin access log" subtitle="Every Inspect and Support session with its reason." />
      <AsyncView state={state}>
        {({ log, active }) => (
          <div className="space-y-4">
            {active.length ? (
              <Card>
                <h2 className="mb-4 flex items-center gap-2 font-display text-base font-medium">
                  <Activity className="h-4 w-4 text-[#5F57C4]" aria-hidden /> Active sessions
                </h2>
                <DataGrid
                  rows={active}
                  columns={[
                    { key: 'client_name', header: 'Client' },
                    { key: 'module_key', header: 'Module' },
                    { key: 'mode', header: 'Mode', render: (row) => <PillBadge tone={toneForStatus(row.mode)}>{formatCell(row.mode)}</PillBadge> },
                    { key: 'reason', header: 'Reason' },
                    { key: 'expires_at', header: 'Expires', render: (row) => fmtDate(row.expires_at) },
                  ]}
                />
              </Card>
            ) : null}
            <Card>
              <h2 className="mb-4 font-display text-base font-medium">History</h2>
              <DataGrid
                rows={log}
                columns={[
                  { key: 'started_at', header: 'Started', render: (row) => fmtDate(row.started_at) },
                  { key: 'platform_user_email', header: 'Actor' },
                  { key: 'client_name', header: 'Client' },
                  { key: 'module_key', header: 'Module' },
                  { key: 'mode', header: 'Mode', render: (row) => <PillBadge tone={toneForStatus(row.mode)}>{formatCell(row.mode)}</PillBadge> },
                  { key: 'reason', header: 'Reason' },
                  { key: 'ended_at', header: 'Ended', render: (row) => fmtDate(row.ended_at) },
                ]}
              />
            </Card>
          </div>
        )}
      </AsyncView>
    </>
  );
}

export function PlatformHealthPage() {
  const state = useApiData(async () => {
    const [health, liveness] = await Promise.all([
      apiRequest<Row>('/api/platform/health'),
      apiRequest<Row>('/api/health', { skipRefresh: true, envelope: false }),
    ]);
    return { health, liveness };
  }, []);
  return (
    <>
      <PageHeader eyebrow="Platform" title="System health" subtitle="Database, registry, tenant pools, and provisioning status." />
      <AsyncView state={state}>
        {({ health, liveness }) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-base font-medium">Liveness</h2>
                <PillBadge tone={liveness.status === 'ok' ? 'success' : 'danger'}>{formatCell(liveness.status)}</PillBadge>
              </div>
              <dl className="space-y-2 text-xs text-[#6B6A85]">
                <div className="flex justify-between"><dt>Service</dt><dd>{formatCell(liveness.service)}</dd></div>
                <div className="flex justify-between"><dt>Version</dt><dd>{formatCell(liveness.version)}</dd></div>
                <div className="flex justify-between"><dt>Uptime</dt><dd>{formatCell(liveness.uptimeSeconds)}s</dd></div>
                <div className="flex justify-between"><dt>Timestamp</dt><dd>{fmtDate(liveness.timestamp)}</dd></div>
              </dl>
            </Card>
            <Card>
              <h2 className="mb-4 font-display text-base font-medium">Registry & jobs</h2>
              <pre className="overflow-x-auto rounded-[16px] bg-[#F7F6FC] p-4 text-[11px] leading-relaxed text-[#4B4A60]">
                {JSON.stringify(health, null, 2)}
              </pre>
            </Card>
          </div>
        )}
      </AsyncView>
    </>
  );
}

export function PlatformUsersPage() {
  const state = useApiData(() => apiRequest<Row[]>('/api/platform/platform-users'), []);
  const [form, setForm] = useState({ email: '', full_name: '', password: '' });
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const result = await apiRequest<{ temporary_password?: string }>('/api/platform/platform-users', {
        method: 'POST',
        body: { email: form.email, full_name: form.full_name, ...(form.password ? { password: form.password } : {}) },
      });
      setMessage(result.temporary_password ? `Temporary password: ${result.temporary_password}` : 'Platform user invited.');
      state.reload();
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }
  return (
    <>
      <PageHeader eyebrow="Governance" title="Platform users" subtitle="Super Admin accounts with enforced MFA." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AsyncView state={state}>
          {(rows) => (
            <Card>
              <DataGrid
                rows={rows}
                columns={[
                  { key: 'full_name', header: 'Name' },
                  { key: 'email', header: 'Email' },
                  { key: 'status', header: 'Status', render: (row) => <PillBadge tone={toneForStatus(row.status)}>{formatCell(row.status)}</PillBadge> },
                  { key: 'mfa_enabled', header: 'MFA', render: (row) => (row.mfa_enabled ? 'Enabled' : 'Required') },
                  { key: 'last_login_at', header: 'Last login', render: (row) => fmtDate(row.last_login_at) },
                ]}
              />
            </Card>
          )}
        </AsyncView>
        <Card>
          <h2 className="mb-4 font-display text-base font-medium">Invite Super Admin</h2>
          <form onSubmit={(event) => void submit(event)} className="space-y-3">
            <Field label="Full name" htmlFor="platform-user-name"><input id="platform-user-name" className={inputClass} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></Field>
            <Field label="Email" htmlFor="platform-user-email"><input id="platform-user-email" type="email" className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
            <Field label="Temporary password" htmlFor="platform-user-password" hint="Leave blank to generate one."><input id="platform-user-password" className={inputClass} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field>
            {message ? <p role="status" className="break-all text-xs text-[#4B4A60]">{message}</p> : null}
            <button type="submit" className="h-10 rounded-full bg-[#0E0E12] px-5 text-xs font-medium text-white hover:bg-[#1C1C24]">Invite</button>
          </form>
        </Card>
      </div>
    </>
  );
}

export function PlatformFallbackPage() {
  return (
    <StatePanel
      kind="future"
      title="Not available"
      message="This platform view is not part of your current permissions."
      action={<a href="/platform" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#5F57C4] hover:underline">Back to overview <RefreshCw className="h-3.5 w-3.5" aria-hidden /></a>}
    />
  );
}

export function PlatformDeniedPage() {
  return (
    <StatePanel
      kind="denied"
      title="Platform access required"
      message="This area is available to Super Admins only."
      action={<a href="/login?realm=platform" className="mt-2 text-xs font-medium text-[#5F57C4] hover:underline">Sign in to the platform console</a>}
    />
  );
}

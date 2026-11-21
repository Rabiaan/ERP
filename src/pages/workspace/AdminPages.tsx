import React, { useState } from 'react';
import { apiDownload, apiRequest, errorMessage } from '../../api/client';
import type { ListResponse, Row } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { AsyncView, useApiData } from '../../components/common/Async';
import {
  Card,
  DataGrid,
  Field,
  Modal,
  PageHeader,
  PillBadge,
  StatePanel,
  formatCell,
  inputClass,
  toneForStatus,
} from '../../components/common/Ui';
import { ResourcePage } from './WorkspacePages';

function PermissionPicker({
  available,
  selected,
  onChange,
}: {
  available: string[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="max-h-56 overflow-y-auto rounded-[16px] bg-[#F7F6FC] p-3">
      <div className="grid gap-1.5 sm:grid-cols-2">
        {available.map((permission) => (
          <label key={permission} className="flex items-center gap-2 text-[11px] text-[#4B4A60]">
            <input
              type="checkbox"
              checked={selected.includes(permission)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, permission]
                    : selected.filter((item) => item !== permission),
                )
              }
              className="h-3.5 w-3.5 rounded border-[#D9D4E9] accent-[#5F57C4]"
            />
            {permission}
          </label>
        ))}
      </div>
    </div>
  );
}

function UsersAdmin({ module }: { module: string }) {
  const auth = useAuth();
  const state = useApiData(() => apiRequest<Row[]>(`/api/workspace/${module}/admin/users`), [module]);
  const available = [...(auth.workspace?.permissions ?? [])].sort();
  const [invite, setInvite] = useState({ email: '', fullName: '', role: 'operator', permissions: [] as string[] });
  const [editing, setEditing] = useState<Row | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const result = await apiRequest<{ inviteToken?: string }>(`/api/workspace/${module}/admin/users`, {
        method: 'POST',
        body: invite,
      });
      setMessage(result.inviteToken ? `Invite token: ${result.inviteToken}` : 'Sub-admin invited.');
      setInvite({ email: '', fullName: '', role: 'operator', permissions: [] });
      state.reload();
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }

  async function savePermissions() {
    if (!editing) return;
    setMessage(null);
    try {
      await apiRequest(`/api/workspace/${module}/admin/users/${String(editing.id)}/permissions`, {
        method: 'PATCH',
        body: { permissions: editingPermissions },
      });
      setEditing(null);
      state.reload();
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }

  async function setStatus(row: Row, status: string) {
    setMessage(null);
    try {
      await apiRequest(`/api/workspace/${module}/admin/users/${String(row.id)}/status`, {
        method: 'PATCH',
        body: { status },
      });
      state.reload();
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }

  return (
    <div className="space-y-4">
      {message ? <div role="status" className="break-all rounded-[16px] bg-[#F2F0FB] p-3 text-xs text-[#4B4A60]">{message}</div> : null}
      <AsyncView state={state}>
        {(rows) => (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-medium">Workspace users</h2>
              <span className="text-[11px] text-[#9A99AA]">{rows.length} members</span>
            </div>
            <DataGrid
              rows={rows}
              columns={[
                { key: 'full_name', header: 'Name' },
                { key: 'email', header: 'Email' },
                { key: 'role', header: 'Role' },
                { key: 'user_status', header: 'Status', render: (row) => <PillBadge tone={toneForStatus(row.user_status)}>{formatCell(row.user_status)}</PillBadge> },
                { key: 'permissions', header: 'Permissions', render: (row) => `${(row.permissions as string[] | undefined)?.length ?? 0} grants` },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (row) => (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setEditing(row); setEditingPermissions((row.permissions as string[]) ?? []); }} className="text-xs font-medium text-[#5F57C4] hover:underline">Edit grants</button>
                      <button type="button" onClick={() => void setStatus(row, 'suspended')} className="text-xs text-[#6B6A85] hover:underline">Suspend</button>
                      <button type="button" onClick={() => void setStatus(row, 'active')} className="text-xs text-[#6B6A85] hover:underline">Activate</button>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        )}
      </AsyncView>
      <Card>
        <h2 className="mb-4 font-display text-base font-medium">Invite a sub-admin</h2>
        <p className="mb-4 text-xs text-[#6B6A85]">
          You can only grant permissions you hold yourself. Nothing is selected by default.
        </p>
        <form onSubmit={(event) => void submitInvite(event)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Full name" htmlFor="subadmin-name"><input id="subadmin-name" className={inputClass} value={invite.fullName} onChange={(event) => setInvite({ ...invite, fullName: event.target.value })} required /></Field>
            <Field label="Email" htmlFor="subadmin-email"><input id="subadmin-email" type="email" className={inputClass} value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} required /></Field>
            <Field label="Role" htmlFor="subadmin-role">
              <select id="subadmin-role" className={inputClass} value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}>
                {['viewer', 'operator', 'manager', 'module_admin', 'client_admin'].map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Permissions" hint={`${invite.permissions.length} selected`}>
            <PermissionPicker available={available} selected={invite.permissions} onChange={(permissions) => setInvite({ ...invite, permissions })} />
          </Field>
          <button type="submit" className="h-10 rounded-full bg-[#0E0E12] px-5 text-xs font-medium text-white hover:bg-[#1C1C24]">Send invite</button>
        </form>
      </Card>
      <Modal open={editing !== null} title="Edit permissions" onClose={() => setEditing(null)} wide>
        <div className="space-y-4">
          <p className="text-xs text-[#6B6A85]">Editing {formatCell(editing?.email)} · {editingPermissions.length} selected</p>
          <PermissionPicker available={available} selected={editingPermissions} onChange={setEditingPermissions} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="h-10 rounded-full px-4 text-xs font-medium text-[#6B6A85] hover:bg-[#F5F3FB]">Cancel</button>
            <button type="button" onClick={() => void savePermissions()} className="h-10 rounded-full bg-[#0E0E12] px-5 text-xs font-medium text-white hover:bg-[#1C1C24]">Save grants</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function RolesAdmin({ module }: { module: string }) {
  const auth = useAuth();
  const state = useApiData(() => apiRequest<Row[]>(`/api/workspace/${module}/admin/roles`), [module]);
  const available = [...(auth.workspace?.permissions ?? [])].sort();
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await apiRequest(`/api/workspace/${module}/admin/roles`, { method: 'POST', body: { name, permissions } });
      setName('');
      setPermissions([]);
      state.reload();
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }

  return (
    <div className="space-y-4">
      <AsyncView state={state}>
        {(rows) => (
          <Card>
            <h2 className="mb-4 font-display text-base font-medium">Roles</h2>
            <DataGrid
              rows={rows}
              columns={[
                { key: 'name', header: 'Role' },
                { key: 'permissions_json', header: 'Grants', render: (row) => {
                  const value = row.permissions_json;
                  const items = Array.isArray(value) ? value : typeof value === 'string' ? (() => { try { return JSON.parse(value) as string[]; } catch { return []; } })() : [];
                  return `${items.length} permissions`;
                } },
                { key: 'created_at', header: 'Created', render: (row) => formatCell(row.created_at) },
              ]}
            />
          </Card>
        )}
      </AsyncView>
      <Card>
        <h2 className="mb-4 font-display text-base font-medium">Create a role</h2>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <Field label="Role name" htmlFor="role-name"><input id="role-name" className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label="Permissions" hint="Only permissions you currently hold are available."><PermissionPicker available={available} selected={permissions} onChange={setPermissions} /></Field>
          {message ? <p role="alert" className="text-xs text-[#C93B40]">{message}</p> : null}
          <button type="submit" className="h-10 rounded-full bg-[#0E0E12] px-5 text-xs font-medium text-white hover:bg-[#1C1C24]">Create role</button>
        </form>
      </Card>
    </div>
  );
}

function CompanyAdmin({ module }: { module: string }) {
  const state = useApiData(() => apiRequest<Row>(`/api/workspace/${module}/company`), [module]);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const parsed = JSON.parse(text) as Row;
      await apiRequest(`/api/workspace/${module}/company`, { method: 'PATCH', body: parsed });
      setMessage('Company profile saved.');
      state.reload();
      setLoaded(false);
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }

  return (
    <AsyncView state={state}>
      {(company) => {
        if (!loaded) {
          setText(JSON.stringify(company, null, 2));
          setLoaded(true);
        }
        return (
          <Card className="max-w-3xl">
            <h2 className="mb-4 font-display text-base font-medium">Company profile</h2>
            <form onSubmit={(event) => void save(event)} className="space-y-3">
              <Field label="Company settings (JSON)" htmlFor="company-json">
                <textarea id="company-json" rows={14} className={`${inputClass} h-auto py-3 font-mono text-[11px]`} value={text} onChange={(event) => setText(event.target.value)} />
              </Field>
              {message ? <p role="status" className="text-xs text-[#4B4A60]">{message}</p> : null}
              <button type="submit" className="h-10 rounded-full bg-[#0E0E12] px-5 text-xs font-medium text-white hover:bg-[#1C1C24]">Save company</button>
            </form>
          </Card>
        );
      }}
    </AsyncView>
  );
}

function AuditAdmin({ module }: { module: string }) {
  const state = useApiData(() => apiRequest<ListResponse<Row>>(`/api/workspace/${module}/admin/audit`, { query: { per_page: 100 } }), [module]);
  return (
    <AsyncView state={state}>
      {(result) => (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-medium">Workspace audit</h2>
            <button
              type="button"
              onClick={() => void apiDownload(`/api/workspace/${module}/admin/audit/export`, `${module}-audit.csv`)}
              className="h-9 rounded-full bg-[#F7F6FC] px-4 text-xs font-medium hover:bg-[#F0EEFC]"
            >
              Export CSV
            </button>
          </div>
          <DataGrid
            rows={result.data}
            columns={[
              { key: 'created_at', header: 'When', render: (row) => formatCell(row.created_at) },
              { key: 'action', header: 'Action' },
              { key: 'entity', header: 'Entity' },
              { key: 'actor_type', header: 'Actor' },
              { key: 'platform_override', header: 'Override', render: (row) => (row.platform_override ? 'Yes' : 'No') },
              { key: 'reason', header: 'Reason' },
            ]}
          />
        </Card>
      )}
    </AsyncView>
  );
}

export function WorkspaceAdminPage({ module, section }: { module: string; section: string }) {
  const auth = useAuth();
  const labels: Record<string, { title: string; permission: string }> = {
    users: { title: 'Users & permissions', permission: 'administration.users.manage' },
    roles: { title: 'Roles & permissions', permission: 'administration.roles.manage' },
    company: { title: 'Company profile', permission: 'administration.company.manage' },
    branches: { title: 'Branches & warehouses', permission: 'administration.branches.manage' },
    tax: { title: 'Tax settings', permission: 'administration.tax.manage' },
    audit: { title: 'Audit log', permission: 'administration.audit.view' },
  };
  const config = labels[section];
  if (!config) return <StatePanel title="Unknown admin section" />;
  if (!auth.can(config.permission)) {
    return <StatePanel kind="denied" title="Permission denied" message={`${config.permission} is required for this screen.`} />;
  }

  let content: React.ReactNode;
  if (section === 'users') content = <UsersAdmin module={module} />;
  else if (section === 'roles') content = <RolesAdmin module={module} />;
  else if (section === 'company') content = <CompanyAdmin module={module} />;
  else if (section === 'branches') {
    content = <ResourcePage module={module} resource="branches" title="Branches & warehouses" basePath={`/api/workspace/${module}/admin/branches`} />;
  } else if (section === 'tax') {
    content = <ResourcePage module={module} resource="tax-codes" title="Tax settings" basePath={`/api/workspace/${module}/admin/tax-codes`} />;
  } else content = <AuditAdmin module={module} />;

  return (
    <>
      <PageHeader eyebrow={`${module} · administration`} title={config.title} />
      {content}
    </>
  );
}

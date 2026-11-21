import React, { useState } from 'react';
import {
  Settings,
  Building,
  MapPin,
  Shield,
  Calendar,
  History,
  Save,
  Plus,
  Eye,
  Check,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { Table, Column } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select, FormField } from '../components/ui/FormField';
import { mockOrganization, mockHolidays } from '../data/mockData';
import { AuditLogEntry, Department, Location } from '../types';
import { formatDate } from '../lib/utils';

export const SettingsPage: React.FC = () => {
  const {
    departments,
    locations,
    auditLogs,
    addToast,
    role,
  } = useApp();

  const [activeTab, setActiveTab] = useState('org');
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogEntry | null>(null);

  // Org form state
  const [orgForm, setOrgForm] = useState(mockOrganization);

  const handleSaveOrg = (e: React.FormEvent) => {
    e.preventDefault();
    addToast('success', 'Settings Saved', 'Organization profile updated across the ERP.');
  };

  const tabs = [
    { id: 'org', label: 'Company Profile' },
    { id: 'departments', label: 'Departments & Offices' },
    { id: 'permissions', label: 'Roles & Permissions Matrix' },
    { id: 'holidays', label: 'Public Holidays' },
    { id: 'audit', label: 'System Audit Log', count: auditLogs.length },
  ];

  const auditCols: Column<AuditLogEntry>[] = [
    { key: 'timestamp', header: 'Timestamp', render: (l) => <span className="tabular-nums font-mono text-[11px]">{l.timestamp}</span> },
    {
      key: 'actor_name',
      header: 'Actor',
      render: (l) => (
        <div>
          <span className="font-semibold text-[#1F1A2E]">{l.actor_name}</span>
          <div className="text-[10px] text-[#6B647F]">{l.actor_email}</div>
        </div>
      ),
    },
    { key: 'action', header: 'Action Event', render: (l) => <span className="font-medium text-[#6D28D9]">{l.action}</span> },
    { key: 'entity', header: 'Target Entity' },
    { key: 'ip', header: 'IP Address', render: (l) => <span className="font-mono text-xs text-[#928BA6]">{l.ip}</span> },
    {
      key: 'details',
      header: 'Audit Diff',
      align: 'right',
      render: (l) => (
        <Button
          variant="secondary"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setSelectedAuditLog(l)}
        >
          View Diff
        </Button>
      ),
    },
  ];

  // RBAC Matrix Definitions
  const rbacCapabilities = [
    { name: 'Organization Settings & Policies', superAdmin: true, hrAdmin: false, manager: false, employee: false },
    { name: 'Full Employee Records (Add / Edit / Delete)', superAdmin: true, hrAdmin: true, manager: false, employee: false },
    { name: 'View Team Profiles', superAdmin: true, hrAdmin: true, manager: true, employee: true },
    { name: 'Attendance Logging & Corrections', superAdmin: true, hrAdmin: true, manager: true, employee: true },
    { name: 'Leave Approval & Quotas', superAdmin: true, hrAdmin: true, manager: true, employee: false },
    { name: 'Payroll Run Execution & Disbursement', superAdmin: true, hrAdmin: true, manager: false, employee: false },
    { name: 'Candidate Pipeline & Requisitions', superAdmin: true, hrAdmin: true, manager: true, employee: false },
    { name: 'Performance Goals & Appraisals', superAdmin: true, hrAdmin: true, manager: true, employee: true },
    { name: 'Executive BI Reports & Export', superAdmin: true, hrAdmin: true, manager: true, employee: false },
    { name: 'Immutable Audit Trail Inspection', superAdmin: true, hrAdmin: true, manager: false, employee: false },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1A2E]">System Settings</h1>
          <p className="text-xs text-[#6B647F] mt-0.5">
            Company metadata, department routing, role permissions, and immutable audit trails.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Organization Profile Form */}
      {activeTab === 'org' && (
        <Card className="p-6">
          <form onSubmit={handleSaveOrg} className="space-y-5 max-w-2xl">
            <h3 className="text-sm font-bold text-[#1F1A2E]">Legal Entity & Regional Parameters</h3>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Brand / Trading Name" required>
                <Input
                  value={orgForm.name}
                  onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                />
              </FormField>
              <FormField label="Registered Legal Name" required>
                <Input
                  value={orgForm.legalName}
                  onChange={(e) => setOrgForm({ ...orgForm, legalName: e.target.value })}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Federal NTN / Tax ID">
                <Input
                  value={orgForm.taxId}
                  onChange={(e) => setOrgForm({ ...orgForm, taxId: e.target.value })}
                />
              </FormField>
              <FormField label="Official Headquarters Address">
                <Input
                  value={orgForm.headquarters}
                  onChange={(e) => setOrgForm({ ...orgForm, headquarters: e.target.value })}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField label="Base Currency">
                <Input
                  value={orgForm.currency}
                  onChange={(e) => setOrgForm({ ...orgForm, currency: e.target.value })}
                />
              </FormField>
              <FormField label="Primary Timezone">
                <Input
                  value={orgForm.timezone}
                  onChange={(e) => setOrgForm({ ...orgForm, timezone: e.target.value })}
                />
              </FormField>
              <FormField label="Work Week Schedule">
                <Input
                  value={orgForm.workWeek}
                  onChange={(e) => setOrgForm({ ...orgForm, workWeek: e.target.value })}
                />
              </FormField>
            </div>

            <div className="pt-4 border-t border-[#ECE8F4]">
              <Button type="submit" variant="primary" leftIcon={<Save className="w-4 h-4" />}>
                Save Organization Settings
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tab 2: Departments & Offices */}
      {activeTab === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Departments */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#ECE8F4]">
              <CardTitle>Registered Departments</CardTitle>
              <span className="text-xs text-[#6B647F]">{departments.length} active</span>
            </div>
            <div className="divide-y divide-[#F7F5FB]">
              {departments.map((d) => (
                <div key={d.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-[#1F1A2E]">{d.name}</span>
                    <div className="text-[10px] text-[#6B647F]">Code: {d.code} · Head: {d.head_name}</div>
                  </div>
                  <span className="font-mono text-[11px] text-[#6D28D9] bg-[#F7F4FF] px-2 py-0.5 rounded border border-[#E0D6FD]">
                    {d.employee_count} members
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Locations */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#ECE8F4]">
              <CardTitle>Physical Hubs & Campuses</CardTitle>
              <span className="text-xs text-[#6B647F]">{locations.length} offices</span>
            </div>
            <div className="divide-y divide-[#F7F5FB]">
              {locations.map((l) => (
                <div key={l.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-[#1F1A2E]">{l.name}</span>
                    <div className="text-[10px] text-[#6B647F]">{l.address}</div>
                  </div>
                  {l.is_headquarters ? (
                    <Badge variant="purple" size="sm">
                      Headquarters
                    </Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">
                      Regional
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Roles & Permissions RBAC Matrix */}
      {activeTab === 'permissions' && (
        <Card className="p-6">
          <div className="pb-4 border-b border-[#ECE8F4]">
            <h3 className="text-sm font-bold text-[#1F1A2E]">Role-Based Access Control (RBAC) Matrix</h3>
            <p className="text-xs text-[#6B647F]">
              Permissions enforced across Super Admin, HR Admin, Team Manager, and Individual Employee roles.
            </p>
          </div>

          <div className="overflow-x-auto pt-4">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F7F4FF] border-b border-[#ECE8F4] text-[#6B647F]">
                  <th className="p-3">Capability / Resource</th>
                  <th className="p-3 text-center">Super Admin</th>
                  <th className="p-3 text-center">HR Admin</th>
                  <th className="p-3 text-center">Manager</th>
                  <th className="p-3 text-center">Employee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECE8F4]">
                {rbacCapabilities.map((cap) => (
                  <tr key={cap.name} className="hover:bg-[#FCFBFF]">
                    <td className="p-3 font-medium text-[#1F1A2E]">{cap.name}</td>
                    <td className="p-3 text-center">
                      <Check className="w-4 h-4 text-[#15803D] mx-auto" />
                    </td>
                    <td className="p-3 text-center">
                      {cap.hrAdmin ? (
                        <Check className="w-4 h-4 text-[#15803D] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-[#DCD5EA] mx-auto" />
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {cap.manager ? (
                        <Check className="w-4 h-4 text-[#15803D] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-[#DCD5EA] mx-auto" />
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {cap.employee ? (
                        <Check className="w-4 h-4 text-[#15803D] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-[#DCD5EA] mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 4: Public Holidays */}
      {activeTab === 'holidays' && (
        <Card className="p-6">
          <div className="pb-4 border-b border-[#ECE8F4] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#1F1A2E]">Official Pakistan Calendar 2026</h3>
              <p className="text-xs text-[#6B647F]">Statutory gazetted days and public holidays</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#ECFDF3] text-[#15803D] border border-[#BBF7D0]">
              8 Gazetted Holidays
            </span>
          </div>

          <div className="divide-y divide-[#F7F5FB] pt-2">
            {mockHolidays.map((h) => (
              <div key={h.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-[#1F1A2E]">{h.name}</span>
                  <div className="text-[11px] text-[#6B647F]">{h.type}</div>
                </div>
                <div className="text-right">
                  <span className="font-bold text-[#6D28D9] tabular-nums">{formatDate(h.date)}</span>
                  <div className="text-[10px] text-[#928BA6]">{h.days} business day off</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab 5: Audit Log */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <Table columns={auditCols} data={auditLogs} keyExtractor={(l) => l.id} />
        </div>
      )}

      {/* Audit Diff Modal */}
      <Modal
        isOpen={!!selectedAuditLog}
        onClose={() => setSelectedAuditLog(null)}
        title="Audit Event Details"
        description={`${selectedAuditLog?.action} on ${selectedAuditLog?.timestamp}`}
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setSelectedAuditLog(null)}>
            Close
          </Button>
        }
      >
        {selectedAuditLog && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-2 text-[#6B647F]">
              <div>Actor: <strong className="text-[#1F1A2E]">{selectedAuditLog.actor_name}</strong></div>
              <div>IP: <strong className="font-mono text-[#1F1A2E]">{selectedAuditLog.ip}</strong></div>
              <div>Target: <strong className="text-[#1F1A2E]">{selectedAuditLog.entity}</strong></div>
              <div>Entity ID: <strong className="font-mono text-[#1F1A2E]">{selectedAuditLog.entity_id}</strong></div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#ECE8F4]">
              {selectedAuditLog.details?.before && (
                <div className="p-3 bg-[#FEF2F2] rounded-[10px] border border-[#FECACA] text-[#B91C1C]">
                  <span className="font-bold block text-[10px] uppercase">Before State:</span>
                  <p className="mt-0.5">{selectedAuditLog.details.before}</p>
                </div>
              )}
              {selectedAuditLog.details?.after && (
                <div className="p-3 bg-[#ECFDF3] rounded-[10px] border border-[#BBF7D0] text-[#15803D]">
                  <span className="font-bold block text-[10px] uppercase">After State:</span>
                  <p className="mt-0.5">{selectedAuditLog.details.after}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

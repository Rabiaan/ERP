import React, { useState } from 'react';
import {
  FileBox,
  FileText,
  Laptop,
  Megaphone,
  Plus,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pin,
  Eye,
  User,
  Shield,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { Table, Column } from '../components/ui/Table';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select, Textarea, FormField } from '../components/ui/FormField';
import { formatDate } from '../lib/utils';
import { DocumentItem, Asset, Announcement } from '../types';

export const WorkplacePage: React.FC = () => {
  const {
    documents,
    assets,
    announcements,
    employees,
    uploadDocument,
    assignAsset,
    returnAsset,
    createAnnouncement,
    addToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'documents' | 'assets' | 'announcements'>('documents');

  // Document upload drawer
  const [isDocDrawerOpen, setIsDocDrawerOpen] = useState(false);
  const [docForm, setDocForm] = useState({
    employee_id: employees[0]?.id || 'emp-001',
    type: 'Contract' as const,
    name: '',
    file_size: '1.8 MB',
    expires_at: '',
    status: 'Valid' as const,
  });

  // Announcement modal
  const [isAnnModalOpen, setIsAnnModalOpen] = useState(false);
  const [annForm, setAnnForm] = useState({
    title: '',
    body: '',
    audience: 'All Employees',
    pinned: false,
  });

  // Asset assign modal
  const [selectedAssetForAssign, setSelectedAssetForAssign] = useState<Asset | null>(null);
  const [assigneeId, setAssigneeId] = useState(employees[0]?.id || 'emp-001');

  const expiringDocs = documents.filter((d) => d.status === 'Expiring soon' || d.status === 'Expired');

  const handleDocSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.name.trim()) return;
    const emp = employees.find((e) => e.id === docForm.employee_id);
    uploadDocument({
      ...docForm,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : 'Staff Member',
      uploaded_by: 'Ayesha Khan (HR Admin)',
    });
    setIsDocDrawerOpen(false);
    setDocForm({
      employee_id: employees[0]?.id || 'emp-001',
      type: 'Contract',
      name: '',
      file_size: '1.8 MB',
      expires_at: '',
      status: 'Valid',
    });
  };

  const handleAnnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!annForm.title.trim() || !annForm.body.trim()) return;
    createAnnouncement({
      title: annForm.title,
      body: annForm.body,
      audience: annForm.audience,
      author_name: 'Tariq Mansoor',
      author_role: 'CEO',
      pinned: annForm.pinned,
    });
    setIsAnnModalOpen(false);
    setAnnForm({
      title: '',
      body: '',
      audience: 'All Employees',
      pinned: false,
    });
  };

  const handleAssignAssetSubmit = () => {
    if (!selectedAssetForAssign) return;
    const targetEmp = employees.find((e) => e.id === assigneeId);
    if (!targetEmp) return;
    assignAsset(
      selectedAssetForAssign.id,
      targetEmp.id,
      `${targetEmp.first_name} ${targetEmp.last_name}`
    );
    setSelectedAssetForAssign(null);
  };

  const docCols: Column<DocumentItem>[] = [
    {
      key: 'name',
      header: 'File Name',
      render: (d) => (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#6D28D9] shrink-0" />
          <span className="font-semibold text-[#1F1A2E]">{d.name}</span>
        </div>
      ),
    },
    { key: 'employee_name', header: 'Staff Member' },
    { key: 'type', header: 'Document Category' },
    { key: 'file_size', header: 'File Size' },
    {
      key: 'expires_at',
      header: 'Validity / Expiry',
      render: (d) => (d.expires_at ? formatDate(d.expires_at) : 'Perpetual'),
    },
    { key: 'status', header: 'Status', render: (d) => <Badge variant={d.status} size="sm" /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: () => (
        <Button
          variant="secondary"
          size="sm"
          className="h-7 text-xs"
          onClick={() => addToast('info', 'Download Started', 'Encrypted file streamed from storage.')}
        >
          Download
        </Button>
      ),
    },
  ];

  const assetCols: Column<Asset>[] = [
    {
      key: 'tag',
      header: 'Asset Tag',
      render: (a) => <span className="font-mono text-xs font-semibold text-[#6D28D9]">{a.tag}</span>,
    },
    { key: 'type', header: 'Type' },
    { key: 'model', header: 'Make & Model' },
    { key: 'serial', header: 'Serial No', render: (a) => <span className="font-mono text-xs text-[#6B647F]">{a.serial}</span> },
    {
      key: 'assigned_to_name',
      header: 'Assigned User',
      render: (a) =>
        a.assigned_to_name ? (
          <span className="font-medium text-[#1F1A2E]">{a.assigned_to_name}</span>
        ) : (
          <span className="text-xs text-[#928BA6] italic">In IT Storage</span>
        ),
    },
    { key: 'condition', header: 'Condition' },
    { key: 'status', header: 'Status', render: (a) => <Badge variant={a.status} size="sm" /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (a) => (
        <div className="flex items-center justify-end gap-1.5">
          {a.status === 'Assigned' ? (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => returnAsset(a.id)}
            >
              Return
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedAssetForAssign(a)}
            >
              Assign
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1A2E]">Workplace & Operations</h1>
          <p className="text-xs text-[#6B647F] mt-0.5">
            Legal contracts, hardware inventory, and company-wide bulletin boards.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {activeTab === 'documents' && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIsDocDrawerOpen(true)}
            >
              Upload Document
            </Button>
          )}
          {activeTab === 'announcements' && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Megaphone className="w-4 h-4" />}
              onClick={() => setIsAnnModalOpen(true)}
            >
              Post Announcement
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'documents', label: 'Company & Employee Documents', count: documents.length },
          { id: 'assets', label: 'Hardware & IT Assets', count: assets.length },
          { id: 'announcements', label: 'Bulletin & Announcements', count: announcements.length },
        ]}
        activeTab={activeTab}
        onChange={(t) => setActiveTab(t as any)}
      />

      {/* Tab 1: Documents */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          {/* Expiry Warning Strip */}
          {expiringDocs.length > 0 && (
            <div className="p-4 bg-[#FFFBEB] rounded-[14px] border border-[#FDE68A] flex items-center justify-between text-xs text-[#B45309]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Document Expiry Notice:</strong> {expiringDocs.length} employee documents require renewal (passports/visas).
                </span>
              </div>
              <span className="font-semibold underline cursor-pointer">Review renewals</span>
            </div>
          )}

          <Table columns={docCols} data={documents} keyExtractor={(d) => d.id} />
        </div>
      )}

      {/* Tab 2: Assets */}
      {activeTab === 'assets' && (
        <div className="space-y-4">
          <Table columns={assetCols} data={assets} keyExtractor={(a) => a.id} />
        </div>
      )}

      {/* Tab 3: Announcements */}
      {activeTab === 'announcements' && (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <Card key={ann.id} className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {ann.pinned && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-[#6D28D9] bg-[#F7F4FF] px-2 py-0.5 rounded-full border border-[#E0D6FD]">
                      <Pin className="w-3 h-3" /> Pinned
                    </span>
                  )}
                  <h3 className="text-sm font-bold text-[#1F1A2E]">{ann.title}</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#F7F5FB] text-[#6B647F] border border-[#ECE8F4]">
                  Audience: {ann.audience}
                </span>
              </div>

              <p className="text-xs text-[#6B647F] leading-relaxed">{ann.body}</p>

              <div className="pt-3 border-t border-[#ECE8F4] flex items-center justify-between text-xs text-[#928BA6]">
                <div className="flex items-center gap-2">
                  <span>Posted by <strong className="text-[#1F1A2E]">{ann.author_name}</strong> ({ann.author_role})</span>
                  <span>·</span>
                  <span>{ann.published_at}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                  <Eye className="w-3.5 h-3.5" />
                  <span>{ann.read_count} team views</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Document Drawer */}
      <Drawer
        isOpen={isDocDrawerOpen}
        onClose={() => setIsDocDrawerOpen(false)}
        title="Upload Employee Document"
        description="Attach verified credentials, government IDs, or NDAs."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsDocDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleDocSubmit}>
              Upload Document
            </Button>
          </>
        }
      >
        <form onSubmit={handleDocSubmit} className="space-y-4">
          <FormField label="Staff Member" required>
            <Select
              value={docForm.employee_id}
              onChange={(e) => setDocForm({ ...docForm, employee_id: e.target.value })}
            >
              {employees.slice(0, 20).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name} ({e.title})
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Document Type">
            <Select
              value={docForm.type}
              onChange={(e) => setDocForm({ ...docForm, type: e.target.value as any })}
            >
              <option value="Contract">Contract</option>
              <option value="Passport">Passport</option>
              <option value="Tax ID">Tax ID</option>
              <option value="Degree">Degree</option>
              <option value="NDA">NDA</option>
              <option value="Medical Cert">Medical Cert</option>
            </Select>
          </FormField>

          <FormField label="File Display Name" required>
            <Input
              value={docForm.name}
              onChange={(e) => setDocForm({ ...docForm, name: e.target.value })}
              placeholder="e.g. FBR_NTN_Certificate_2026.pdf"
            />
          </FormField>

          <FormField label="Expiry Date (if applicable)">
            <Input
              type="date"
              value={docForm.expires_at}
              onChange={(e) => setDocForm({ ...docForm, expires_at: e.target.value })}
            />
          </FormField>
        </form>
      </Drawer>

      {/* Post Announcement Modal */}
      <Modal
        isOpen={isAnnModalOpen}
        onClose={() => setIsAnnModalOpen(false)}
        title="Publish Company Announcement"
        description="Broadcast updates across Northwind Studios offices and slack channels."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAnnModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAnnSubmit}>
              Post Bulletin
            </Button>
          </>
        }
      >
        <form onSubmit={handleAnnSubmit} className="space-y-4">
          <FormField label="Announcement Title" required>
            <Input
              value={annForm.title}
              onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
              placeholder="e.g. Office Winter Timings Update"
            />
          </FormField>

          <FormField label="Target Audience">
            <Select
              value={annForm.audience}
              onChange={(e) => setAnnForm({ ...annForm, audience: e.target.value })}
            >
              <option value="All Employees">All Employees</option>
              <option value="Engineering">Engineering Team</option>
              <option value="Lahore Office">Lahore HQ Only</option>
              <option value="Management">Management & Leads</option>
            </Select>
          </FormField>

          <FormField label="Message Body" required>
            <Textarea
              value={annForm.body}
              onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })}
              placeholder="Detailed communication..."
            />
          </FormField>
        </form>
      </Modal>

      {/* Assign Asset Modal */}
      <Modal
        isOpen={!!selectedAssetForAssign}
        onClose={() => setSelectedAssetForAssign(null)}
        title="Assign Hardware Asset"
        description={`Allocate ${selectedAssetForAssign?.model} (${selectedAssetForAssign?.tag}) to an employee.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedAssetForAssign(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAssignAssetSubmit}>
              Confirm Allocation
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Select Employee">
            <Select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              {employees.slice(0, 25).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name} ({e.title})
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Modal>
    </div>
  );
};

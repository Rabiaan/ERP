import React, { useState } from 'react';
import {
  CalendarCheck,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  FileText,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Tabs } from '../components/ui/Tabs';
import { Table, Column } from '../components/ui/Table';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select, Textarea, FormField } from '../components/ui/FormField';
import { formatDate } from '../lib/utils';
import { LeaveRequest } from '../types';

export const LeavePage: React.FC = () => {
  const {
    leaveRequests,
    leaveBalances,
    employees,
    approveLeaveRequest,
    rejectLeaveRequest,
    requestLeave,
    role,
  } = useApp();

  const [activeTab, setActiveTab] = useState('requests');

  // Request Drawer
  const [isRequestDrawerOpen, setIsRequestDrawerOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({
    employee_id: employees[0]?.id || 'emp-001',
    leave_type_id: 'annual',
    start_date: '2026-11-05',
    end_date: '2026-11-07',
    days: 3,
    reason: '',
  });
  const [requestError, setRequestError] = useState('');

  // Decision Modal
  const [selectedReqForDecision, setSelectedReqForDecision] = useState<LeaveRequest | null>(null);
  const [decisionType, setDecisionType] = useState<'approve' | 'reject'>('approve');
  const [decisionComment, setDecisionComment] = useState('');

  const handleOpenDecision = (req: LeaveRequest, type: 'approve' | 'reject') => {
    setSelectedReqForDecision(req);
    setDecisionType(type);
    setDecisionComment('');
  };

  const handleConfirmDecision = () => {
    if (!selectedReqForDecision) return;
    if (decisionType === 'approve') {
      approveLeaveRequest(selectedReqForDecision.id, decisionComment);
    } else {
      rejectLeaveRequest(selectedReqForDecision.id, decisionComment);
    }
    setSelectedReqForDecision(null);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestForm.reason.trim()) {
      setRequestError('Please provide a brief justification.');
      return;
    }
    requestLeave(requestForm);
    setIsRequestDrawerOpen(false);
    setRequestForm({
      employee_id: employees[0]?.id || 'emp-001',
      leave_type_id: 'annual',
      start_date: '2026-11-05',
      end_date: '2026-11-07',
      days: 3,
      reason: '',
    });
    setRequestError('');
  };

  const tabs = [
    { id: 'requests', label: 'All Requests', count: leaveRequests.length },
    { id: 'calendar', label: 'Team Calendar' },
    { id: 'policies', label: 'Leave Policies' },
  ];

  const columns: Column<LeaveRequest>[] = [
    {
      key: 'employee_name',
      header: 'Employee',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.employee_name} src={r.avatar_url} size="sm" />
          <div>
            <div className="font-semibold text-[#1F1A2E]">{r.employee_name}</div>
            <div className="text-[10px] text-[#6B647F]">{r.department}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'leave_type_name',
      header: 'Category',
      render: (r) => <span className="font-medium text-[#1F1A2E]">{r.leave_type_name}</span>,
    },
    {
      key: 'dates',
      header: 'Requested Window',
      render: (r) => (
        <span className="text-xs text-[#1F1A2E] tabular-nums">
          {formatDate(r.start_date)} – {formatDate(r.end_date)}
        </span>
      ),
    },
    {
      key: 'days',
      header: 'Days',
      render: (r) => <span className="font-bold tabular-nums">{r.days} d</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r) => <span className="text-xs text-[#6B647F] max-w-xs truncate block">{r.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={r.status} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          {r.status === 'Pending' ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs text-[#B91C1C] border-[#FECACA] hover:bg-[#FEF2F2]"
                onClick={() => handleOpenDecision(r, 'reject')}
              >
                Reject
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => handleOpenDecision(r, 'approve')}
              >
                Approve
              </Button>
            </>
          ) : (
            <span className="text-[11px] text-[#928BA6]">
              {r.approver_name ? `By ${r.approver_name}` : 'Completed'}
            </span>
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
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1A2E]">Leave & Time Off</h1>
          <p className="text-xs text-[#6B647F] mt-0.5">
            Annual quotas, pending requests, and studio holiday schedule.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsRequestDrawerOpen(true)}
          >
            Request Leave
          </Button>
        </div>
      </div>

      {/* Balance Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {leaveBalances.map((bal) => (
          <Card key={bal.type_id} className="p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#6B647F] uppercase tracking-wider">
                {bal.name}
              </span>
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: bal.color }}
              />
            </div>
            <div className="my-3 flex items-baseline justify-between">
              <div className="text-3xl font-bold text-[#1F1A2E] tabular-nums">
                {bal.remaining}{' '}
                <span className="text-xs font-normal text-[#928BA6]">/ {bal.total_quota} days</span>
              </div>
              <Badge variant={bal.remaining > 5 ? 'active' : 'probation'} size="sm">
                {bal.remaining} left
              </Badge>
            </div>
            <div className="space-y-1.5 text-xs text-[#6B647F]">
              <div className="flex justify-between text-[11px]">
                <span>Used: {bal.used} d</span>
                <span>Pending: {bal.pending} d</span>
              </div>
              <div className="h-1.5 w-full bg-[#F7F5FB] rounded-full overflow-hidden">
                <div
                  style={{
                    width: `${Math.min(100, (bal.used / bal.total_quota) * 100)}%`,
                    backgroundColor: bal.color,
                  }}
                  className="h-full rounded-full"
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Panels */}
      {activeTab === 'requests' && (
        <Table
          columns={columns}
          data={leaveRequests}
          keyExtractor={(r) => r.id}
          emptyState={
            <div className="p-8 text-center text-xs text-[#928BA6]">
              No leave requests currently logged.
            </div>
          }
        />
      )}

      {activeTab === 'calendar' && (
        <Card className="p-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#ECE8F4]">
            <div>
              <h3 className="text-sm font-semibold text-[#1F1A2E]">Team Leave Calendar (November 2026)</h3>
              <p className="text-xs text-[#6B647F]">Scheduled out-of-office team members</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6D28D9] font-medium bg-[#F7F4FF] px-2.5 py-1 rounded-full border border-[#E0D6FD]">
                Pakistan Public Holiday: Nov 09 (Iqbal Day)
              </span>
            </div>
          </div>

          <div className="pt-4 space-y-3">
            {leaveRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-3.5 rounded-[12px] bg-[#FCFBFF] border border-[#ECE8F4]"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={req.employee_name} src={req.avatar_url} size="sm" />
                  <div>
                    <div className="text-xs font-semibold text-[#1F1A2E]">
                      {req.employee_name} ({req.department})
                    </div>
                    <div className="text-[11px] text-[#6B647F]">
                      {req.leave_type_name} · {req.reason}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-[#1F1A2E] tabular-nums">
                    {formatDate(req.start_date)} – {formatDate(req.end_date)}
                  </span>
                  <div className="text-[10px] text-[#6D28D9] font-medium">{req.days} days approved</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'policies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#6D28D9]" />
              <CardTitle>Annual Leave Guidelines</CardTitle>
            </div>
            <p className="text-xs text-[#6B647F] leading-relaxed">
              Every permanent employee receives 20 paid annual leave days per fiscal year (July–June). A maximum of 5 unused days may roll over into the following year, expiring if unused by December 31.
            </p>
            <div className="p-3 bg-[#F7F4FF] rounded-[10px] border border-[#E0D6FD] text-xs text-[#5B21B6]">
              Notice Requirement: Requests for 3+ consecutive days require 7 business days prior notification.
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#38BDF8]" />
              <CardTitle>Sick Leave Policy</CardTitle>
            </div>
            <p className="text-xs text-[#6B647F] leading-relaxed">
              10 days of paid sick leave are provided annually. Absences exceeding two consecutive working days must be substantiated by a verified prescription or medical certificate uploaded under the employee Documents tab.
            </p>
          </Card>
        </div>
      )}

      {/* Request Leave Drawer */}
      <Drawer
        isOpen={isRequestDrawerOpen}
        onClose={() => setIsRequestDrawerOpen(false)}
        title="Submit Leave Application"
        description="Request scheduled time off. Your team lead and HR will review."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsRequestDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleFormSubmit}>
              Submit Request
            </Button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <FormField label="Applying Employee">
            <Select
              value={requestForm.employee_id}
              onChange={(e) => setRequestForm({ ...requestForm, employee_id: e.target.value })}
            >
              {employees.slice(0, 20).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name} ({e.title})
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Leave Category">
            <Select
              value={requestForm.leave_type_id}
              onChange={(e) => setRequestForm({ ...requestForm, leave_type_id: e.target.value })}
            >
              <option value="annual">Annual Leave (10 days left)</option>
              <option value="sick">Sick Leave (8 days left)</option>
              <option value="casual">Casual Leave (4 days left)</option>
              <option value="unpaid">Unpaid Leave</option>
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start Date">
              <Input
                type="date"
                value={requestForm.start_date}
                onChange={(e) => setRequestForm({ ...requestForm, start_date: e.target.value })}
              />
            </FormField>
            <FormField label="End Date">
              <Input
                type="date"
                value={requestForm.end_date}
                onChange={(e) => setRequestForm({ ...requestForm, end_date: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Total Business Days">
            <Input
              type="number"
              value={requestForm.days}
              onChange={(e) => setRequestForm({ ...requestForm, days: Number(e.target.value) })}
            />
          </FormField>

          <FormField label="Reason for Leave" required error={requestError}>
            <Textarea
              value={requestForm.reason}
              onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
              placeholder="Provide context for coverage and handover..."
              error={!!requestError}
            />
          </FormField>
        </form>
      </Drawer>

      {/* Decision Confirmation Modal */}
      <Modal
        isOpen={!!selectedReqForDecision}
        onClose={() => setSelectedReqForDecision(null)}
        title={decisionType === 'approve' ? 'Approve Leave Request' : 'Reject Leave Request'}
        description={`Confirm decision for ${selectedReqForDecision?.employee_name} (${selectedReqForDecision?.days} days ${selectedReqForDecision?.leave_type_name}).`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedReqForDecision(null)}>
              Cancel
            </Button>
            <Button
              variant={decisionType === 'approve' ? 'primary' : 'danger'}
              onClick={handleConfirmDecision}
            >
              {decisionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-[10px] bg-[#FCFBFF] border border-[#ECE8F4] space-y-1">
            <span className="text-[#928BA6]">Submitted Reason:</span>
            <p className="font-medium text-[#1F1A2E]">{selectedReqForDecision?.reason}</p>
          </div>

          <FormField label="Approver Comment / Decision Notes (Optional)">
            <Input
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
              placeholder="e.g. Handover approved with engineering lead."
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
};

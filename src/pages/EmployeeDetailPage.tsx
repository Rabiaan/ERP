import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  CreditCard,
  Edit,
  UserX,
  TrendingUp,
  FileText,
  Clock,
  Shield,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  Download,
  Plus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Tabs } from '../components/ui/Tabs';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select, FormField } from '../components/ui/FormField';
import { Table, Column } from '../components/ui/Table';
import { formatCurrency, formatDate } from '../lib/utils';
import { AttendanceRecord, LeaveRequest, DocumentItem } from '../types';

export const EmployeeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    employees,
    attendanceRecords,
    leaveRequests,
    documents,
    payslips,
    goals,
    auditLogs,
    updateEmployee,
    offboardEmployee,
    addToast,
    departments,
  } = useApp();

  const employee = employees.find((e) => e.id === id);

  const [activeTab, setActiveTab] = useState('overview');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isOffboardModalOpen, setIsOffboardModalOpen] = useState(false);
  const [offboardConfirmName, setOffboardConfirmName] = useState('');
  const [offboardReason, setOffboardReason] = useState('Voluntary Resignation');

  // Edit form state
  const [editForm, setEditForm] = useState({
    title: employee?.title || '',
    phone: employee?.phone || '',
    department_id: employee?.department_id || '',
    salary_base: employee?.salary_base || 0,
    address: employee?.address || '',
  });

  if (!employee) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-lg font-bold text-[#1F1A2E]">Employee Not Found</h2>
        <p className="text-xs text-[#6B647F] mt-1 mb-4">
          The requested employee record does not exist or has been removed.
        </p>
        <Button variant="primary" size="sm" onClick={() => navigate('/employees')}>
          Return to Directory
        </Button>
      </div>
    );
  }

  // Related data
  const empAttendance = attendanceRecords.filter((a) => a.employee_id === employee.id);
  const empLeaves = leaveRequests.filter((l) => l.employee_id === employee.id);
  const empDocs = documents.filter((d) => d.employee_id === employee.id);
  const empPayslips = payslips.filter((p) => p.employee_id === employee.id);
  const empGoals = goals.filter((g) => g.employee_id === employee.id);
  const empAudit = auditLogs.filter(
    (a) => a.entity_id === employee.id || a.actor_email === employee.email
  );

  const directReports = employees.filter((e) => e.manager_id === employee.id);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'job', label: 'Job & Hierarchy' },
    { id: 'attendance', label: 'Attendance', count: empAttendance.length },
    { id: 'leave', label: 'Leave', count: empLeaves.length },
    { id: 'documents', label: 'Documents', count: empDocs.length },
    { id: 'payroll', label: 'Compensation', count: empPayslips.length },
    { id: 'performance', label: 'Performance', count: empGoals.length },
    { id: 'activity', label: 'Timeline' },
  ];

  const handleSaveEdit = () => {
    const dept = departments.find((d) => d.id === editForm.department_id);
    updateEmployee(employee.id, {
      title: editForm.title,
      phone: editForm.phone,
      department_id: editForm.department_id,
      department_name: dept?.name || employee.department_name,
      salary_base: Number(editForm.salary_base),
      address: editForm.address,
    });
    setIsEditModalOpen(false);
  };

  const handleConfirmOffboard = () => {
    const fullName = `${employee.first_name} ${employee.last_name}`;
    if (offboardConfirmName.trim() !== fullName) {
      addToast('danger', 'Confirmation Failed', 'You must type the exact full employee name to offboard.');
      return;
    }
    offboardEmployee(employee.id, new Date().toISOString().substring(0, 10), offboardReason);
    setIsOffboardModalOpen(false);
  };

  const attendanceCols: Column<AttendanceRecord>[] = [
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'clock_in', header: 'Clock In', render: (r) => r.clock_in || '—' },
    { key: 'clock_out', header: 'Clock Out', render: (r) => r.clock_out || '—' },
    { key: 'hours', header: 'Hours', render: (r) => `${r.hours} hrs` },
    { key: 'source', header: 'Method', render: (r) => r.source },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={r.status} size="sm" /> },
  ];

  const leaveCols: Column<LeaveRequest>[] = [
    { key: 'leave_type_name', header: 'Type' },
    {
      key: 'start_date',
      header: 'Dates',
      render: (r) => `${formatDate(r.start_date)} – ${formatDate(r.end_date)}`,
    },
    { key: 'days', header: 'Days', render: (r) => `${r.days} d` },
    { key: 'reason', header: 'Reason', render: (r) => <span className="line-clamp-1">{r.reason}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={r.status} size="sm" /> },
  ];

  const docCols: Column<DocumentItem>[] = [
    { key: 'name', header: 'File Name' },
    { key: 'type', header: 'Type' },
    { key: 'file_size', header: 'Size' },
    { key: 'uploaded_at', header: 'Uploaded', render: (d) => formatDate(d.uploaded_at) },
    { key: 'status', header: 'Status', render: (d) => <Badge variant={d.status} size="sm" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <button
          onClick={() => navigate('/employees')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B647F] hover:text-[#6D28D9] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to directory</span>
        </button>
      </div>

      {/* Header Profile Card */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Avatar
              name={`${employee.first_name} ${employee.last_name}`}
              src={employee.avatar_url}
              size="xl"
              status={employee.status === 'Active' ? 'online' : 'away'}
            />
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-[#1F1A2E]">
                  {employee.first_name} {employee.last_name}
                </h1>
                <Badge variant={employee.status} />
                <span className="font-mono text-xs text-[#6B647F] bg-[#F7F5FB] px-2 py-0.5 rounded border border-[#ECE8F4]">
                  {employee.employee_no}
                </span>
              </div>
              <p className="text-sm font-medium text-[#6D28D9]">{employee.title}</p>
              <div className="flex items-center gap-4 text-xs text-[#6B647F] pt-1 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#928BA6]" />
                  {employee.department_name}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#928BA6]" />
                  {employee.location_name}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#928BA6]" />
                  Joined {formatDate(employee.hire_date)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Edit className="w-4 h-4" />}
              onClick={() => {
                setEditForm({
                  title: employee.title,
                  phone: employee.phone,
                  department_id: employee.department_id,
                  salary_base: employee.salary_base,
                  address: employee.address,
                });
                setIsEditModalOpen(true);
              }}
            >
              Edit Profile
            </Button>
            {employee.status !== 'Exited' && (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<UserX className="w-4 h-4" />}
                onClick={() => {
                  setOffboardConfirmName('');
                  setIsOffboardModalOpen(true);
                }}
              >
                Offboard
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs navigation */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Two Column Layout: Main (8 cols) + Context Rail (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Tab Content */}
        <div className="lg:col-span-8 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Personal & Employment Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Personal & Employment Record</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[#928BA6] block">Official Email</span>
                      <span className="font-medium text-[#1F1A2E]">{employee.email}</span>
                    </div>
                    <div>
                      <span className="text-[#928BA6] block">Contact Phone</span>
                      <span className="font-medium text-[#1F1A2E]">{employee.phone}</span>
                    </div>
                    <div>
                      <span className="text-[#928BA6] block">Residential Address</span>
                      <span className="font-medium text-[#1F1A2E]">{employee.address}</span>
                    </div>
                    <div>
                      <span className="text-[#928BA6] block">Gender & DOB</span>
                      <span className="font-medium text-[#1F1A2E]">
                        {employee.gender} · {formatDate(employee.dob)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#928BA6] block">Employment Contract</span>
                      <span className="font-medium text-[#1F1A2E]">{employee.employment_type}</span>
                    </div>
                    <div>
                      <span className="text-[#928BA6] block">Reporting Manager</span>
                      <span className="font-medium text-[#1F1A2E]">
                        {employee.manager_name || 'Executive Committee / Board'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Direct Reports */}
              {directReports.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Direct Reports ({directReports.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-[#F7F5FB] p-0">
                    {directReports.map((dr) => (
                      <div
                        key={dr.id}
                        onClick={() => navigate(`/employees/${dr.id}`)}
                        className="p-3.5 flex items-center justify-between hover:bg-[#F7F4FF] cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar name={`${dr.first_name} ${dr.last_name}`} src={dr.avatar_url} size="sm" />
                          <div>
                            <div className="text-xs font-semibold text-[#1F1A2E]">
                              {dr.first_name} {dr.last_name}
                            </div>
                            <div className="text-[11px] text-[#6B647F]">{dr.title}</div>
                          </div>
                        </div>
                        <Badge variant={dr.status} size="sm" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Emergency Contact */}
              <Card>
                <CardHeader>
                  <CardTitle>Emergency Contact</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-[#928BA6] block">Name</span>
                      <span className="font-semibold text-[#1F1A2E]">
                        {employee.emergency_contact?.name || 'Farah Mansoor'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#928BA6] block">Relationship</span>
                      <span className="font-semibold text-[#1F1A2E]">
                        {employee.emergency_contact?.relationship || 'Spouse'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#928BA6] block">Phone</span>
                      <span className="font-semibold text-[#1F1A2E]">
                        {employee.emergency_contact?.phone || '+92 300 0000000'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'job' && (
            <Card>
              <CardHeader>
                <CardTitle>Organizational Structure</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-[12px] bg-[#FCFBFF] border border-[#ECE8F4] space-y-2">
                  <div className="text-xs text-[#928BA6]">Department Division</div>
                  <div className="text-sm font-semibold text-[#1F1A2E]">{employee.department_name}</div>
                  <p className="text-xs text-[#6B647F]">
                    Primary reporting office at {employee.location_name}.
                  </p>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Button variant="secondary" size="sm" onClick={() => navigate('/org-chart')}>
                    View in Org Chart Tree
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'attendance' && (
            <div className="space-y-4">
              <Table
                columns={attendanceCols}
                data={empAttendance}
                keyExtractor={(r) => r.id}
                emptyState={<div className="p-6 text-xs text-[#928BA6]">No attendance records found for this period.</div>}
              />
            </div>
          )}

          {activeTab === 'leave' && (
            <div className="space-y-4">
              <Table
                columns={leaveCols}
                data={empLeaves}
                keyExtractor={(r) => r.id}
                emptyState={<div className="p-6 text-xs text-[#928BA6]">No leave requests submitted yet.</div>}
              />
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="space-y-4">
              <Table
                columns={docCols}
                data={empDocs}
                keyExtractor={(d) => d.id}
                emptyState={<div className="p-6 text-xs text-[#928BA6]">No documents uploaded for this employee.</div>}
              />
            </div>
          )}

          {activeTab === 'payroll' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Base Compensation Breakdown</CardTitle>
                  <Badge variant="paid" size="sm">
                    Verified
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between pb-4 border-b border-[#ECE8F4]">
                    <div>
                      <div className="text-xs text-[#6B647F]">Monthly Gross Base</div>
                      <div className="text-2xl font-bold text-[#1F1A2E] tabular-nums">
                        {formatCurrency(employee.salary_base)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[#6B647F]">Annualized Package</div>
                      <div className="text-sm font-semibold text-[#6D28D9] tabular-nums">
                        {formatCurrency(employee.salary_base * 12)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <h4 className="text-xs font-semibold text-[#1F1A2E]">Recent Payslips</h4>
                    {empPayslips.length > 0 ? (
                      empPayslips.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-3 rounded-[10px] bg-[#FCFBFF] border border-[#ECE8F4] text-xs"
                        >
                          <div>
                            <span className="font-semibold text-[#1F1A2E]">October 2026 Pay Run</span>
                            <div className="text-[10px] text-[#6B647F]">{p.payment_method}</div>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-[#15803D] tabular-nums">
                              {formatCurrency(p.net)}
                            </span>
                            <div className="text-[10px] text-[#928BA6]">Net Disbursed</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[#928BA6]">Standard salary structure registered.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="space-y-4">
              {empGoals.length > 0 ? (
                empGoals.map((g) => (
                  <Card key={g.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-[#1F1A2E]">{g.title}</h4>
                      <Badge variant={g.status} size="sm" />
                    </div>
                    <p className="text-xs text-[#6B647F]">{g.description}</p>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-[#6B647F]">
                        <span>Progress</span>
                        <span className="font-bold tabular-nums">{g.progress}%</span>
                      </div>
                      <div className="h-2 w-full bg-[#F7F5FB] rounded-full overflow-hidden">
                        <div
                          style={{ width: `${g.progress}%` }}
                          className="h-full bg-[#6D28D9] rounded-full"
                        />
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="p-8 text-center text-xs text-[#928BA6]">
                  No active goals registered for this cycle.
                </Card>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <Card>
              <CardHeader>
                <CardTitle>Audit & Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {empAudit.length > 0 ? (
                  empAudit.map((log) => (
                    <div key={log.id} className="text-xs flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#8B5CF6] mt-1.5 shrink-0" />
                      <div>
                        <div className="font-semibold text-[#1F1A2E]">{log.action}</div>
                        <div className="text-[#6B647F]">{log.details?.after || log.entity}</div>
                        <div className="text-[10px] text-[#928BA6]">{log.timestamp}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[#928BA6]">No recent audit logs for this employee.</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Context Rail */}
        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Key Facts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-[#F7F5FB]">
                <span className="text-[#928BA6]">Staff ID</span>
                <span className="font-mono font-semibold text-[#1F1A2E]">{employee.employee_no}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#F7F5FB]">
                <span className="text-[#928BA6]">Tenure</span>
                <span className="font-semibold text-[#1F1A2E]">
                  {Math.max(1, 2026 - parseInt(employee.hire_date.substring(0, 4)))} years
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#F7F5FB]">
                <span className="text-[#928BA6]">Direct Reports</span>
                <span className="font-semibold text-[#1F1A2E] tabular-nums">
                  {directReports.length}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#F7F5FB]">
                <span className="text-[#928BA6]">Base Salary</span>
                <span className="font-semibold text-[#6D28D9] tabular-nums">
                  {formatCurrency(employee.salary_base)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#928BA6]">Work Week</span>
                <span className="font-semibold text-[#1F1A2E]">Mon – Fri (40h)</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start text-xs"
                leftIcon={<Mail className="w-4 h-4 text-[#6D28D9]" />}
                onClick={() => addToast('info', 'Email Client', `Drafting message to ${employee.email}`)}
              >
                Send Direct Message
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start text-xs"
                leftIcon={<Calendar className="w-4 h-4 text-[#38BDF8]" />}
                onClick={() => navigate('/leave')}
              >
                Book Leave on Behalf
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start text-xs"
                leftIcon={<CreditCard className="w-4 h-4 text-[#34D399]" />}
                onClick={() => navigate('/payroll')}
              >
                Review Monthly Payslips
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Employee Information"
        description={`Update role, contact and department parameters for ${employee.first_name} ${employee.last_name}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Job Title" required>
            <Input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            />
          </FormField>
          <FormField label="Department" required>
            <Select
              value={editForm.department_id}
              onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Phone Number">
            <Input
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            />
          </FormField>
          <FormField label="Base Salary (PKR/month)">
            <Input
              type="number"
              value={editForm.salary_base}
              onChange={(e) => setEditForm({ ...editForm, salary_base: Number(e.target.value) })}
            />
          </FormField>
          <FormField label="Address">
            <Input
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
            />
          </FormField>
        </div>
      </Modal>

      {/* High-Impact Offboard Confirmation Modal (Requires typed confirmation) */}
      <Modal
        isOpen={isOffboardModalOpen}
        onClose={() => setIsOffboardModalOpen(false)}
        title="Offboard Employee"
        description="This action terminates active system access and marks the employee as Exited."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsOffboardModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmOffboard}
              disabled={offboardConfirmName.trim() !== `${employee.first_name} ${employee.last_name}`}
            >
              Confirm Offboarding
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[12px] text-[#B91C1C] flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Destructive Action</p>
              <p className="mt-0.5 leading-relaxed">
                Offboarding revokes company email, access cards, and generates separation clearance forms.
              </p>
            </div>
          </div>

          <FormField label="Reason for Separation">
            <Select
              value={offboardReason}
              onChange={(e) => setOffboardReason(e.target.value)}
            >
              <option value="Voluntary Resignation">Voluntary Resignation</option>
              <option value="Career Transition">Career Transition</option>
              <option value="Contract End">Contract End</option>
              <option value="Performance Separation">Performance Separation</option>
            </Select>
          </FormField>

          <FormField
            label={`To confirm, type "${employee.first_name} ${employee.last_name}" below:`}
            required
          >
            <Input
              value={offboardConfirmName}
              onChange={(e) => setOffboardConfirmName(e.target.value)}
              placeholder={`${employee.first_name} ${employee.last_name}`}
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
};

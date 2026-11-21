import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  UserCheck,
  AlertCircle,
  Laptop,
  XCircle,
  Download,
  Plus,
  Filter,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Input } from '../components/ui/Input';
import { Select, FormField } from '../components/ui/FormField';
import { Table, Column } from '../components/ui/Table';
import { Drawer } from '../components/ui/Drawer';
import { formatDate } from '../lib/utils';
import { AttendanceRecord, AttendanceStatus } from '../types';

export const AttendancePage: React.FC = () => {
  const {
    attendanceRecords,
    employees,
    departments,
    addAttendanceCorrection,
    addToast,
  } = useApp();

  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'daily' | 'calendar'>('daily');

  // Correction Drawer
  const [isCorrectionDrawerOpen, setIsCorrectionDrawerOpen] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    employee_id: employees[0]?.id || 'emp-001',
    date: '2026-10-29',
    clock_in: '09:00',
    clock_out: '18:00',
    reason: '',
  });
  const [formError, setFormError] = useState('');

  // Counts for summary strip
  const presentCount = attendanceRecords.filter((a) => a.status === 'Present').length;
  const lateCount = attendanceRecords.filter((a) => a.status === 'Late').length;
  const absentCount = attendanceRecords.filter((a) => a.status === 'Absent').length;
  const remoteCount = attendanceRecords.filter((a) => a.status === 'Remote').length;

  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter((rec) => {
      const matchesSearch =
        search === '' ||
        rec.employee_name.toLowerCase().includes(search.toLowerCase()) ||
        rec.department.toLowerCase().includes(search.toLowerCase());
      const matchesDept = selectedDept === 'ALL' || rec.department === selectedDept;
      const matchesStatus = selectedStatus === 'ALL' || rec.status === selectedStatus;
      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [attendanceRecords, search, selectedDept, selectedStatus]);

  const handleExportCSV = () => {
    const headers = ['ID,Employee,Department,Date,Clock In,Clock Out,Hours,Status,Source\n'];
    const rows = filteredRecords.map(
      (r) =>
        `"${r.id}","${r.employee_name}","${r.department}","${r.date}","${r.clock_in || ''}","${r.clock_out || ''}","${r.hours}","${r.status}","${r.source}"\n`
    );
    const blob = new Blob([...headers, ...rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Attendance_Log_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('success', 'Export Complete', `${filteredRecords.length} attendance records exported.`);
  };

  const handleCorrectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionForm.reason.trim()) {
      setFormError('Reason for attendance manual adjustment is required.');
      return;
    }
    addAttendanceCorrection(correctionForm);
    setIsCorrectionDrawerOpen(false);
    setCorrectionForm({
      employee_id: employees[0]?.id || 'emp-001',
      date: '2026-10-29',
      clock_in: '09:00',
      clock_out: '18:00',
      reason: '',
    });
    setFormError('');
  };

  const columns: Column<AttendanceRecord>[] = [
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
      key: 'date',
      header: 'Date',
      render: (r) => <span className="tabular-nums">{formatDate(r.date)}</span>,
    },
    {
      key: 'clock_in',
      header: 'Clock In',
      render: (r) => (
        <span className="font-mono text-xs text-[#1F1A2E] tabular-nums font-medium">
          {r.clock_in || '—'}
        </span>
      ),
    },
    {
      key: 'clock_out',
      header: 'Clock Out',
      render: (r) => (
        <span className="font-mono text-xs text-[#1F1A2E] tabular-nums font-medium">
          {r.clock_out || '—'}
        </span>
      ),
    },
    {
      key: 'hours',
      header: 'Duration',
      render: (r) => <span className="tabular-nums font-medium">{r.hours} hrs</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={r.status} size="sm" />,
    },
    {
      key: 'source',
      header: 'Device Source',
      render: (r) => (
        <span className="text-xs text-[#6B647F] bg-[#F7F5FB] px-2 py-0.5 rounded border border-[#ECE8F4]">
          {r.source}
        </span>
      ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (r) => <span className="text-xs text-[#928BA6] italic truncate">{r.notes || '—'}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1A2E]">Daily Attendance</h1>
          <p className="text-xs text-[#6B647F] mt-0.5">
            Biometric logs, clock-in tracking, and shift verification for 29 Oct 2026.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={handleExportCSV}
          >
            Export Log
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsCorrectionDrawerOpen(true)}
          >
            Request Correction
          </Button>
        </div>
      </div>

      {/* Summary Strip (Present, Late, Absent, Remote) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center justify-between border-l-4 border-l-[#15803D]">
          <div>
            <div className="text-xs font-semibold text-[#6B647F] uppercase tracking-wider">Present</div>
            <div className="text-2xl font-bold text-[#1F1A2E] tabular-nums mt-1">{presentCount}</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-[#ECFDF3] text-[#15803D] flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between border-l-4 border-l-[#B45309]">
          <div>
            <div className="text-xs font-semibold text-[#6B647F] uppercase tracking-wider">Late Arrivals</div>
            <div className="text-2xl font-bold text-[#1F1A2E] tabular-nums mt-1">{lateCount}</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-[#FFFBEB] text-[#B45309] flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between border-l-4 border-l-[#B91C1C]">
          <div>
            <div className="text-xs font-semibold text-[#6B647F] uppercase tracking-wider">Absent / On Leave</div>
            <div className="text-2xl font-bold text-[#1F1A2E] tabular-nums mt-1">{absentCount}</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-[#FEF2F2] text-[#B91C1C] flex items-center justify-center">
            <XCircle className="w-5 h-5" />
          </div>
        </Card>

        <Card className="p-4 flex items-center justify-between border-l-4 border-l-[#1D4ED8]">
          <div>
            <div className="text-xs font-semibold text-[#6B647F] uppercase tracking-wider">Remote / WFH</div>
            <div className="text-2xl font-bold text-[#1F1A2E] tabular-nums mt-1">{remoteCount}</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center">
            <Laptop className="w-5 h-5" />
          </div>
        </Card>
      </div>

      {/* Filter & Toggle Bar */}
      <div className="p-4 bg-white rounded-[16px] border border-[#ECE8F4] flex flex-col md:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="w-full md:w-80">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee or department..."
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <div className="w-40">
            <Select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-36">
            <Select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
              <option value="ALL">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Absent">Absent</option>
              <option value="Remote">Remote</option>
            </Select>
          </div>

          <div className="flex items-center bg-[#F7F5FB] p-1 rounded-[10px] border border-[#ECE8F4]">
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1 text-xs font-medium rounded-[8px] cursor-pointer ${
                viewMode === 'daily' ? 'bg-white text-[#6D28D9] shadow-2xs' : 'text-[#6B647F]'
              }`}
            >
              Daily Table
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1 text-xs font-medium rounded-[8px] cursor-pointer ${
                viewMode === 'calendar' ? 'bg-white text-[#6D28D9] shadow-2xs' : 'text-[#6B647F]'
              }`}
            >
              Heatmap
            </button>
          </div>
        </div>
      </div>

      {/* Table or Heatmap View */}
      {viewMode === 'daily' ? (
        <Table
          columns={columns}
          data={filteredRecords}
          keyExtractor={(r) => r.id}
          emptyState={
            <div className="p-8 text-center text-xs text-[#928BA6]">
              No attendance records found matching criteria.
            </div>
          }
        />
      ) : (
        /* Calendar Heatmap Matrix View */
        <Card className="p-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#ECE8F4]">
            <div>
              <h3 className="text-sm font-semibold text-[#1F1A2E]">October 2026 Attendance Heatmap</h3>
              <p className="text-xs text-[#6B647F]">Daily studio capacity and presence rate</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#6B647F]">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-[#EFE9FE]" /> 90%+
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-[#8B5CF6]" /> 95%+
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-[#5B21B6]" /> 98%+
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 pt-4 text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d} className="text-xs font-semibold text-[#928BA6] uppercase py-1">
                {d}
              </span>
            ))}
            {Array.from({ length: 31 }).map((_, i) => {
              const day = i + 1;
              const isWeekend = (day + 3) % 7 === 6 || (day + 3) % 7 === 0;
              const rate = isWeekend ? null : 92 + (day % 7);
              return (
                <div
                  key={day}
                  className={`p-3 rounded-[12px] border flex flex-col items-center justify-between min-h-[70px] ${
                    isWeekend
                      ? 'bg-[#F7F5FB] border-[#ECE8F4] text-[#928BA6]'
                      : 'bg-white border-[#E0D6FD] text-[#1F1A2E]'
                  }`}
                >
                  <span className="text-xs font-semibold">{day}</span>
                  {rate && (
                    <span className="text-[11px] font-bold text-[#6D28D9] tabular-nums">
                      {rate}%
                    </span>
                  )}
                  {isWeekend && <span className="text-[10px]">Weekend</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Attendance Correction Drawer */}
      <Drawer
        isOpen={isCorrectionDrawerOpen}
        onClose={() => setIsCorrectionDrawerOpen(false)}
        title="Request Attendance Correction"
        description="Submit an adjustment for missing biometric clock-in or remote field duty."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCorrectionDrawerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCorrectionSubmit}>
              Submit Adjustment
            </Button>
          </>
        }
      >
        <form onSubmit={handleCorrectionSubmit} className="space-y-4">
          <FormField label="Employee">
            <Select
              value={correctionForm.employee_id}
              onChange={(e) => setCorrectionForm({ ...correctionForm, employee_id: e.target.value })}
            >
              {employees.slice(0, 20).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name} ({e.title})
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Date">
            <Input
              type="date"
              value={correctionForm.date}
              onChange={(e) => setCorrectionForm({ ...correctionForm, date: e.target.value })}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Corrected Clock In">
              <Input
                type="time"
                value={correctionForm.clock_in}
                onChange={(e) => setCorrectionForm({ ...correctionForm, clock_in: e.target.value })}
              />
            </FormField>
            <FormField label="Corrected Clock Out">
              <Input
                type="time"
                value={correctionForm.clock_out}
                onChange={(e) => setCorrectionForm({ ...correctionForm, clock_out: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Reason for Correction" required error={formError}>
            <Input
              value={correctionForm.reason}
              onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
              placeholder="e.g. Biometric reader power glitch at North Gate"
              error={!!formError}
            />
          </FormField>
        </form>
      </Drawer>
    </div>
  );
};

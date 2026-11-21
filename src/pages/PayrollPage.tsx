import React, { useState } from 'react';
import {
  CreditCard,
  Plus,
  CheckCircle2,
  Clock,
  ArrowRight,
  Download,
  AlertCircle,
  FileCheck,
  Send,
  Lock,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Table, Column } from '../components/ui/Table';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { formatCurrency, formatDate } from '../lib/utils';
import { PayRun, Payslip, SalaryStructure } from '../types';
import { mockSalaryStructures } from '../data/mockData';

export const PayrollPage: React.FC = () => {
  const {
    payRuns,
    payslips,
    employees,
    createPayRun,
    approvePayRun,
    markPayRunPaid,
    addToast,
    role,
  } = useApp();

  const [selectedPayRun, setSelectedPayRun] = useState<PayRun>(payRuns[0]);
  const [activeSubTab, setActiveSubTab] = useState<'runs' | 'structures'>('runs');

  // Create Run Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRunPeriod, setNewRunPeriod] = useState('November 2026');
  const [newRunStart, setNewRunStart] = useState('2026-11-01');
  const [newRunEnd, setNewRunEnd] = useState('2026-11-30');
  const [newRunPayDate, setNewRunPayDate] = useState('2026-11-30');

  // Stepper steps for current selected pay run
  const getStepIndex = (status: string) => {
    switch (status) {
      case 'Draft':
        return 1;
      case 'Processing':
        return 2;
      case 'Approved':
        return 3;
      case 'Paid':
        return 4;
      default:
        return 1;
    }
  };

  const currentStep = getStepIndex(selectedPayRun.status);

  const handleCreateRun = () => {
    createPayRun(newRunPeriod, newRunStart, newRunEnd, newRunPayDate);
    setIsCreateModalOpen(false);
  };

  const handleExportBatchPayslips = () => {
    addToast('success', 'Payslips Generated', `ZIP archive of 48 individual PDF payslips created for ${selectedPayRun.period_label}.`);
  };

  const payRunCols: Column<PayRun>[] = [
    {
      key: 'period_label',
      header: 'Pay Period',
      render: (r) => (
        <div>
          <span className="font-semibold text-[#1F1A2E]">{r.period_label}</span>
          <div className="text-[10px] text-[#6B647F]">
            {r.period_start} to {r.period_end}
          </div>
        </div>
      ),
    },
    {
      key: 'pay_date',
      header: 'Disbursement Date',
      render: (r) => <span className="tabular-nums">{formatDate(r.pay_date)}</span>,
    },
    {
      key: 'employees_count',
      header: 'Headcount',
      render: (r) => <span className="tabular-nums font-medium">{r.employees_count} staff</span>,
    },
    {
      key: 'gross_total',
      header: 'Gross Total',
      align: 'right',
      render: (r) => (
        <span className="font-semibold tabular-nums text-[#1F1A2E]">
          {formatCurrency(r.gross_total)}
        </span>
      ),
    },
    {
      key: 'deductions_total',
      header: 'Tax & Deductions',
      align: 'right',
      render: (r) => (
        <span className="text-[#B91C1C] tabular-nums font-medium">
          -{formatCurrency(r.deductions_total)}
        </span>
      ),
    },
    {
      key: 'net_total',
      header: 'Net Pay',
      align: 'right',
      render: (r) => (
        <span className="font-bold tabular-nums text-[#15803D]">
          {formatCurrency(r.net_total)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={r.status} size="sm" />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <Button
          variant="secondary"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setSelectedPayRun(r)}
        >
          View Details
        </Button>
      ),
    },
  ];

  const slipCols: Column<Payslip>[] = [
    { key: 'employee_name', header: 'Staff Member' },
    { key: 'department', header: 'Department' },
    {
      key: 'base',
      header: 'Base Salary',
      align: 'right',
      render: (s) => <span className="tabular-nums">{formatCurrency(s.base)}</span>,
    },
    {
      key: 'allowances',
      header: 'Allowances',
      align: 'right',
      render: (s) => <span className="tabular-nums text-[#15803D]">+{formatCurrency(s.allowances)}</span>,
    },
    {
      key: 'tax_deduction',
      header: 'Tax Withholding',
      align: 'right',
      render: (s) => <span className="tabular-nums text-[#B91C1C]">-{formatCurrency(s.tax_deduction)}</span>,
    },
    {
      key: 'net',
      header: 'Net Disbursed',
      align: 'right',
      render: (s) => <span className="font-bold tabular-nums text-[#1F1A2E]">{formatCurrency(s.net)}</span>,
    },
    { key: 'payment_method', header: 'Bank Account' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1A2E]">Payroll Operations</h1>
          <p className="text-xs text-[#6B647F] mt-0.5">
            Salary disbursement runs, tax withholdings, and statutory FBR calculations.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={handleExportBatchPayslips}
          >
            Export All Payslips
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            Create Pay Run
          </Button>
        </div>
      </div>

      {/* Selected Pay Run Summary Banner & Stepper */}
      <Card className="p-6 border-l-4 border-l-[#6D28D9]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#ECE8F4]">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-[#1F1A2E]">
                {selectedPayRun.period_label} Run
              </h2>
              <Badge variant={selectedPayRun.status} />
            </div>
            <p className="text-xs text-[#6B647F] mt-0.5">
              Scheduled pay date: {formatDate(selectedPayRun.pay_date)} · {selectedPayRun.employees_count} eligible team members
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedPayRun.status === 'Processing' && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<FileCheck className="w-4 h-4" />}
                onClick={() => approvePayRun(selectedPayRun.id)}
              >
                Approve Pay Run
              </Button>
            )}
            {selectedPayRun.status === 'Approved' && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Send className="w-4 h-4" />}
                onClick={() => markPayRunPaid(selectedPayRun.id)}
              >
                Disburse Salaries
              </Button>
            )}
            {selectedPayRun.status === 'Paid' && (
              <span className="flex items-center gap-1.5 text-xs text-[#15803D] font-semibold bg-[#ECFDF3] px-3 py-1.5 rounded-full border border-[#BBF7D0]">
                <CheckCircle2 className="w-4 h-4" /> Disbursed {selectedPayRun.paid_at}
              </span>
            )}
          </div>
        </div>

        {/* 4-Step Approval Stepper */}
        <div className="pt-6 grid grid-cols-4 gap-2">
          {[
            { step: 1, title: 'Prepare Data', desc: 'Attendance & hours synced' },
            { step: 2, title: 'Review & Verify', desc: 'Tax withholdings checked' },
            { step: 3, title: 'Executive Approval', desc: 'CEO signoff required' },
            { step: 4, title: 'Disburse & Payslips', desc: 'Direct bank transfers' },
          ].map((s) => {
            const isDone = currentStep > s.step;
            const isCurrent = currentStep === s.step;

            return (
              <div key={s.step} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isDone
                        ? 'bg-[#15803D] text-white'
                        : isCurrent
                        ? 'bg-[#6D28D9] text-white'
                        : 'bg-[#F7F5FB] text-[#928BA6] border border-[#ECE8F4]'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : s.step}
                  </div>
                  <div className="h-0.5 flex-1 bg-[#ECE8F4] hidden sm:block" />
                </div>
                <div>
                  <div className={`text-xs font-semibold ${isCurrent ? 'text-[#6D28D9]' : 'text-[#1F1A2E]'}`}>
                    {s.title}
                  </div>
                  <div className="text-[10px] text-[#6B647F]">{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Financial Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-[#6B647F]">Total Gross Salaries</div>
          <div className="text-2xl font-bold text-[#1F1A2E] tabular-nums mt-1">
            {formatCurrency(selectedPayRun.gross_total)}
          </div>
          <span className="text-[10px] text-[#15803D] font-medium">+2.6% vs previous cycle</span>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-[#6B647F]">Income Tax & Provident Fund</div>
          <div className="text-2xl font-bold text-[#B91C1C] tabular-nums mt-1">
            {formatCurrency(selectedPayRun.deductions_total)}
          </div>
          <span className="text-[10px] text-[#6B647F]">Withholding remitted to FBR</span>
        </Card>

        <Card className="p-4">
          <div className="text-xs text-[#6B647F]">Net Disbursed to Employees</div>
          <div className="text-2xl font-bold text-[#15803D] tabular-nums mt-1">
            {formatCurrency(selectedPayRun.net_total)}
          </div>
          <span className="text-[10px] text-[#6D28D9] font-medium">PKR · Direct Bank Deposit</span>
        </Card>
      </div>

      {/* Pay Runs History Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1F1A2E]">Pay Run Cycles History</h3>
          <span className="text-xs text-[#6B647F]">{payRuns.length} registered runs</span>
        </div>
        <Table columns={payRunCols} data={payRuns} keyExtractor={(r) => r.id} />
      </div>

      {/* Individual Employee Payslip Breakdown for current run */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1F1A2E]">
            {selectedPayRun.period_label} Employee Payslips Breakdown
          </h3>
          <Button variant="link" size="sm" onClick={handleExportBatchPayslips}>
            Download Batch PDF
          </Button>
        </div>
        <Table columns={slipCols} data={payslips} keyExtractor={(s) => s.id} />
      </div>

      {/* Create Pay Run Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Initialize New Pay Run"
        description="Calculate monthly salaries, tax deductions, and prepare batch disbursement."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateRun}>
              Initialize Batch
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Period Label" required>
            <Input
              value={newRunPeriod}
              onChange={(e) => setNewRunPeriod(e.target.value)}
              placeholder="e.g. November 2026"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Cycle Start Date">
              <Input
                type="date"
                value={newRunStart}
                onChange={(e) => setNewRunStart(e.target.value)}
              />
            </FormField>
            <FormField label="Cycle End Date">
              <Input
                type="date"
                value={newRunEnd}
                onChange={(e) => setNewRunEnd(e.target.value)}
              />
            </FormField>
          </div>
          <FormField label="Target Disbursement Date">
            <Input
              type="date"
              value={newRunPayDate}
              onChange={(e) => setNewRunPayDate(e.target.value)}
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
};

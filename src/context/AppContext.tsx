import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  UserRole,
  Employee,
  Department,
  Location,
  LeaveRequest,
  AttendanceRecord,
  PayRun,
  Payslip,
  Candidate,
  JobOpening,
  Interview,
  Goal,
  DocumentItem,
  Asset,
  Announcement,
  AuditLogEntry,
  CandidateStage,
  LeaveBalance,
} from '../types';
import {
  mockEmployees,
  mockDepartments,
  mockLocations,
  mockLeaveRequests,
  mockAttendanceRecords,
  mockPayRuns,
  mockPayslips,
  mockCandidates,
  mockJobOpenings,
  mockInterviews,
  mockGoals,
  mockDocuments,
  mockAssets,
  mockAnnouncements,
  mockAuditLogs,
  mockLeaveBalances,
} from '../data/mockData';

export interface ToastMessage {
  id: string;
  type: 'success' | 'danger' | 'warning' | 'info';
  title: string;
  message: string;
}

interface AppContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  employees: Employee[];
  departments: Department[];
  locations: Location[];
  leaveRequests: LeaveRequest[];
  attendanceRecords: AttendanceRecord[];
  payRuns: PayRun[];
  payslips: Payslip[];
  candidates: Candidate[];
  jobOpenings: JobOpening[];
  interviews: Interview[];
  goals: Goal[];
  documents: DocumentItem[];
  assets: Asset[];
  announcements: Announcement[];
  auditLogs: AuditLogEntry[];
  leaveBalances: LeaveBalance[];

  // Actions
  addToast: (type: 'success' | 'danger' | 'warning' | 'info', title: string, message: string) => void;
  removeToast: (id: string) => void;
  toasts: ToastMessage[];

  // Employee actions
  addEmployee: (emp: Omit<Employee, 'id' | 'employee_no' | 'direct_reports_count'>) => void;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  offboardEmployee: (id: string, exitDate: string, reason?: string) => void;

  // Leave actions
  approveLeaveRequest: (id: string, comment?: string) => void;
  rejectLeaveRequest: (id: string, comment?: string) => void;
  requestLeave: (req: {
    employee_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    days: number;
    reason: string;
  }) => void;

  // Attendance actions
  addAttendanceCorrection: (correction: {
    employee_id: string;
    date: string;
    clock_in: string;
    clock_out: string;
    reason: string;
  }) => void;

  // Payroll actions
  createPayRun: (periodLabel: string, periodStart: string, periodEnd: string, payDate: string) => void;
  approvePayRun: (payRunId: string) => void;
  markPayRunPaid: (payRunId: string) => void;

  // Recruitment actions
  moveCandidateStage: (candidateId: string, targetStage: CandidateStage) => void;
  addCandidateNote: (candidateId: string, note: string) => void;
  addJobOpening: (job: Omit<JobOpening, 'id' | 'opened_at' | 'applicants_count'>) => void;
  addCandidate: (cand: Omit<Candidate, 'id' | 'days_in_stage' | 'applied_date' | 'notes'>) => void;

  // Goals & Performance
  updateGoalProgress: (goalId: string, newProgress: number) => void;
  addGoal: (goal: Omit<Goal, 'id'>) => void;

  // Workplace
  uploadDocument: (doc: Omit<DocumentItem, 'id' | 'uploaded_at'>) => void;
  assignAsset: (assetId: string, employeeId: string, employeeName: string) => void;
  returnAsset: (assetId: string) => void;
  createAnnouncement: (ann: Omit<Announcement, 'id' | 'published_at' | 'read_count'>) => void;

  // Command Palette
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;

  // Mobile / Sidebar collapse
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  isMobileNavOpen: boolean;
  setIsMobileNavOpen: (open: boolean) => void;

  // Add Employee Drawer Global Trigger
  isAddEmployeeDrawerOpen: boolean;
  setIsAddEmployeeDrawerOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function useStorageState<T>(key: string, initialValue: T): [T, (val: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(`lilac_${key}`);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`lilac_${key}`, JSON.stringify(state));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [key, state]);

  return [state, setState];
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [role, setRole] = useStorageState<UserRole>('role', 'Super Admin');
  const [employees, setEmployees] = useStorageState<Employee[]>('employees', mockEmployees);
  const [departments] = useStorageState<Department[]>('departments', mockDepartments);
  const [locations] = useStorageState<Location[]>('locations', mockLocations);
  const [leaveRequests, setLeaveRequests] = useStorageState<LeaveRequest[]>('leaveRequests', mockLeaveRequests);
  const [leaveBalances] = useStorageState<LeaveBalance[]>('leaveBalances', mockLeaveBalances);
  const [attendanceRecords, setAttendanceRecords] = useStorageState<AttendanceRecord[]>('attendance_v2', mockAttendanceRecords);
  const [payRuns, setPayRuns] = useStorageState<PayRun[]>('payRuns', mockPayRuns);
  const [payslips] = useStorageState<Payslip[]>('payslips', mockPayslips);
  const [candidates, setCandidates] = useStorageState<Candidate[]>('candidates', mockCandidates);
  const [jobOpenings, setJobOpenings] = useStorageState<JobOpening[]>('jobs', mockJobOpenings);
  const [interviews] = useStorageState<Interview[]>('interviews', mockInterviews);
  const [goals, setGoals] = useStorageState<Goal[]>('goals', mockGoals);
  const [documents, setDocuments] = useStorageState<DocumentItem[]>('documents', mockDocuments);
  const [assets, setAssets] = useStorageState<Asset[]>('assets', mockAssets);
  const [announcements, setAnnouncements] = useStorageState<Announcement[]>('announcements', mockAnnouncements);
  const [auditLogs, setAuditLogs] = useStorageState<AuditLogEntry[]>('auditLogs', mockAuditLogs);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useStorageState<boolean>('sidebarCollapsed', false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isAddEmployeeDrawerOpen, setIsAddEmployeeDrawerOpen] = useState(false);

  const addToast = (type: 'success' | 'danger' | 'warning' | 'info', title: string, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const recordAudit = (action: string, entity: string, entity_id: string, details?: { before?: string; after?: string }) => {
    const newEntry: AuditLogEntry = {
      id: `aud-${Date.now()}`,
      actor_name: role === 'Super Admin' ? 'Tariq Mansoor' : role === 'HR Admin' ? 'Ayesha Khan' : 'Current User',
      actor_email: role === 'Super Admin' ? 'tariq.mansoor@northwindstudios.com' : 'ayesha.khan@northwindstudios.com',
      action,
      entity,
      entity_id,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      ip: '110.37.19.42',
      details,
    };
    setAuditLogs((prev) => [newEntry, ...prev]);
  };

  // Add Employee
  const addEmployee = (empData: Omit<Employee, 'id' | 'employee_no' | 'direct_reports_count'>) => {
    const nextNum = employees.length + 1;
    const padNum = nextNum.toString().padStart(3, '0');
    const newEmp: Employee = {
      ...empData,
      id: `emp-${padNum}`,
      employee_no: `NW-${padNum}`,
      direct_reports_count: 0,
      avatar_url: empData.avatar_url || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
    };
    setEmployees((prev) => [newEmp, ...prev]);
    recordAudit('Added New Employee', 'Employee', newEmp.id, { after: `${newEmp.first_name} ${newEmp.last_name} (${newEmp.title})` });
    addToast('success', 'Employee Added', `${newEmp.first_name} ${newEmp.last_name} has been enrolled.`);
  };

  // Update Employee
  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === id ? { ...emp, ...updates } : emp))
    );
    recordAudit('Updated Employee Profile', 'Employee', id, { after: JSON.stringify(updates) });
    addToast('success', 'Profile Updated', 'Employee details were successfully saved.');
  };

  // Offboard Employee
  const offboardEmployee = (id: string, exitDate: string, reason?: string) => {
    const target = employees.find((e) => e.id === id);
    if (!target) return;
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === id ? { ...emp, status: 'Exited', exit_date: exitDate } : emp))
    );
    recordAudit('Offboarded Employee', 'Employee', id, { before: target.status, after: `Exited on ${exitDate}. Reason: ${reason || 'Voluntary'}` });
    addToast('warning', 'Employee Offboarded', `${target.first_name} ${target.last_name} marked as Exited.`);
  };

  // Leave Actions
  const approveLeaveRequest = (id: string, comment?: string) => {
    const req = leaveRequests.find((r) => r.id === id);
    if (!req) return;
    setLeaveRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'Approved',
              approver_name: role === 'Super Admin' ? 'Tariq Mansoor' : 'Ayesha Khan',
              decided_at: new Date().toISOString().substring(0, 10),
              comments: comment || r.comments,
            }
          : r
      )
    );
    recordAudit('Approved Leave Request', 'LeaveRequest', id, {
      before: 'Pending',
      after: `Approved ${req.days} days ${req.leave_type_name} for ${req.employee_name}`,
    });
    addToast('success', 'Leave Approved', `Leave request for ${req.employee_name} was approved.`);
  };

  const rejectLeaveRequest = (id: string, comment?: string) => {
    const req = leaveRequests.find((r) => r.id === id);
    if (!req) return;
    setLeaveRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'Rejected',
              approver_name: role === 'Super Admin' ? 'Tariq Mansoor' : 'Ayesha Khan',
              decided_at: new Date().toISOString().substring(0, 10),
              comments: comment || 'Policy capacity threshold reached.',
            }
          : r
      )
    );
    recordAudit('Rejected Leave Request', 'LeaveRequest', id, {
      before: 'Pending',
      after: `Rejected ${req.days} days ${req.leave_type_name} for ${req.employee_name}`,
    });
    addToast('danger', 'Leave Rejected', `Leave request for ${req.employee_name} was rejected.`);
  };

  const requestLeave = (req: {
    employee_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    days: number;
    reason: string;
  }) => {
    const emp = employees.find((e) => e.id === req.employee_id);
    const balance = mockLeaveBalances.find((b) => b.type_id === req.leave_type_id);
    const newReq: LeaveRequest = {
      id: `leave-${Date.now()}`,
      employee_id: req.employee_id,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : 'Current Employee',
      avatar_url: emp?.avatar_url,
      department: emp?.department_name || 'Engineering',
      leave_type_id: req.leave_type_id,
      leave_type_name: balance?.name || 'Annual Leave',
      start_date: req.start_date,
      end_date: req.end_date,
      days: req.days,
      reason: req.reason,
      status: 'Pending',
    };
    setLeaveRequests((prev) => [newReq, ...prev]);
    recordAudit('Submitted Leave Request', 'LeaveRequest', newReq.id, {
      after: `${newReq.days} days of ${newReq.leave_type_name}`,
    });
    addToast('info', 'Leave Submitted', 'Your leave request has been routed to HR for review.');
  };

  // Attendance Correction
  const addAttendanceCorrection = (correction: {
    employee_id: string;
    date: string;
    clock_in: string;
    clock_out: string;
    reason: string;
  }) => {
    const emp = employees.find((e) => e.id === correction.employee_id);
    const newRec: AttendanceRecord = {
      id: `att-${Date.now()}`,
      employee_id: correction.employee_id,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : 'Employee',
      department: emp?.department_name || 'Engineering',
      date: correction.date,
      clock_in: correction.clock_in,
      clock_out: correction.clock_out,
      hours: 9.0,
      status: 'Present',
      source: 'Web',
      notes: `Corrected: ${correction.reason}`,
      approved_by: 'HR Admin',
    };
    setAttendanceRecords((prev) => [newRec, ...prev]);
    recordAudit('Applied Attendance Correction', 'AttendanceRecord', newRec.id, {
      after: `${newRec.employee_name} clocked ${newRec.clock_in} - ${newRec.clock_out} on ${newRec.date}`,
    });
    addToast('success', 'Correction Logged', 'Attendance record updated and approved.');
  };

  // Payroll
  const createPayRun = (periodLabel: string, periodStart: string, periodEnd: string, payDate: string) => {
    const newRun: PayRun = {
      id: `pr-${Date.now()}`,
      period_label: periodLabel,
      period_start: periodStart,
      period_end: periodEnd,
      pay_date: payDate,
      status: 'Draft',
      employees_count: employees.filter((e) => e.status !== 'Exited').length,
      gross_total: 16850000,
      deductions_total: 2190500,
      net_total: 14659500,
      currency: 'PKR',
    };
    setPayRuns((prev) => [newRun, ...prev]);
    recordAudit('Created Pay Run', 'PayRun', newRun.id, { after: `${newRun.period_label} (Draft)` });
    addToast('info', 'Pay Run Drafted', `${periodLabel} pay run created. Review before approval.`);
  };

  const approvePayRun = (payRunId: string) => {
    setPayRuns((prev) =>
      prev.map((p) => (p.id === payRunId ? { ...p, status: 'Approved', approved_by: 'Tariq Mansoor' } : p))
    );
    recordAudit('Approved Pay Run', 'PayRun', payRunId, { after: 'Status: Approved' });
    addToast('success', 'Pay Run Approved', 'Pay run is approved and queued for bank disbursement.');
  };

  const markPayRunPaid = (payRunId: string) => {
    setPayRuns((prev) =>
      prev.map((p) =>
        p.id === payRunId
          ? {
              ...p,
              status: 'Paid',
              paid_at: new Date().toISOString().replace('T', ' ').substring(0, 16),
            }
          : p
      )
    );
    recordAudit('Finalized & Disbursed Pay Run', 'PayRun', payRunId, { after: 'Status: Paid' });
    addToast('success', 'Disbursement Complete', 'All payslips generated and salaries disbursed.');
  };

  // Recruitment
  const moveCandidateStage = (candidateId: string, targetStage: CandidateStage) => {
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand) return;
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, stage: targetStage, days_in_stage: 0 } : c))
    );
    recordAudit('Moved Candidate Stage', 'Candidate', candidateId, {
      before: cand.stage,
      after: targetStage,
    });
    addToast('info', 'Candidate Moved', `${cand.name} moved to ${targetStage}.`);
  };

  const addCandidateNote = (candidateId: string, note: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, notes: [...c.notes, note] } : c))
    );
    addToast('success', 'Note Added', 'Candidate interview log updated.');
  };

  const addJobOpening = (job: Omit<JobOpening, 'id' | 'opened_at' | 'applicants_count'>) => {
    const newJob: JobOpening = {
      ...job,
      id: `job-${Date.now()}`,
      opened_at: new Date().toISOString().substring(0, 10),
      applicants_count: 0,
    };
    setJobOpenings((prev) => [newJob, ...prev]);
    recordAudit('Created Job Opening', 'JobOpening', newJob.id, { after: newJob.title });
    addToast('success', 'Job Published', `${newJob.title} is now open for applicants.`);
  };

  const addCandidate = (cand: Omit<Candidate, 'id' | 'days_in_stage' | 'applied_date' | 'notes'>) => {
    const newCand: Candidate = {
      ...cand,
      id: `cand-${Date.now()}`,
      days_in_stage: 0,
      applied_date: new Date().toISOString().substring(0, 10),
      notes: [],
    };
    setCandidates((prev) => [newCand, ...prev]);
    addToast('success', 'Candidate Added', `${newCand.name} enrolled in pipeline.`);
  };

  // Goals
  const updateGoalProgress = (goalId: string, newProgress: number) => {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? {
              ...g,
              progress: newProgress,
              status: newProgress >= 100 ? 'Completed' : newProgress > 70 ? 'On track' : newProgress > 40 ? 'At risk' : 'Behind',
            }
          : g
      )
    );
    addToast('success', 'Goal Updated', 'Key result milestone recorded.');
  };

  const addGoal = (goal: Omit<Goal, 'id'>) => {
    const newGoal: Goal = {
      ...goal,
      id: `goal-${Date.now()}`,
    };
    setGoals((prev) => [newGoal, ...prev]);
    addToast('success', 'Goal Created', `${newGoal.title} registered.`);
  };

  // Workplace
  const uploadDocument = (doc: Omit<DocumentItem, 'id' | 'uploaded_at'>) => {
    const newDoc: DocumentItem = {
      ...doc,
      id: `doc-${Date.now()}`,
      uploaded_at: new Date().toISOString().substring(0, 10),
    };
    setDocuments((prev) => [newDoc, ...prev]);
    recordAudit('Uploaded Document', 'Document', newDoc.id, { after: `${newDoc.name} for ${newDoc.employee_name}` });
    addToast('success', 'Document Stored', `${newDoc.name} uploaded successfully.`);
  };

  const assignAsset = (assetId: string, employeeId: string, employeeName: string) => {
    setAssets((prev) =>
      prev.map((a) =>
        a.id === assetId
          ? {
              ...a,
              assigned_to: employeeId,
              assigned_to_name: employeeName,
              assigned_at: new Date().toISOString().substring(0, 10),
              status: 'Assigned',
            }
          : a
      )
    );
    recordAudit('Assigned Asset', 'Asset', assetId, { after: `Assigned to ${employeeName}` });
    addToast('success', 'Asset Assigned', `Device assigned to ${employeeName}.`);
  };

  const returnAsset = (assetId: string) => {
    const target = assets.find((a) => a.id === assetId);
    setAssets((prev) =>
      prev.map((a) =>
        a.id === assetId
          ? {
              ...a,
              assigned_to: undefined,
              assigned_to_name: undefined,
              assigned_at: undefined,
              status: 'Available',
            }
          : a
      )
    );
    recordAudit('Returned Asset to Inventory', 'Asset', assetId, { before: target?.assigned_to_name });
    addToast('info', 'Asset Returned', 'Device marked available in inventory.');
  };

  const createAnnouncement = (ann: Omit<Announcement, 'id' | 'published_at' | 'read_count'>) => {
    const newAnn: Announcement = {
      ...ann,
      id: `ann-${Date.now()}`,
      published_at: new Date().toISOString().replace('T', ' ').substring(0, 16),
      read_count: 1,
    };
    setAnnouncements((prev) => [newAnn, ...prev]);
    recordAudit('Published Announcement', 'Announcement', newAnn.id, { after: newAnn.title });
    addToast('success', 'Announcement Sent', 'Broadcasted across Northwind Studios.');
  };

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        employees,
        departments,
        locations,
        leaveRequests,
        attendanceRecords,
        payRuns,
        payslips,
        candidates,
        jobOpenings,
        interviews,
        goals,
        documents,
        assets,
        announcements,
        auditLogs,
        leaveBalances,

        toasts,
        addToast,
        removeToast,

        addEmployee,
        updateEmployee,
        offboardEmployee,

        approveLeaveRequest,
        rejectLeaveRequest,
        requestLeave,

        addAttendanceCorrection,

        createPayRun,
        approvePayRun,
        markPayRunPaid,

        moveCandidateStage,
        addCandidateNote,
        addJobOpening,
        addCandidate,

        updateGoalProgress,
        addGoal,

        uploadDocument,
        assignAsset,
        returnAsset,
        createAnnouncement,

        isCommandPaletteOpen,
        setIsCommandPaletteOpen,

        isSidebarCollapsed,
        setIsSidebarCollapsed,
        isMobileNavOpen,
        setIsMobileNavOpen,

        isAddEmployeeDrawerOpen,
        setIsAddEmployeeDrawerOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

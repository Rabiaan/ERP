export type UserRole = 'Super Admin' | 'HR Admin' | 'Manager' | 'Employee';

export type EmploymentStatus = 'Active' | 'Probation' | 'On leave' | 'Exited';
export type EmploymentType = 'Full-time' | 'Part-time' | 'Contract' | 'Internship';

export interface Department {
  id: string;
  name: string;
  code: string;
  head_employee_id: string;
  head_name?: string;
  employee_count: number;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  timezone: string;
  country: string;
  is_headquarters?: boolean;
}

export interface Employee {
  id: string;
  employee_no: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  avatar_url?: string;
  dob: string;
  gender: 'Female' | 'Male' | 'Non-binary' | 'Prefer not to say';
  address: string;
  department_id: string;
  department_name: string;
  title: string;
  manager_id?: string;
  manager_name?: string;
  location_id: string;
  location_name: string;
  employment_type: EmploymentType;
  status: EmploymentStatus;
  hire_date: string;
  probation_end?: string;
  exit_date?: string;
  salary_base: number;
  emergency_contact: {
    name: string;
    relationship: string;
    phone: string;
  };
  direct_reports_count: number;
}

export type AttendanceStatus = 'Present' | 'Late' | 'Absent' | 'Remote';
export type AttendanceSource = 'Biometric' | 'Web' | 'Mobile';

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  avatar_url?: string;
  department: string;
  date: string; // YYYY-MM-DD
  clock_in?: string; // HH:mm
  clock_out?: string; // HH:mm
  hours: number;
  status: AttendanceStatus;
  source: AttendanceSource;
  notes?: string;
  approved_by?: string;
}

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  avatar_url?: string;
  department: string;
  leave_type_id: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  approver_id?: string;
  approver_name?: string;
  decided_at?: string;
  comments?: string;
}

export interface LeaveBalance {
  type_id: string;
  name: string;
  total_quota: number;
  used: number;
  pending: number;
  remaining: number;
  color: string;
}

export type PayRunStatus = 'Draft' | 'Processing' | 'Approved' | 'Paid';

export interface PayRun {
  id: string;
  period_label: string; // e.g. "October 2026"
  period_start: string;
  period_end: string;
  pay_date: string;
  status: PayRunStatus;
  employees_count: number;
  gross_total: number;
  deductions_total: number;
  net_total: number;
  currency: string;
  approved_by?: string;
  paid_at?: string;
}

export interface Payslip {
  id: string;
  pay_run_id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  title: string;
  base: number;
  allowances: number;
  tax_deduction: number;
  pension_deduction: number;
  gross: number;
  net: number;
  currency: string;
  payment_method: string;
  status: 'Paid' | 'Processing' | 'Pending';
}

export interface SalaryStructure {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  title: string;
  base: number;
  allowances: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  gross: number;
  net: number;
  currency: string;
  effective_from: string;
}

export type CandidateStage = 'Applied' | 'Screening' | 'Interview' | 'Offer' | 'Hired' | 'Rejected';

export interface JobOpening {
  id: string;
  title: string;
  department_id: string;
  department_name: string;
  location_id: string;
  location_name: string;
  type: EmploymentType;
  status: 'Open' | 'Interviewing' | 'On hold' | 'Closed';
  hiring_manager_name: string;
  opened_at: string;
  applicants_count: number;
  experience_level: string;
}

export interface Candidate {
  id: string;
  job_id: string;
  job_title: string;
  name: string;
  email: string;
  phone: string;
  stage: CandidateStage;
  source: string;
  rating: number; // 1-5
  days_in_stage: number;
  applied_date: string;
  resume_summary: string;
  notes: string[];
}

export interface Interview {
  id: string;
  candidate_id: string;
  candidate_name: string;
  job_title: string;
  interviewer_name: string;
  scheduled_at: string;
  mode: 'Video Call' | 'In-Person' | 'Technical Lab';
  meet_link?: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  score?: number;
  feedback?: string;
}

export interface Goal {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  title: string;
  description: string;
  category: 'Strategic' | 'Operational' | 'Individual Growth' | 'Leadership';
  progress: number; // 0-100
  due_date: string;
  status: 'On track' | 'At risk' | 'Behind' | 'Completed';
}

export interface ReviewCycle {
  id: string;
  name: string;
  period: string;
  status: 'Active' | 'Upcoming' | 'Closed';
  participants_count: number;
  completed_count: number;
  due_date: string;
}

export interface DocumentItem {
  id: string;
  employee_id: string;
  employee_name: string;
  type: 'Contract' | 'Passport' | 'Tax ID' | 'Degree' | 'NDA' | 'Medical Cert';
  name: string;
  file_size: string;
  uploaded_by: string;
  uploaded_at: string;
  expires_at?: string;
  status: 'Valid' | 'Expiring soon' | 'Expired';
}

export interface Asset {
  id: string;
  tag: string;
  type: 'Laptop' | 'Monitor' | 'Desk Phone' | 'Ergonomic Chair' | 'Key Card' | 'Tablet';
  model: string;
  serial: string;
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_at?: string;
  condition: 'Excellent' | 'Good' | 'Fair' | 'Needs repair';
  status: 'Assigned' | 'Available' | 'In maintenance' | 'Decommissioned';
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  author_name: string;
  author_role: string;
  published_at: string;
  pinned: boolean;
  read_count: number;
}

export interface AuditLogEntry {
  id: string;
  actor_name: string;
  actor_email: string;
  action: string;
  entity: string;
  entity_id: string;
  timestamp: string;
  ip: string;
  details?: {
    before?: string;
    after?: string;
  };
}

export interface OnboardingHire {
  id: string;
  employee_id: string;
  name: string;
  role: string;
  department: string;
  start_date: string;
  avatar_url?: string;
  stage: 'Offer signed' | 'Documents' | 'Equipment' | 'Induction' | 'Complete';
  progress: number;
  checklist: {
    id: string;
    task: string;
    completed: boolean;
    owner: string;
    due_date: string;
  }[];
}

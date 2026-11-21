import {
  Activity,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  ClipboardList,
  Clock3,
  Copy,
  CreditCard,
  FileClock,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  GraduationCap,
  HardHat,
  LayoutDashboard,
  LifeBuoy,
  Package,
  ReceiptText,
  RotateCcw,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Users,
  UserCog,
  Wallet,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  children?: NavItem[];
  end?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const platformNav: NavSection[] = [
  {
    title: 'Control plane',
    items: [
      { to: '/platform', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/platform/clients', label: 'Clients', icon: Building2 },
      { to: '/platform/modules', label: 'Module catalog', icon: Package },
      { to: '/platform/modules/instances', label: 'All modules', icon: FolderKanban },
      { to: '/platform/provisioning', label: 'Provisioning', icon: Activity },
      { to: '/platform/plans', label: 'Plans & usage', icon: BadgeDollarSign },
    ],
  },
  {
    title: 'Governance',
    items: [
      { to: '/platform/access-log', label: 'Access log', icon: ShieldCheck },
      { to: '/platform/audit', label: 'Audit trail', icon: ScrollText },
      { to: '/platform/health', label: 'System health', icon: LifeBuoy },
      { to: '/platform/platform-users', label: 'Platform users', icon: UserCog },
    ],
  },
];

const adminSubmenu = (module: string): NavItem[] => [
  { to: `/w/${module}/administration/users`, label: 'Users', icon: Users, permission: 'administration.users.manage' },
  { to: `/w/${module}/administration/roles`, label: 'Roles & permissions', icon: ShieldCheck, permission: 'administration.roles.manage' },
  { to: `/w/${module}/administration/company`, label: 'Company profile', icon: Building2, permission: 'administration.company.manage' },
  { to: `/w/${module}/administration/branches`, label: 'Branches & warehouses', icon: Waypoints, permission: 'administration.branches.manage' },
  { to: `/w/${module}/administration/tax`, label: 'Tax settings', icon: ReceiptText, permission: 'administration.tax.manage' },
  { to: `/w/${module}/administration/audit`, label: 'Audit log', icon: FileClock, permission: 'administration.audit.view' },
];

const resource = (module: string, segment: string, label: string, icon: LucideIcon): NavItem => ({
  to: `/w/${module}/${segment}`,
  label,
  icon,
  permission: `${module}.${segment.replace(/-/g, '_')}.view`,
});

export function workspaceNav(module: string): NavSection[] {
  if (module === 'retail') {
    return [
      {
        title: 'Retail',
        items: [
          { to: '/w/retail/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'retail.dashboard.view', end: true },
          { to: '/w/retail/administration/users', label: 'Administration', icon: Settings2, children: adminSubmenu('retail') },
          resource('retail', 'products', 'Products', Package),
          resource('retail', 'customers', 'Customers', Users),
          resource('retail', 'vendors', 'Vendors', BriefcaseBusiness),
          resource('retail', 'stock', 'Stock', ClipboardList),
          resource('retail', 'expenses', 'Expenses', CreditCard),
          { to: '/w/retail/duplicate-bill', label: 'Duplicate Bill', icon: Copy, permission: 'retail.invoices.create' },
          resource('retail', 'invoices', 'Invoice', FileText),
          resource('retail', 'sales', 'Sales View', BarChart3),
          resource('retail', 'refunds', 'Itemwise Refund', RotateCcw),
          resource('retail', 'banks', 'Banks', Banknote),
          resource('retail', 'purchase-returns', 'Purchase Return', ShoppingCart),
          resource('retail', 'salesmen', 'Salesman', UserCog),
        ],
      },
    ];
  }

  if (module === 'hr') {
    return [
      {
        title: 'People',
        items: [
          { to: '/w/hr/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'hr.dashboard.view', end: true },
          { to: '/w/hr/employees', label: 'Employees', icon: Users, permission: 'hr.employees.view' },
          { to: '/w/hr/org-chart', label: 'Org chart', icon: Waypoints, permission: 'hr.employees.view' },
          { to: '/w/hr/onboarding', label: 'Onboarding', icon: BriefcaseBusiness, permission: 'hr.employees.view' },
          { to: '/w/hr/attendance', label: 'Attendance', icon: Clock3, permission: 'hr.attendance.view' },
          { to: '/w/hr/leave', label: 'Leave', icon: CalendarCheck, permission: 'hr.leave.view' },
          { to: '/w/hr/payroll', label: 'Payroll', icon: Wallet, permission: 'hr.payroll.view' },
          { to: '/w/hr/recruitment', label: 'Recruitment', icon: UserCog, permission: 'hr.job_openings.view' },
          { to: '/w/hr/performance', label: 'Performance', icon: BarChart3, permission: 'hr.goals.view' },
          { to: '/w/hr/workplace', label: 'Workplace', icon: Building2, permission: 'hr.documents.view' },
          { to: '/w/hr/reports', label: 'Reports', icon: FileSpreadsheet, permission: 'hr.reports.export' },
          { to: '/w/hr/administration/users', label: 'Administration', icon: Settings2, children: adminSubmenu('hr') },
        ],
      },
    ];
  }

  if (module === 'school') {
    return [
      {
        title: 'School',
        items: [
          { to: '/w/school/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'school.dashboard.view', end: true },
          resource('school', 'students', 'Students', GraduationCap),
          resource('school', 'guardians', 'Guardians', Users),
          resource('school', 'classes', 'Classes', BookOpen),
          resource('school', 'subjects', 'Subjects', BookOpen),
          resource('school', 'attendance', 'Attendance', CalendarCheck),
          resource('school', 'exams', 'Exams', ClipboardList),
          resource('school', 'grades', 'Grades', BarChart3),
          resource('school', 'fee-invoices', 'Fees', ReceiptText),
          resource('school', 'staff', 'Staff', HardHat),
          resource('school', 'timetable', 'Timetable', Clock3),
          resource('school', 'transport-routes', 'Transport', Waypoints),
          resource('school', 'admissions', 'Admissions', FileText),
          { to: '/w/school/administration/users', label: 'Administration', icon: Settings2, children: adminSubmenu('school') },
        ],
      },
    ];
  }

  return [
    {
      title: 'Accounts',
      items: [
        { to: '/w/accounts/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'accounts.dashboard.view', end: true },
        resource('accounts', 'chart-of-accounts', 'Chart of accounts', ScrollText),
        resource('accounts', 'journals', 'Journals', FileText),
        resource('accounts', 'ledgers', 'Ledgers', BarChart3),
        resource('accounts', 'ar-open-items', 'Receivables', ReceiptText),
        resource('accounts', 'ap-open-items', 'Payables', ReceiptText),
        resource('accounts', 'bank-accounts', 'Banks', Banknote),
        resource('accounts', 'fiscal-periods', 'Fiscal periods', CalendarCheck),
        { to: '/w/accounts/administration/users', label: 'Administration', icon: Settings2, children: adminSubmenu('accounts') },
      ],
    },
  ];
}

export const HR_LEGACY_ROUTES = [
  'employees',
  'org-chart',
  'onboarding',
  'attendance',
  'leave',
  'payroll',
  'recruitment',
  'performance',
  'workplace',
  'reports',
  'settings',
];

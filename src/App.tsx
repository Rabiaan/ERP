/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './components/shell/AppShell';
import { PermissionGate, StatePanel } from './components/common/Ui';
import { platformNav, workspaceNav, HR_LEGACY_ROUTES } from './lib/nav';
import type { ModuleKey } from './api/types';

import { AcceptInvitePage, ForgotPasswordPage, LoginPage } from './pages/auth/AuthPages';
import {
  AccessLogPage,
  ClientDetailPage,
  ClientNewPage,
  ClientsPage,
  ModuleInstancesPage,
  ModulesPage,
  PlatformAuditPage,
  PlatformDeniedPage,
  PlatformFallbackPage,
  PlatformHealthPage,
  PlatformOverviewPage,
  PlatformUsersPage,
  PlansPage,
  ProvisioningPage,
} from './pages/platform/PlatformPages';
import { WorkspaceAdminPage } from './pages/workspace/AdminPages';
import {
  DuplicateBillPage,
  HrPrototypeRoute,
  ResourcePage,
  WorkspaceDashboardPage,
  WorkspaceFallbackPage,
} from './pages/workspace/WorkspacePages';
import { EmployeeDetailPage } from './pages/EmployeeDetailPage';

const MODULE_KEYS: ModuleKey[] = ['hr', 'retail', 'school', 'accounts'];

const RESOURCE_TITLES: Record<string, string> = {
  products: 'Products',
  customers: 'Customers',
  vendors: 'Vendors',
  stock: 'Stock',
  expenses: 'Expenses',
  invoices: 'Invoice',
  sales: 'Sales View',
  refunds: 'Itemwise Refund',
  banks: 'Banks',
  'purchase-returns': 'Purchase Return',
  salesmen: 'Salesman',
  students: 'Students',
  guardians: 'Guardians',
  classes: 'Classes',
  subjects: 'Subjects',
  attendance: 'Attendance',
  exams: 'Exams',
  grades: 'Grades',
  'fee-invoices': 'Fees',
  staff: 'Staff',
  timetable: 'Timetable',
  'transport-routes': 'Transport',
  admissions: 'Admissions',
  'chart-of-accounts': 'Chart of accounts',
  journals: 'Journals',
  ledgers: 'Ledgers',
  'ar-open-items': 'Receivables',
  'ap-open-items': 'Payables',
  'bank-accounts': 'Banks',
  'fiscal-periods': 'Fiscal periods',
};

const READ_ONLY_RESOURCES = new Set([
  'sales',
  'stock-movements',
  'admissions',
  'ar-open-items',
  'ap-open-items',
  'ledgers',
  'payslips',
  'journal-lines',
]);

function FullPageState({ title, message }: { title: string; message?: string }) {
  return (
    <div className="app-canvas flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <StatePanel kind="loading" title={title} message={message} />
      </div>
    </div>
  );
}

function currentUrl(location: ReturnType<typeof useLocation>): string {
  return `${location.pathname}${location.search}`;
}

function RequireAuth({ scope, children }: { scope: 'platform' | 'workspace'; children: React.ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'booting') {
    return <FullPageState title="Checking your session" message="Loading your workspace…" />;
  }

  if (auth.status !== 'authenticated') {
    const realm = scope === 'platform' ? 'platform' : 'tenant';
    const params = new URLSearchParams({ realm, next: currentUrl(location) });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }

  if (scope === 'platform' && auth.realm !== 'platform') {
    return <PlatformDeniedPage />;
  }

  if (scope === 'workspace' && !auth.workspace) {
    return (
      <StatePanel
        kind="denied"
        title="No workspace selected"
        message="Open a client module from the platform console, or sign in to a client workspace."
        action={<a href="/platform" className="mt-2 text-xs font-medium text-[#5F57C4] hover:underline">Go to platform console</a>}
      />
    );
  }

  return <>{children}</>;
}

function HomeRedirect() {
  const auth = useAuth();

  if (auth.status === 'booting') return <FullPageState title="Checking your session" message="Loading Lilac Office…" />;
  if (auth.status !== 'authenticated') return <Navigate to="/login" replace />;
  if (auth.realm === 'platform') return <Navigate to="/platform" replace />;
  return <Navigate to={`/w/${auth.workspace?.activeModule ?? auth.user?.active_module ?? 'hr'}/dashboard`} replace />;
}

function PlatformRoute() {
  return (
    <RequireAuth scope="platform">
      <AppShell kind="platform" sections={platformNav}>
        <Routes>
          <Route index element={<PlatformOverviewPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/new" element={<ClientNewPage />} />
          <Route path="clients/:clientId" element={<ClientDetailPage />} />
          <Route path="modules" element={<ModulesPage />} />
          <Route path="modules/instances" element={<ModuleInstancesPage />} />
          <Route path="provisioning" element={<ProvisioningPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="access-log" element={<AccessLogPage />} />
          <Route path="audit" element={<PlatformAuditPage />} />
          <Route path="health" element={<PlatformHealthPage />} />
          <Route path="platform-users" element={<PlatformUsersPage />} />
          <Route path="*" element={<PlatformFallbackPage />} />
        </Routes>
      </AppShell>
    </RequireAuth>
  );
}

function ResourceRoute({ module }: { module: ModuleKey }) {
  const { resource = '' } = useParams();
  const title = RESOURCE_TITLES[resource] ?? resource.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return (
    <ResourcePage
      module={module}
      resource={resource}
      title={title}
      readOnly={READ_ONLY_RESOURCES.has(resource)}
    />
  );
}

function WorkspaceRoute() {
  const { module = '' } = useParams();
  if (!MODULE_KEYS.includes(module as ModuleKey)) return <Navigate to="/" replace />;
  const key = module as ModuleKey;

  return (
    <RequireAuth scope="workspace">
      <AppShell kind="workspace" sections={workspaceNav(key)}>
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <PermissionGate permission={`${key}.dashboard.view`}>
                <WorkspaceDashboardPage />
              </PermissionGate>
            }
          />
          <Route path="administration" element={<Navigate to="administration/users" replace />} />
          <Route path="administration/:adminSection" element={<AdminRoute module={key} />} />
          <Route
            path="duplicate-bill"
            element={
              key === 'retail' ? <DuplicateBillPage /> : <WorkspaceFallbackPage />
            }
          />
          {HR_LEGACY_ROUTES.filter((screen) => screen !== 'settings').map((screen) => (
            <Route
              key={screen}
              path={screen}
              element={key === 'hr' ? <HrPrototypeRoute screen={screen} /> : <ResourceRoute module={key} />}
            />
          ))}
          {key === 'hr' ? <Route path="employees/:id" element={<EmployeeDetailPage />} /> : null}
          <Route path=":resource" element={<ResourceRoute module={key} />} />
          <Route path="*" element={<WorkspaceFallbackPage />} />
        </Routes>
      </AppShell>
    </RequireAuth>
  );
}

function AdminRoute({ module }: { module: ModuleKey }) {
  const { adminSection = 'users' } = useParams();
  return <WorkspaceAdminPage module={module} section={adminSection} />;
}

function LegacyAlias() {
  const { screen = '' } = useParams();
  return <Navigate to={`/w/hr/${screen}`} replace />;
}

function LegacyEmployeeAlias() {
  const { id = '' } = useParams();
  return <Navigate to={`/w/hr/employees/${id}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            <Route path="/platform/*" element={<PlatformRoute />} />
            <Route path="/w/:module/*" element={<WorkspaceRoute />} />

            <Route path="/" element={<HomeRedirect />} />
            <Route path="employees/:id" element={<LegacyEmployeeAlias />} />
            {HR_LEGACY_ROUTES.map((screen) => (
              <Route key={screen} path={screen} element={<LegacyAlias />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

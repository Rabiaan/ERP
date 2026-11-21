export type Realm = 'platform' | 'tenant';
export type ModuleKey = 'hr' | 'retail' | 'school' | 'accounts';

export interface ApiEnvelope<T> {
  data: T;
  meta?: { page: number; per_page: number; total: number };
}

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  realm: Realm;
  status: string;
  mfa_enabled: boolean;
  must_change_password: boolean;
  client_id: string | null;
  active_module: string | null;
  memberships: Array<{ module_key: string; role: string; permissions_hash: string }>;
}

export interface SessionData {
  user: SessionUser;
  access_expires_in: number;
  refresh_expires_in: number;
  csrf_token: string;
}

export interface PlatformMe {
  user: {
    id: string;
    email: string;
    full_name: string;
    mfa_enabled: boolean;
    must_change_password: boolean;
    last_login_at: string | null;
  };
  permissions: string[];
}

export interface WorkspaceMe {
  mode: 'tenant' | 'platform';
  reason: string | null;
  accessId: string | null;
  user: { id: string; email: string | null };
  client: { id: string; name: string; slug: string; status: string } | null;
  modules: Array<{ module_key: string; status: string; name: string }>;
  activeModule: string;
  permissions: string[];
}

export interface DashboardCard {
  key: string;
  label: string;
  value: number | string;
  permission: string;
  href: string;
}

export interface ListResponse<T> {
  data: T[];
  meta: { page: number; per_page: number; total: number };
}

export interface PlatformOverview {
  clients: number;
  active_clients: number;
  active_modules: number;
  active_users: number;
  pending_jobs: number;
  failed_jobs: number;
  audit_events_24h: number;
  tenant_pools: number;
  clients_by_status: Array<{ status: string; count: number }>;
  modules_by_status: Array<{ status: string; count: number }>;
  recent_activity: Array<{
    id: string;
    actor_type: string;
    actor_id: string;
    client_id: string | null;
    action: string;
    entity: string;
    entity_id: string | null;
    created_at: string;
  }>;
}

export type Row = Record<string, unknown>;

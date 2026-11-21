export const REALMS = ['platform', 'tenant'] as const;

export type Realm = (typeof REALMS)[number];

export function isRealm(value: string | undefined): value is Realm {
  return value !== undefined && (REALMS as readonly string[]).includes(value);
}

export type MembershipClaim = {
  module_key: string;
  role: string;
  permissions_hash: string;
};

export type AccessClaims = {
  sub: string;
  sid: string;
  actor_type: Realm;
  realm: Realm;
  client_id: string | null;
  memberships: MembershipClaim[];
  active_module: string | null;
  platform_override: boolean;
  impersonated_by: string | null;
  must_change_password: boolean;
};

export type MfaChallengeClaims = {
  sub: string;
  realm: Realm;
  purpose: 'mfa';
  client_id: string | null;
  active_module: string | null;
};

export type AuthUserRecord = {
  id: string;
  email: string;
  full_name: string;
  password_hash: string | null;
  status: 'invited' | 'active' | 'suspended' | 'disabled';
  mfa_enabled: boolean;
  mfa_secret_enc: string | null;
  must_change_password: boolean;
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
};

export type TenantMembership = {
  clientId: string;
  clientName: string;
  moduleKey: string;
  role: string;
  permissionsHash: string;
};

export type AuthContext = {
  sessionId: string;
  realm: Realm;
  userId: string;
  csrfSecret: string;
  claims: AccessClaims;
};

export type SessionRecord = {
  id: string;
  actor_type: Realm;
  realm: Realm;
  user_id: string;
  refresh_token_hash: string;
  csrf_secret: string;
  expires_at: Date;
  refresh_expires_at: Date;
  revoked_at: Date | null;
  client_id: string | null;
  active_module: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
  last_used_at: Date | null;
};

export type AuthUserView = {
  id: string;
  email: string;
  full_name: string;
  realm: Realm;
  status: string;
  mfa_enabled: boolean;
  must_change_password: boolean;
  client_id: string | null;
  active_module: string | null;
  memberships: MembershipClaim[];
};

export type AuthResponse = {
  user: AuthUserView;
  access_expires_in: number;
  refresh_expires_in: number;
  csrf_token: string;
};

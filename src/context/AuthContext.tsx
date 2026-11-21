import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  apiRequest,
  errorMessage,
  setActiveRealm,
  setCsrfToken,
} from '../api/client';
import type { ModuleKey, PlatformMe, Realm, SessionData, SessionUser, WorkspaceMe } from '../api/types';

export type AuthStatus =
  | 'booting'
  | 'guest'
  | 'password-change'
  | 'mfa-required'
  | 'mfa-enroll'
  | 'authenticated';

export interface MfaChallenge {
  challenge_token: string;
  enrollment_required: boolean;
  otpauth_uri?: string;
}

export interface AccessInput {
  clientId: string;
  moduleKey: ModuleKey;
  mode: 'inspect' | 'support';
  reason: string;
}

interface AuthContextValue {
  status: AuthStatus;
  realm: Realm;
  user: SessionUser | null;
  platform: PlatformMe | null;
  workspace: WorkspaceMe | null;
  challenge: MfaChallenge | null;
  otpauthUri: string | null;
  error: string | null;
  clearError: () => void;
  login: (input: {
    realm: Realm;
    email: string;
    password: string;
    clientId?: string;
    moduleKey?: ModuleKey;
  }) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  enrollMfa: () => Promise<void>;
  confirmMfa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  enterAccess: (input: AccessInput) => Promise<void>;
  exitAccess: () => Promise<void>;
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function realmFromPath(): Realm | null {
  const path = window.location.pathname;
  if (path.startsWith('/platform')) return 'platform';
  if (path.startsWith('/w/')) return 'tenant';
  return null;
}

function matchesPermission(granted: string[], permission: string): boolean {
  if (granted.includes('*') || granted.includes(permission)) return true;
  const prefix = permission.split('.')[0];
  return Boolean(prefix && granted.includes(`${prefix}.*`));
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('booting');
  const [realm, setRealm] = useState<Realm>('tenant');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [platform, setPlatform] = useState<PlatformMe | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceMe | null>(null);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bootId = useRef(0);
  const passwordRef = useRef<string | null>(null);

  const loadContexts = useCallback(async (activeRealm: Realm, nextUser: SessionUser) => {
    setUser(nextUser);
    setRealm(activeRealm);
    setActiveRealm(activeRealm);

    if (nextUser.must_change_password) {
      setStatus('password-change');
      return;
    }

    if (activeRealm === 'platform') {
      setWorkspace(null);
      try {
        const me = await apiRequest<PlatformMe>('/api/platform/me', { realm: 'platform' });
        setPlatform(me);
        if (!me.user.mfa_enabled) {
          setStatus('mfa-enroll');
          return;
        }
        setStatus('authenticated');
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 403) {
          setStatus('mfa-enroll');
          return;
        }
        throw reason;
      }
      return;
    }

    setPlatform(null);
    const me = await apiRequest<WorkspaceMe>('/api/workspace/me', { realm: 'tenant' });
    setWorkspace(me);
    setStatus('authenticated');
  }, []);

  const settleSession = useCallback(
    async (session: SessionData) => {
      setCsrfToken(session.csrf_token);
      setChallenge(null);
      setError(null);
      await loadContexts(session.user.realm, session.user);
    },
    [loadContexts],
  );

  const reload = useCallback(async () => {
    const id = ++bootId.current;
    setStatus('booting');
    setError(null);
    try {
      const pathRealm = realmFromPath();
      const realms: Realm[] = pathRealm === 'tenant'
        ? ['tenant', 'platform']
        : pathRealm
          ? [pathRealm]
          : ['platform', 'tenant'];
      for (const candidate of realms) {
        try {
          const result = await apiRequest<{ user: SessionUser }>(`/api/auth/${candidate}/me`, {
            realm: candidate,
            skipRefresh: true,
          });
          if (id !== bootId.current) return;
          setActiveRealm(candidate);
          if (candidate === 'platform' && pathRealm === 'tenant') {
            setUser(result.user);
            setRealm('platform');
            setPlatform(null);
            const me = await apiRequest<WorkspaceMe>('/api/workspace/me', {
              realm: 'platform',
              skipRefresh: true,
            });
            if (id !== bootId.current) return;
            setWorkspace(me);
            setStatus('authenticated');
            return;
          }
          await loadContexts(candidate, result.user);
          return;
        } catch (reason) {
          if (!(reason instanceof ApiError && reason.status === 401)) throw reason;
        }
      }
      if (id !== bootId.current) return;
      setUser(null);
      setPlatform(null);
      setWorkspace(null);
      setStatus('guest');
    } catch (reason) {
      if (id !== bootId.current) return;
      setError(errorMessage(reason));
      setStatus('guest');
    }
  }, [loadContexts]);

  useEffect(() => {
    void reload();
    const onUnauthenticated = () => {
      setUser(null);
      setWorkspace(null);
      setPlatform(null);
      setStatus('guest');
    };
    window.addEventListener('lilac:unauthenticated', onUnauthenticated);
    return () => window.removeEventListener('lilac:unauthenticated', onUnauthenticated);
  }, [reload]);

  const login = useCallback<AuthContextValue['login']>(
    async (input) => {
      setError(null);
      setActiveRealm(input.realm);
      setRealm(input.realm);
      passwordRef.current = input.password;
      try {
        const session = await apiRequest<SessionData>(`/api/auth/${input.realm}/login`, {
          method: 'POST',
          realm: input.realm,
          skipCsrf: true,
          skipRefresh: true,
          body: {
            email: input.email,
            password: input.password,
            ...(input.clientId ? { client_id: input.clientId } : {}),
            ...(input.moduleKey ? { module_key: input.moduleKey } : {}),
          },
        });
        await settleSession(session);
      } catch (reason) {
        if (reason instanceof ApiError && reason.code === 'MFA_REQUIRED') {
          const details = (reason.details ?? {}) as Partial<MfaChallenge>;
          setChallenge({
            challenge_token: String(details.challenge_token ?? ''),
            enrollment_required: Boolean(details.enrollment_required),
            otpauth_uri: details.otpauth_uri,
          });
          setStatus('mfa-required');
          setError(null);
          return;
        }
        passwordRef.current = null;
        setError(errorMessage(reason));
        throw reason;
      }
    },
    [settleSession],
  );

  const verifyMfa = useCallback<AuthContextValue['verifyMfa']>(
    async (code) => {
      if (!challenge?.challenge_token) throw new Error('No MFA challenge is active.');
      setError(null);
      try {
        const session = await apiRequest<SessionData>(`/api/auth/${realm}/mfa/verify`, {
          method: 'POST',
          realm,
          skipRefresh: true,
          body: { challenge_token: challenge.challenge_token, code },
        });
        await settleSession(session);
      } catch (reason) {
        setError(errorMessage(reason));
        throw reason;
      }
    },
    [challenge, realm, settleSession],
  );

  const changePassword = useCallback<AuthContextValue['changePassword']>(
    async (current, next) => {
      setError(null);
      try {
        await apiRequest(`/api/auth/${realm}/password/change`, {
          method: 'POST',
          realm,
          body: { current_password: current, new_password: next },
        });
        passwordRef.current = next;
        await reload();
      } catch (reason) {
        setError(errorMessage(reason));
        throw reason;
      }
    },
    [realm, reload],
  );

  const enrollMfa = useCallback(async () => {
    setError(null);
    try {
      const result = await apiRequest<{ otpauth_uri: string }>('/api/auth/platform/mfa/enroll', {
        method: 'POST',
        realm: 'platform',
      });
      setOtpauthUri(result.otpauth_uri);
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    }
  }, []);

  const confirmMfa = useCallback<AuthContextValue['confirmMfa']>(
    async (code) => {
      setError(null);
      try {
        await apiRequest('/api/auth/platform/mfa/confirm', {
          method: 'POST',
          realm: 'platform',
          body: { code },
        });
        await reload();
      } catch (reason) {
        setError(errorMessage(reason));
        throw reason;
      }
    },
    [reload],
  );

  const logout = useCallback<AuthContextValue['logout']>(async () => {
    const active = realm;
    try {
      if (status !== 'guest' && status !== 'booting') {
        await apiRequest(`/api/auth/${active}/logout`, {
          method: 'POST',
          realm: active,
          skipRefresh: true,
        });
      }
    } catch {
      setError(null);
    }
    setCsrfToken(null);
    passwordRef.current = null;
    setUser(null);
    setPlatform(null);
    setWorkspace(null);
    setChallenge(null);
    setOtpauthUri(null);
    setStatus('guest');
  }, [realm, status]);

  const enterAccess = useCallback<AuthContextValue['enterAccess']>(async (input) => {
    setError(null);
    await apiRequest('/api/platform/access/enter', {
      method: 'POST',
      realm: 'platform',
      body: {
        client_id: input.clientId,
        module_key: input.moduleKey,
        mode: input.mode,
        reason: input.reason,
      },
    });
    const me = await apiRequest<WorkspaceMe>('/api/workspace/me', {
      realm: 'platform',
      skipRefresh: true,
    });
    setWorkspace(me);
  }, []);

  const exitAccess = useCallback<AuthContextValue['exitAccess']>(async () => {
    if (workspace?.accessId) {
      try {
        await apiRequest('/api/platform/access/exit', {
          method: 'POST',
          realm: 'platform',
          body: { access_id: workspace.accessId },
        });
      } catch {
        setError(null);
      }
    }
    setWorkspace(null);
  }, [workspace?.accessId]);

  const permissions = useMemo(() => {
    if (workspace?.mode === 'platform') return ['*'];
    if (workspace || realm === 'tenant') return workspace?.permissions ?? [];
    return platform?.permissions ?? [];
  }, [platform?.permissions, realm, workspace]);

  const can = useCallback(
    (permission: string) => matchesPermission(permissions, permission),
    [permissions],
  );
  const canAny = useCallback(
    (items: string[]) => items.some((item) => matchesPermission(permissions, item)),
    [permissions],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      realm,
      user,
      platform,
      workspace,
      challenge,
      otpauthUri,
      error,
      clearError: () => setError(null),
      login,
      verifyMfa,
      changePassword,
      enrollMfa,
      confirmMfa,
      logout,
      reload,
      enterAccess,
      exitAccess,
      can,
      canAny,
    }),
    [
      status,
      realm,
      user,
      platform,
      workspace,
      challenge,
      otpauthUri,
      error,
      login,
      verifyMfa,
      changePassword,
      enrollMfa,
      confirmMfa,
      logout,
      reload,
      enterAccess,
      exitAccess,
      can,
      canAny,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

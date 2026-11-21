import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { apiRequest, errorMessage } from '../../api/client';
import type { ModuleKey, Realm } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { Card, Field, StatePanel, inputClass } from '../../components/common/Ui';

function destination(realm: Realm, activeModule: string | null, next: string | null): string {
  if (next?.startsWith('/')) return next;
  if (activeModule) return `/w/${activeModule}/dashboard`;
  return realm === 'platform' ? '/platform' : '/w/retail/dashboard';
}

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [realm, setRealm] = useState<Realm>(params.get('realm') === 'platform' ? 'platform' : 'tenant');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const moduleParam = params.get('module');

  const activeModule = useMemo<ModuleKey | undefined>(() => {
    if (moduleParam && ['hr', 'retail', 'school', 'accounts'].includes(moduleParam)) {
      return moduleParam as ModuleKey;
    }
    return undefined;
  }, [moduleParam]);

  useEffect(() => {
    if (auth.status !== 'authenticated') return;
    const target = destination(
      auth.realm,
      auth.workspace?.activeModule ?? auth.user?.active_module ?? null,
      next,
    );
    navigate(target, { replace: true });
  }, [auth.realm, auth.status, auth.user?.active_module, auth.workspace?.activeModule, navigate, next]);

  useEffect(() => {
    if (auth.status !== 'mfa-enroll' || auth.otpauthUri) return;
    void auth.enrollMfa().catch(() => undefined);
  }, [auth]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLocalError(null);
    try {
      await auth.login({ realm, email, password, moduleKey: realm === 'tenant' ? activeModule : undefined });
    } catch (reason) {
      setLocalError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLocalError(null);
    try {
      await auth.verifyMfa(code);
    } catch (reason) {
      setLocalError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLocalError(null);
    try {
      await auth.changePassword(currentPassword || password, newPassword);
    } catch (reason) {
      setLocalError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function submitMfaConfirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLocalError(null);
    try {
      await auth.confirmMfa(code);
    } catch (reason) {
      setLocalError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  if (auth.status === 'booting') {
    body = <StatePanel kind="loading" title="Checking your session" message="One moment…" />;
  } else if (auth.status === 'mfa-required') {
    body = (
      <form onSubmit={(event) => void submitMfa(event)} className="space-y-4">
        <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#F2F0FB] text-[#5F57C4]">
          <KeyRound className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-xl font-medium">Two-factor verification</h2>
          <p className="mt-1 text-xs text-[#6B6A85]">Enter the six-digit code from your authenticator app.</p>
        </div>
        <Field label="Verification code" htmlFor="mfa-code">
          <input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            className={inputClass}
            required
          />
        </Field>
        {localError ?? auth.error ? (
          <p role="alert" className="text-xs text-[#C93B40]">{localError ?? auth.error}</p>
        ) : null}
        <button type="submit" disabled={busy} className="h-12 w-full rounded-full bg-[#0E0E12] text-sm font-medium text-white hover:bg-[#1C1C24] disabled:opacity-50">
          {busy ? 'Verifying…' : 'Verify and continue'}
        </button>
      </form>
    );
  } else if (auth.status === 'password-change') {
    body = (
      <form onSubmit={(event) => void submitPassword(event)} className="space-y-4">
        <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#FFF4DC] text-[#A9751C]">
          <LockKeyhole className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-xl font-medium">Set a new password</h2>
          <p className="mt-1 text-xs text-[#6B6A85]">
            Your demo or temporary password must be changed before continuing. Use at least 12 characters.
          </p>
        </div>
        <Field label="Current password" htmlFor="current-password">
          <input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={inputClass} required />
        </Field>
        <Field label="New password" htmlFor="new-password">
          <input id="new-password" type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputClass} required />
        </Field>
        {localError ?? auth.error ? (
          <p role="alert" className="text-xs text-[#C93B40]">{localError ?? auth.error}</p>
        ) : null}
        <button type="submit" disabled={busy} className="h-12 w-full rounded-full bg-[#0E0E12] text-sm font-medium text-white hover:bg-[#1C1C24] disabled:opacity-50">
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    );
  } else if (auth.status === 'mfa-enroll') {
    body = (
      <form onSubmit={(event) => void submitMfaConfirm(event)} className="space-y-4">
        <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#F2F0FB] text-[#5F57C4]">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-xl font-medium">Secure the Super Admin</h2>
          <p className="mt-1 text-xs text-[#6B6A85]">
            Platform administrators require two-factor authentication. Scan the setup key with an authenticator app, then confirm a code.
          </p>
        </div>
        {auth.otpauthUri ? (
          <div className="break-all rounded-[14px] bg-[#F7F6FC] p-3 text-[11px] text-[#4B4A60]">{auth.otpauthUri}</div>
        ) : (
          <button type="button" onClick={() => void auth.enrollMfa()} className="text-xs font-medium text-[#5F57C4] hover:underline">
            Generate setup key
          </button>
        )}
        <Field label="Verification code" htmlFor="mfa-confirm">
          <input
            id="mfa-confirm"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            className={inputClass}
            required
          />
        </Field>
        {localError ?? auth.error ? (
          <p role="alert" className="text-xs text-[#C93B40]">{localError ?? auth.error}</p>
        ) : null}
        <button type="submit" disabled={busy} className="h-12 w-full rounded-full bg-[#0E0E12] text-sm font-medium text-white hover:bg-[#1C1C24] disabled:opacity-50">
          {busy ? 'Confirming…' : 'Enable two-factor'}
        </button>
      </form>
    );
  } else {
    body = (
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-medium">Sign in to Lilac Office</h2>
          <p className="mt-1 text-xs text-[#6B6A85]">Use your platform or workspace credentials.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-full bg-[#F5F3FB] p-1" role="group" aria-label="Sign-in realm">
          {(['tenant', 'platform'] as Realm[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRealm(item)}
              aria-pressed={realm === item}
              className={`h-9 rounded-full text-xs font-medium capitalize transition ${realm === item ? 'bg-white text-[#0E0E12] shadow-sm' : 'text-[#6B6A85]'}`}
            >
              {item === 'tenant' ? 'Client workspace' : 'Platform console'}
            </button>
          ))}
        </div>
        <Field label="Email" htmlFor="login-email">
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className={inputClass}
            required
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
            required
          />
        </Field>
        {realm === 'tenant' && activeModule ? (
          <p className="rounded-[14px] bg-[#F5F3FB] p-3 text-xs text-[#6B6A85]">
            Signing in to the <strong className="font-medium text-[#0E0E12]">{activeModule}</strong> module.
          </p>
        ) : null}
        {localError ?? auth.error ? (
          <p role="alert" className="text-xs text-[#C93B40]">{localError ?? auth.error}</p>
        ) : null}
        <button type="submit" disabled={busy} className="h-12 w-full rounded-full bg-[#0E0E12] text-sm font-medium text-white hover:bg-[#1C1C24] disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="flex items-center justify-between text-[11px] text-[#6B6A85]">
          <a href="/forgot-password" className="hover:text-[#0E0E12] hover:underline">Forgot password?</a>
          <a href="/accept-invite" className="hover:text-[#0E0E12] hover:underline">Accept an invite</a>
        </div>
      </form>
    );
  }

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-[linear-gradient(160deg,#A9A3F5_0%,#7F77E0_100%)] font-display text-base font-semibold text-white">
            L
          </div>
          <span className="font-display text-lg font-semibold">Lilac Office</span>
        </div>
        <Card className="p-6 sm:p-8">{body}</Card>
        <p className="mt-4 text-center text-[11px] text-[#9A99AA]">
          Multi-tenant ERP · Database-per-client-per-module
        </p>
      </div>
    </div>
  );
}

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest('/api/auth/invite/accept', {
        method: 'POST',
        skipCsrf: true,
        skipRefresh: true,
        body: { token, password, full_name: fullName },
      });
      navigate('/login', { replace: true });
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-[440px] p-6 sm:p-8">
        <h1 className="font-display text-xl font-medium">Accept your invite</h1>
        <p className="mb-5 mt-1 text-xs text-[#6B6A85]">Choose a password and finish setting up your account.</p>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <Field label="Invite token" htmlFor="invite-token">
            <input id="invite-token" value={token} onChange={(event) => setToken(event.target.value)} className={inputClass} required />
          </Field>
          <Field label="Full name" htmlFor="invite-name">
            <input id="invite-name" value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass} required />
          </Field>
          <Field label="Password" htmlFor="invite-password">
            <input id="invite-password" type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} required />
          </Field>
          {message ? <p role="alert" className="text-xs text-[#C93B40]">{message}</p> : null}
          <button type="submit" disabled={busy} className="h-12 w-full rounded-full bg-[#0E0E12] text-sm font-medium text-white hover:bg-[#1C1C24] disabled:opacity-50">
            {busy ? 'Saving…' : 'Set password'}
          </button>
        </form>
      </Card>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/api/auth/password/forgot', {
        method: 'POST',
        skipCsrf: true,
        skipRefresh: true,
        body: { email },
      });
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-[440px] p-6 sm:p-8">
        <h1 className="font-display text-xl font-medium">Reset your password</h1>
        <p className="mb-5 mt-1 text-xs text-[#6B6A85]">
          We will send a reset link if an account exists for that address.
        </p>
        {sent ? (
          <StatePanel title="Check your inbox" message="If the address is registered, a reset link is on its way." />
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <Field label="Email" htmlFor="forgot-email">
              <input id="forgot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} required />
            </Field>
            <button type="submit" disabled={busy} className="h-12 w-full rounded-full bg-[#0E0E12] text-sm font-medium text-white hover:bg-[#1C1C24] disabled:opacity-50">
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <a href="/login" className="block text-center text-[11px] text-[#6B6A85] hover:underline">Back to sign in</a>
          </form>
        )}
      </Card>
    </div>
  );
}

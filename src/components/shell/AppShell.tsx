import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  Search,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { ModuleKey } from '../../api/types';
import type { NavItem, NavSection } from '../../lib/nav';
import { Modal, PillBadge, inputClass } from '../common/Ui';

interface ShellProps {
  kind: 'platform' | 'workspace';
  sections: NavSection[];
  children?: ReactNode;
}

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flatten(item.children) : [])]);
}

export function AppShell({ kind, sections, children }: ShellProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchModule, setSwitchModule] = useState<string>('');
  const [switchMode, setSwitchMode] = useState<'inspect' | 'support'>('inspect');
  const [switchReason, setSwitchReason] = useState('');
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    mainRef.current?.focus();
    setNavOpen(false);
  }, [pathname]);

  const visibleSections = useMemo<NavSection[]>(() => {
    if (kind === 'platform') {
      const allowed = (item: NavItem) => {
        if (item.to.endsWith('/audit') && !auth.can('platform.audit.view')) return false;
        if (item.to.endsWith('/access-log') && !auth.can('platform.modules.access')) return false;
        if (item.to.endsWith('/platform-users') && !auth.can('platform.users.manage')) return false;
        if (item.to.endsWith('/plans') && !auth.can('platform.plans.manage')) return false;
        if (item.to.endsWith('/provisioning') && !auth.can('platform.provisioning.manage')) return false;
        if (item.to.endsWith('/modules') && !auth.can('platform.modules.manage')) return false;
        if (item.to.endsWith('/clients') && !auth.can('platform.clients.view')) return false;
        return true;
      };
      return sections
        .map((section) => ({ ...section, items: section.items.filter(allowed) }))
        .filter((section) => section.items.length > 0);
    }
    return sections
      .map((section) => ({
        ...section,
        items: section.items
          .filter((item) => !item.permission || auth.can(item.permission))
          .map((item) =>
            item.children
              ? { ...item, children: item.children.filter((child) => !child.permission || auth.can(child.permission)) }
              : item,
          )
          .filter((item) => !item.children || item.children.length > 0),
      }))
      .filter((section) => section.items.length > 0);
  }, [auth, kind, sections]);

  const mobileItems = useMemo(() => flatten(visibleSections.flatMap((section) => section.items)), [visibleSections]);

  const displayName = auth.user?.full_name ?? auth.workspace?.user.email ?? auth.platform?.user.full_name ?? 'User';
  const displayRole =
    auth.workspace?.mode === 'platform'
      ? `Platform ${auth.workspace.reason ? 'support' : 'inspect'}`
      : auth.realm === 'platform'
        ? 'Super Admin'
        : (auth.user?.memberships.find((item) => item.module_key === auth.workspace?.activeModule)?.role ?? 'Workspace user');

  async function onLogout() {
    await auth.logout();
    navigate('/login', { replace: true });
  }

  async function onSwitchSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSwitchError(null);
    const moduleKey = switchModule as ModuleKey;
    if (!moduleKey) return;
    if (auth.workspace?.mode === 'platform' && auth.workspace.client) {
      try {
        await auth.enterAccess({
          clientId: auth.workspace.client.id,
          moduleKey,
          mode: switchMode,
          reason: switchReason,
        });
        setSwitchOpen(false);
        navigate(`/w/${moduleKey}/dashboard`);
      } catch (reason) {
        setSwitchError(reason instanceof Error ? reason.message : 'Unable to switch module.');
      }
      return;
    }
    const email = auth.user?.email ?? '';
    await auth.logout();
    const params = new URLSearchParams({ realm: 'tenant', module: moduleKey, email });
    navigate(`/login?${params.toString()}`, { replace: true });
  }

  function renderNavItem(item: NavItem, depth = 0, keyPrefix = ''): React.ReactNode {
    const Icon: LucideIcon = item.icon;
    const content = (
      <>
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.children ? <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden /> : null}
      </>
    );
    const classes = ({ isActive }: { isActive: boolean }) =>
      [
        'flex h-10 items-center gap-3 rounded-full px-3.5 text-[13px] transition-colors',
        isActive && !item.children
          ? 'bg-[#F4F3FB] font-medium text-[#0E0E12]'
          : 'text-[#6B6A85] hover:bg-[#F8F7FD] hover:text-[#0E0E12]',
        depth > 0 ? 'ml-3 h-9 text-[12px]' : '',
      ].join(' ');

    return (
      <li key={`${keyPrefix}-${item.to}-${depth}`}>
        <NavLink to={item.to} end={item.end} className={classes} onClick={() => setNavOpen(false)}>
          {content}
        </NavLink>
        {item.children ? (
          <ul className="mt-1 space-y-0.5">
            {item.children.map((child, index) => renderNavItem(child, depth + 1, `${keyPrefix}-${item.to}-${index}`))}
          </ul>
        ) : null}
      </li>
    );
  }

  const switchModules = (auth.workspace?.modules ?? []).filter((item) =>
    auth.workspace?.mode === 'platform' || auth.can(`${item.module_key}.dashboard.view`),
  );

  const sidebar = (
    <aside className="hidden h-[calc(100vh-32px)] w-[272px] shrink-0 flex-col rounded-[24px] bg-white/95 p-4 shadow-[0_1px_2px_rgba(30,25,80,.04),0_8px_24px_rgba(30,25,80,.05)] backdrop-blur lg:sticky lg:top-4 lg:flex xl:w-[280px]">
      <div className="flex items-center gap-3 px-2 pb-5 pt-1">
        <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-[linear-gradient(160deg,#A9A3F5_0%,#7F77E0_100%)] font-display text-base font-semibold text-white">
          L
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] font-semibold">Lilac Office</p>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-[#9A99AA]">
            {kind === 'platform' ? 'Control plane' : (auth.workspace?.client?.name ?? 'Workspace')}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="mb-2 px-3 text-[11px] text-[#B9B9C6]">{section.title}</p>
            <ul className="space-y-0.5" aria-label={section.title}>
              {section.items.map((item, index) => renderNavItem(item, 0, `${section.title}-${index}`))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[#F0EEF7] pt-3">
        <button
          type="button"
          onClick={() => void onLogout()}
          className="flex h-10 w-full items-center gap-3 rounded-full px-3.5 text-[13px] text-[#6B6A85] hover:bg-[#FDECEC] hover:text-[#C93B40]"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden />
          Logout
        </button>
      </div>
    </aside>
  );

  return (
    <div className="app-canvas min-h-screen text-[#0E0E12]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-[#0E0E12] focus:px-4 focus:py-2 focus:text-xs focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex w-full max-w-[1680px] gap-4 p-4 pb-24 lg:pb-4">
        {sidebar}
        <main id="main-content" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <header className="mb-5 flex min-h-12 flex-wrap items-center gap-3">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm lg:hidden"
              onClick={() => setNavOpen((open) => !open)}
              aria-expanded={navOpen}
              aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
            >
              {navOpen ? <X className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </button>
            <div className="hidden h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/70 px-4 text-[#9A99AA] shadow-sm sm:flex">
              <Search className="h-4 w-4" aria-hidden />
              <span className="truncate text-xs">
                {kind === 'platform' ? 'Search clients, modules, audit' : `Search ${auth.workspace?.activeModule ?? 'workspace'}`}
              </span>
            </div>
            {kind === 'workspace' && auth.workspace ? (
              <button
                type="button"
                onClick={() => {
                  setSwitchModule(auth.workspace?.activeModule ?? '');
                  setSwitchError(null);
                  setSwitchOpen(true);
                }}
                className="flex h-10 items-center gap-2 rounded-full bg-white px-3.5 text-xs font-medium shadow-sm hover:bg-[#F8F7FD]"
              >
                {auth.workspace.client?.name ?? 'Workspace'}
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
            <div className="ml-auto flex h-10 items-center gap-2 rounded-full bg-white px-2 pr-3.5 shadow-sm">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[linear-gradient(160deg,#FFD9C7_0%,#F3A6A6_100%)] text-[10px] font-semibold text-[#7A3D3D]">
                {displayName.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-[150px] truncate text-[12px] font-medium">{displayName}</span>
                <span className="block max-w-[150px] truncate text-[10px] capitalize text-[#9A99AA]">{displayRole}</span>
              </span>
            </div>
          </header>

          {kind === 'workspace' && auth.workspace?.mode === 'platform' ? (
            <div className="mb-5 flex flex-col gap-3 rounded-[20px] border border-dashed border-[#C9C2F2] bg-[#F2F0FB]/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#5F57C4]" aria-hidden />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      Platform {auth.workspace.reason ? 'support' : 'inspect'} mode
                    </p>
                    <PillBadge tone={auth.workspace.reason ? 'warning' : 'info'}>
                      {auth.workspace.reason ? 'support' : 'inspect'}
                    </PillBadge>
                  </div>
                  <p className="mt-0.5 text-xs text-[#6B6A85]">
                    {auth.workspace.reason ?? 'Read-only access. Mutations are blocked.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await auth.exitAccess();
                  navigate('/platform');
                }}
                className="h-9 shrink-0 rounded-full bg-white px-4 text-xs font-medium shadow-sm hover:bg-[#F8F7FD]"
              >
                Exit access
              </button>
            </div>
          ) : null}

          {navOpen ? (
            <nav aria-label="Mobile navigation" className="mb-5 rounded-[20px] bg-white p-3 shadow-sm lg:hidden">
              <ul className="space-y-0.5">
                {mobileItems.map((item, index) => renderNavItem(item, 0, `mobile-${index}`))}
              </ul>
            </nav>
          ) : null}

          {children ?? <Outlet />}
        </main>
      </div>

      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-2 bottom-2 z-30 flex gap-1 overflow-x-auto rounded-full bg-white/95 p-1.5 shadow-[0_8px_24px_rgba(30,25,80,.12)] backdrop-blur lg:hidden"
      >
        {mobileItems.slice(0, 8).map((item, index) => {
          const Icon: LucideIcon = item.icon;
          return (
            <NavLink
              key={`quick-${index}`}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-w-[70px] flex-col items-center gap-1 rounded-full px-3 py-2 text-[10px] ${
                  isActive ? 'bg-[#F4F3FB] font-medium text-[#0E0E12]' : 'text-[#6B6A85]'
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="max-w-[72px] truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <Modal open={switchOpen} title="Switch module" onClose={() => setSwitchOpen(false)}>
        <form onSubmit={(event) => void onSwitchSubmit(event)} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#4B4A60]">Module</span>
            <select
              value={switchModule}
              onChange={(event) => setSwitchModule(event.target.value)}
              className={inputClass}
            >
              {switchModules.map((item) => (
                <option key={item.module_key} value={item.module_key}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {auth.workspace?.mode === 'platform' ? (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#4B4A60]">Mode</span>
                <select
                  value={switchMode}
                  onChange={(event) => setSwitchMode(event.target.value as 'inspect' | 'support')}
                  className={inputClass}
                >
                  <option value="inspect">Inspect (read-only)</option>
                  <option value="support">Support (write access)</option>
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#4B4A60]">Reason</span>
                <input
                  value={switchReason}
                  onChange={(event) => setSwitchReason(event.target.value)}
                  placeholder="Ticket or incident reference"
                  className={inputClass}
                />
              </label>
            </>
          ) : (
            <p className="rounded-[14px] bg-[#F5F3FB] p-3 text-xs text-[#6B6A85]">
              Switching tenant modules requires signing in again to reissue a scoped session.
            </p>
          )}
          {switchError ? <p role="alert" className="text-xs text-[#C93B40]">{switchError}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSwitchOpen(false)} className="h-10 rounded-full px-4 text-xs font-medium text-[#6B6A85] hover:bg-[#F5F3FB]">
              Cancel
            </button>
            <button type="submit" className="h-10 rounded-full bg-[#0E0E12] px-5 text-xs font-medium text-white hover:bg-[#1C1C24]">
              Switch
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

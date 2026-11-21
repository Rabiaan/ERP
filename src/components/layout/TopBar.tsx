import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  Command,
  Laptop,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { UserRole } from '../../types';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
};

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    title: 'Approval needed',
    message: '3 leave requests are waiting for your review',
    time: '5m ago',
    unread: true,
  },
  {
    id: '2',
    title: 'Asset assigned',
    message: 'MacBook Pro 16" assigned to Sarah Chen',
    time: '2h ago',
    unread: true,
  },
  {
    id: '3',
    title: 'New employee onboarding',
    message: 'David Kim completed his first-week checklist',
    time: '1d ago',
    unread: false,
  },
];

const ROLES: { id: UserRole; label: string }[] = [
  { id: 'Super Admin', label: 'Super Admin' },
  { id: 'HR Admin', label: 'HR Admin' },
  { id: 'Manager', label: 'Manager' },
  { id: 'Employee', label: 'Employee' },
];

const PAGE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/employees': 'Employee Directory',
  '/org-chart': 'Org Chart',
  '/onboarding': 'Onboarding Pipeline',
  '/attendance': 'Attendance',
  '/leave': 'Leave & Time Off',
  '/payroll': 'Payroll & Compensation',
  '/recruitment': 'Recruitment & Talent',
  '/performance': 'Performance & Reviews',
  '/workplace': 'Workplace & Documents',
  '/reports': 'Reports & Analytics',
  '/settings': 'Settings',
};

const MOBILE_LINKS = Object.entries(PAGE_LABELS);

export const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const {
    role,
    setRole,
    setIsCommandPaletteOpen,
    setIsAddEmployeeDrawerOpen,
  } = useApp();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const searchRef = useRef<HTMLInputElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((item) => item.unread).length;
  const currentPage =
    PAGE_LABELS[pathname] ??
    (pathname.startsWith('/employees/') ? PAGE_LABELS['/employees'] : 'Workspace');
  const roleLabel = ROLES.find((item) => item.id === role)?.label ?? 'People Ops Lead';

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
      if (roleRef.current && !roleRef.current.contains(event.target as Node)) {
        setRoleOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const markRead = (id: string) => {
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, unread: false } : item))
    );
  };

  return (
    <header className="relative z-30 flex h-[76px] shrink-0 items-center justify-between rounded-[24px] border border-[#ECEBF3] bg-white/75 px-3 shadow-[0_1px_2px_rgba(30,25,80,0.03),0_8px_24px_rgba(30,25,80,0.03)] backdrop-blur-md sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          className="grid h-9 w-9 place-items-center rounded-full text-[#6B6A85] transition-colors hover:bg-[#F6F5FB] hover:text-[#0E0E12] lg:hidden"
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Command className="h-5 w-5" />}
        </button>

        <div className="hidden min-w-0 flex-col sm:flex">
          <div className="flex items-center gap-1.5 truncate text-[11px] text-[#6B6A85]">
            <span>Northwind Studios</span>
            <span className="text-[#D5D1F8]">/</span>
            <span className="text-[#6B6A85]">Workspace</span>
          </div>
          <div className="truncate text-[15px] font-medium leading-tight text-[#0E0E12]">
            {currentPage}
          </div>
        </div>

        {mobileOpen && (
          <div className="absolute left-0 right-0 top-full mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-[#ECEBF3] bg-white p-2 shadow-[0_12px_32px_rgba(30,25,80,0.12)] lg:hidden">
            {MOBILE_LINKS.map(([path, label]) => (
              <button
                key={path}
                type="button"
                onClick={() => {
                  navigate(path);
                  setMobileOpen(false);
                }}
                className={[
                  'w-full rounded-xl px-2 py-2 text-left text-xs transition-colors',
                  pathname === path
                    ? 'bg-[#F0EEFC] font-medium text-[#4B44A3]'
                    : 'text-[#6B6A85] hover:bg-[#F6F5FB] hover:text-[#0E0E12]',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {searchOpen ? (
          <div className="flex h-9 w-64 items-center gap-2 rounded-full border border-[#D5D1F8] bg-[#F6F5FB] px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#8D86EA]" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearchOpen(false);
                  setSearchQuery('');
                }
                if (event.key === 'Enter' && searchQuery.trim()) {
                  setIsCommandPaletteOpen(true);
                  setSearchOpen(false);
                  setSearchQuery('');
                }
              }}
              placeholder="Search employees, assets..."
              className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[#0E0E12] outline-none placeholder:text-[#6B6A85]"
            />
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery('');
              }}
              className="text-[#6B6A85] hover:text-[#0E0E12]"
              aria-label="Close search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden h-9 items-center gap-2 rounded-full border border-[#ECEBF3] bg-[#F8F7FC] px-3 text-[11px] text-[#6B6A85] transition-colors hover:border-[#D5D1F8] hover:text-[#0E0E12] md:flex"
          >
            <Search className="h-3.5 w-3.5" />
            Search anything...
            <kbd className="rounded border border-[#ECEBF3] bg-white px-1.5 py-0.5 text-[9px] text-[#6B6A85]">
              Ctrl K
            </kbd>
          </button>
        )}

        <button
          type="button"
          onClick={() => setIsAddEmployeeDrawerOpen(true)}
          className="hidden h-9 items-center gap-1.5 rounded-full bg-[#5F57C4] px-3.5 text-[11px] font-medium text-white shadow-[0_8px_18px_rgba(95,87,196,0.22)] transition-colors hover:bg-[#4B44A3] sm:flex"
        >
          <Plus className="h-3.5 w-3.5" />
          Quick create
        </button>

        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((open) => !open)}
            aria-label={`Notifications, ${unreadCount} unread`}
            aria-expanded={notifOpen}
            className="relative grid h-9 w-9 place-items-center rounded-full border border-[#ECEBF3] bg-white text-[#6B6A85] transition-colors hover:bg-[#F6F5FB] hover:text-[#0E0E12]"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#E35D63] px-1 text-[9px] font-semibold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-[300px] rounded-2xl border border-[#ECEBF3] bg-white p-2 shadow-[0_12px_32px_rgba(30,25,80,0.12)]">
              {notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => markRead(item.id)}
                  className="flex w-full gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[#F6F5FB]"
                >
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F0EEFC] text-[#5F57C4]">
                    {item.title === 'Asset assigned' ? (
                      <Laptop className="h-3.5 w-3.5" />
                    ) : item.title === 'Approval needed' ? (
                      <CalendarDays className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[11px] font-medium text-[#0E0E12]">
                        {item.title}
                      </span>
                      {item.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#5F57C4]" />}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[#6B6A85]">{item.message}</span>
                    <span className="mt-0.5 block text-[9px] text-[#6B6A85]">{item.time}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative" ref={roleRef}>
          <button
            type="button"
            onClick={() => setRoleOpen((open) => !open)}
            aria-label="AM Alex Morgan, account and role"
            aria-expanded={roleOpen}
            className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#FFD9C7] to-[#F3A6A6] text-[11px] font-semibold text-[#7A3D3D]"
          >
            AM
          </button>
          {roleOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl border border-[#ECEBF3] bg-white p-1.5 shadow-[0_12px_32px_rgba(30,25,80,0.12)]">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6B6A85]">
                Simulate role
              </div>
              {ROLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setRole(item.id);
                    setRoleOpen(false);
                  }}
                  className={[
                    'w-full rounded-xl px-2 py-2 text-left text-[11px] transition-colors',
                    item.id === role
                      ? 'bg-[#F0EEFC] font-medium text-[#4B44A3]'
                      : 'text-[#6B6A85] hover:bg-[#F6F5FB]',
                  ].join(' ')}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;

import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  CalendarCheck,
  Clock3,
  CreditCard,
  FileBox,
  LayoutDashboard,
  Network,
  Settings,
  Target,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { UserRole } from '../../types';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'Super Admin', label: 'Super Admin' },
  { value: 'HR Admin', label: 'HR Admin' },
  { value: 'Manager', label: 'Manager' },
  { value: 'Employee', label: 'Employee' },
];

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

function navGroups(pendingLeaves: number): { title: string; links: NavItem[] }[] {
  return [
    {
      title: 'Workspace',
      links: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/employees', label: 'Employee Directory', icon: Users },
        { to: '/org-chart', label: 'Org Chart', icon: Network },
        { to: '/onboarding', label: 'Onboarding Pipeline', icon: UserPlus },
        { to: '/attendance', label: 'Attendance', icon: Clock3 },
        { to: '/leave', label: 'Leave & Time Off', icon: CalendarCheck, badge: pendingLeaves },
      ],
    },
    {
      title: 'Operations',
      links: [
        { to: '/payroll', label: 'Payroll & Compensation', icon: CreditCard },
        { to: '/recruitment', label: 'Recruitment & Talent', icon: Briefcase },
        { to: '/performance', label: 'Performance & Reviews', icon: Target },
        { to: '/workplace', label: 'Workplace & Documents', icon: FileBox },
        { to: '/reports', label: 'Reports & Analytics', icon: BarChart3 },
      ],
    },
    {
      title: 'Administration',
      links: [{ to: '/settings', label: 'Settings', icon: Settings }],
    },
  ];
}

const Sidebar: React.FC = () => {
  const { role, setRole, leaveRequests } = useApp();
  const [roleOpen, setRoleOpen] = useState(false);
  const roleLabel = ROLES.find((item) => item.value === role)?.label ?? 'HR Admin';
  const pendingLeaves = leaveRequests.filter((request) => request.status === 'Pending').length;
  const groups = navGroups(pendingLeaves);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRoleOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <aside className="sticky top-5 hidden h-[calc(100vh-40px)] w-[248px] shrink-0 flex-col rounded-[28px] border border-[#ECEBF3] bg-white/80 p-4 shadow-[0_1px_2px_rgba(30,25,80,0.03),0_12px_36px_rgba(30,25,80,0.05)] backdrop-blur-xl lg:flex">
      <div className="flex items-center gap-3 px-2 pb-5 pt-1">
        <div className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#5F57C4] text-sm font-semibold text-white shadow-[0_8px_18px_rgba(95,87,196,0.25)]">
          L
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] font-semibold leading-tight">
            Lilac Office
          </div>
          <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-[#6B6A85]">
            People workspace
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {groups.map((group) => (
          <div key={group.title} className="mb-6">
            <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B6A85]">
              {group.title}
            </div>
            <nav className="flex flex-col gap-1" aria-label={group.title}>
              {group.links.map(({ to, label, icon: Icon, badge }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    [
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs transition-colors',
                      isActive
                        ? 'bg-[#F0EEFC] font-medium text-[#4B44A3]'
                        : 'text-[#6B6A85] hover:bg-[#F6F5FB] hover:text-[#0E0E12]',
                    ].join(' ')
                  }
                >
                  <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} />
                  <span className="truncate">{label}</span>
                  {badge ? (
                    <span className="ml-auto rounded-full bg-[#F0EEFC] px-2 py-0.5 text-[10px] font-semibold text-[#4B44A3]">
                      {badge}
                    </span>
                  ) : null}
                </NavLink>
              ))}
            </nav>
          </div>
        ))}
      </div>

      <div className="relative border-t border-[#ECEBF3] pt-3">
        {roleOpen && (
          <div className="absolute bottom-[70px] left-0 right-0 rounded-2xl border border-[#ECEBF3] bg-white p-1.5 shadow-[0_12px_32px_rgba(30,25,80,0.12)]">
            {ROLES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setRole(item.value);
                  setRoleOpen(false);
                }}
                className={[
                  'w-full rounded-xl px-3 py-2 text-left text-[11px] transition-colors',
                  item.value === role
                    ? 'bg-[#F0EEFC] font-medium text-[#4B44A3]'
                    : 'text-[#6B6A85] hover:bg-[#F6F5FB]',
                ].join(' ')}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setRoleOpen((open) => !open)}
          aria-expanded={roleOpen}
          className="flex w-full items-center gap-3 rounded-2xl bg-[#F8F7FC] p-2.5 text-left transition-colors hover:bg-[#F0EEFC]"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#FFD9C7] to-[#F3A6A6] text-[11px] font-semibold text-[#7A3D3D]">
            AM
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-[#0E0E12]">Alex Morgan</div>
            <div className="truncate text-[10px] text-[#6B6A85]">{roleLabel}</div>
          </div>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

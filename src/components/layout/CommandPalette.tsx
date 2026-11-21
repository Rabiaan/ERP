import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Users,
  LayoutDashboard,
  CalendarCheck,
  CreditCard,
  Briefcase,
  Target,
  FileBox,
  BarChart3,
  Settings,
  Plus,
  ArrowRight,
  UserPlus,
  Clock,
  Sparkles,
  Network,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../ui/Avatar';

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    employees,
    setIsAddEmployeeDrawerOpen,
  } = useApp();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const pages = [
    { label: 'Dashboard', path: '/', category: 'Pages', icon: <LayoutDashboard className="w-4 h-4 text-[#6D28D9]" /> },
    { label: 'Employee Directory', path: '/employees', category: 'Pages', icon: <Users className="w-4 h-4 text-[#6D28D9]" /> },
    { label: 'Org Chart', path: '/org-chart', category: 'Pages', icon: <Network className="w-4 h-4 text-[#6D28D9]" /> },
    { label: 'Onboarding Pipeline', path: '/onboarding', category: 'Pages', icon: <UserPlus className="w-4 h-4 text-[#6D28D9]" /> },
    { label: 'Attendance Management', path: '/attendance', category: 'Pages', icon: <Clock className="w-4 h-4 text-[#6D28D9]" /> },
    { label: 'Leave & Time Off', path: '/leave', category: 'Pages', icon: <CalendarCheck className="w-4 h-4 text-[#6D28D9]" /> },
    { label: 'Payroll & Compensation', path: '/payroll', category: 'Pages', icon: <CreditCard className="w-4 h-4 text-[#6D28D9]" /> },
    { label: 'Recruitment & Talent', path: '/recruitment', category: 'Pages', icon: <Briefcase className="w-4 h-4 text-[#6D28D9]" /> },
    { label: 'Performance & Reviews', path: '/performance', category: 'Pages', icon: <Target className="w-4 h-4 text-[#6D28D9]" /> },
    { label: 'Workplace & Documents', path: '/workplace', category: 'Pages', icon: <FileBox className="w-4 h-4 text-[#6D28D9]" /> },
    { label: 'Reports & Analytics', path: '/reports', category: 'Pages', icon: <BarChart3 className="w-4 h-4 text-[#6D28D9]" /> },
    { label: 'Company Settings', path: '/settings', category: 'Pages', icon: <Settings className="w-4 h-4 text-[#6D28D9]" /> },
  ];

  const actions = [
    {
      label: 'Add New Employee',
      category: 'Actions',
      icon: <UserPlus className="w-4 h-4 text-[#15803D]" />,
      action: () => {
        setIsCommandPaletteOpen(false);
        setIsAddEmployeeDrawerOpen(true);
      },
    },
    {
      label: 'Request Leave Application',
      category: 'Actions',
      icon: <CalendarCheck className="w-4 h-4 text-[#38BDF8]" />,
      action: () => {
        setIsCommandPaletteOpen(false);
        navigate('/leave');
      },
    },
    {
      label: 'Run New Payroll Batch',
      category: 'Actions',
      icon: <CreditCard className="w-4 h-4 text-[#6D28D9]" />,
      action: () => {
        setIsCommandPaletteOpen(false);
        navigate('/payroll');
      },
    },
  ];

  const matchedEmployees = employees
    .filter(
      (e) =>
        e.first_name.toLowerCase().includes(query.toLowerCase()) ||
        e.last_name.toLowerCase().includes(query.toLowerCase()) ||
        e.title.toLowerCase().includes(query.toLowerCase()) ||
        e.department_name.toLowerCase().includes(query.toLowerCase()) ||
        e.employee_no.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 5)
    .map((e) => ({
      label: `${e.first_name} ${e.last_name}`,
      subtitle: `${e.title} · ${e.department_name}`,
      category: 'Employees',
      icon: <Avatar name={`${e.first_name} ${e.last_name}`} src={e.avatar_url} size="sm" />,
      action: () => {
        setIsCommandPaletteOpen(false);
        navigate(`/employees/${e.id}`);
      },
    }));

  const matchedPages = pages
    .filter((p) => p.label.toLowerCase().includes(query.toLowerCase()))
    .map((p) => ({
      label: p.label,
      subtitle: p.path,
      category: p.category,
      icon: p.icon,
      action: () => {
        setIsCommandPaletteOpen(false);
        navigate(p.path);
      },
    }));

  const matchedActions = actions
    .filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
    .map((a) => ({
      label: a.label,
      subtitle: 'Execute action',
      category: a.category,
      icon: a.icon,
      action: a.action,
    }));

  const allItems = [...matchedActions, ...matchedEmployees, ...matchedPages];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, allItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + allItems.length) % Math.max(1, allItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        allItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      setIsCommandPaletteOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-[#1F1A2E]/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsCommandPaletteOpen(false);
      }}
    >
      <div className="w-full max-w-xl bg-white rounded-[20px] border border-[#ECE8F4] shadow-[0_24px_64px_rgba(63,29,122,0.18)] overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col">
        {/* Search Input Bar */}
        <div className="px-4 py-3 border-b border-[#ECE8F4] flex items-center gap-3">
          <Search className="w-5 h-5 text-[#928BA6]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, employee name, or page..."
            className="w-full text-sm text-[#1F1A2E] placeholder:text-[#928BA6] focus:outline-none bg-transparent"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-[#928BA6] bg-[#F7F5FB] border border-[#ECE8F4] rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 divide-y divide-[#F7F5FB]">
          {allItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#928BA6]">
              No results found for "{query}".
            </div>
          ) : (
            allItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item.category}-${item.label}-${idx}`}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-2.5 rounded-[12px] cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#F7F4FF] text-[#6D28D9]' : 'text-[#1F1A2E] hover:bg-[#FCFBFF]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">{item.icon}</div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{item.label}</div>
                      {item.subtitle && (
                        <div className="text-[10px] text-[#6B647F] truncate">{item.subtitle}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-medium text-[#928BA6] bg-white px-2 py-0.5 rounded-full border border-[#ECE8F4]">
                      {item.category}
                    </span>
                    {isSelected && <ArrowRight className="w-3.5 h-3.5 text-[#6D28D9]" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-[#ECE8F4] bg-[#FCFBFF] text-[11px] text-[#928BA6] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
          </div>
          <span>Northwind Studios ERP</span>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { cn } from '../../lib/utils';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'underline' | 'pill';
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className,
  variant = 'underline',
}) => {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center overflow-x-auto no-scrollbar',
        variant === 'underline' ? 'border-b border-[#ECE8F4] gap-6' : 'bg-[#F7F5FB] p-1 rounded-[12px] gap-1',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        if (variant === 'pill') {
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-[10px] transition-all cursor-pointer whitespace-nowrap',
                isActive
                  ? 'bg-white text-[#6D28D9] shadow-xs'
                  : 'text-[#6B647F] hover:text-[#1F1A2E]'
              )}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums',
                    isActive ? 'bg-[#EFE9FE] text-[#6D28D9]' : 'bg-[#ECE8F4] text-[#6B647F]'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        }

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap relative',
              isActive
                ? 'border-[#6D28D9] text-[#6D28D9]'
                : 'border-transparent text-[#6B647F] hover:text-[#1F1A2E] hover:border-[#DCD5EA]'
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums',
                  isActive ? 'bg-[#EFE9FE] text-[#6D28D9]' : 'bg-[#F7F5FB] text-[#6B647F]'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

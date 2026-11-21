import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  actions: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
  }[];
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  onClear,
  actions,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1F1A2E] text-white px-5 py-3 rounded-full shadow-[0_16px_40px_rgba(31,26,46,0.3)] border border-[#3F1D7A] flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-center gap-2 pr-3 border-r border-[#6B647F]/40 text-xs font-medium">
        <span className="w-5 h-5 rounded-full bg-[#8B5CF6] text-white flex items-center justify-center text-[10px] font-bold">
          {selectedCount}
        </span>
        <span>{selectedCount} selected</span>
        <button
          onClick={onClear}
          className="text-[#928BA6] hover:text-white ml-1 p-0.5 rounded cursor-pointer"
          aria-label="Clear selection"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {actions.map((act, idx) => (
          <Button
            key={idx}
            size="sm"
            variant={act.variant || 'secondary'}
            onClick={act.onClick}
            leftIcon={act.icon}
            className={
              act.variant === 'secondary' || !act.variant
                ? 'bg-white/10 hover:bg-white/20 text-white border-transparent'
                : undefined
            }
          >
            {act.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

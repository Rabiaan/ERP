import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'md' | 'lg'; // 420px or 560px
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Scrim */}
      <div
        className="fixed inset-0 bg-[#1F1A2E]/35 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            'w-screen bg-white border-l border-[#ECE8F4] shadow-2xl flex flex-col transform transition-transform ease-out duration-200 animate-in slide-in-from-right',
            size === 'lg' ? 'max-w-[560px]' : 'max-w-[420px]'
          )}
        >
          {/* Sticky Header */}
          <div className="px-6 py-4 border-b border-[#ECE8F4] flex items-center justify-between bg-white shrink-0">
            <div>
              <h2 className="text-base font-semibold text-[#1F1A2E]">{title}</h2>
              {description && <p className="text-xs text-[#6B647F] mt-0.5">{description}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close drawer"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#928BA6] hover:text-[#1F1A2E] hover:bg-[#F7F4FF] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6">{children}</div>

          {/* Sticky Footer */}
          {footer && (
            <div className="px-6 py-4 border-t border-[#ECE8F4] bg-[#FCFBFF] flex items-center justify-end gap-3 shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

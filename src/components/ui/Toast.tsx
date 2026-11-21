import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { cn } from '../../lib/utils';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-[380px] w-full pointer-events-none"
    >
      {toasts.map((toast) => {
        const icons = {
          success: <CheckCircle2 className="w-5 h-5 text-[#15803D] shrink-0" />,
          warning: <AlertTriangle className="w-5 h-5 text-[#B45309] shrink-0" />,
          danger: <XCircle className="w-5 h-5 text-[#B91C1C] shrink-0" />,
          info: <Info className="w-5 h-5 text-[#6D28D9] shrink-0" />,
        };

        const borders = {
          success: 'border-l-4 border-l-[#15803D]',
          warning: 'border-l-4 border-l-[#B45309]',
          danger: 'border-l-4 border-l-[#B91C1C]',
          info: 'border-l-4 border-l-[#6D28D9]',
        };

        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto bg-white rounded-[14px] p-3.5 border border-[#ECE8F4] shadow-[0_12px_32px_rgba(31,26,46,0.12)] flex items-start justify-between gap-3 animate-in slide-in-from-top-3 duration-200',
              borders[toast.type]
            )}
          >
            <div className="flex items-start gap-2.5">
              {icons[toast.type]}
              <div>
                <h4 className="text-xs font-semibold text-[#1F1A2E]">{toast.title}</h4>
                <p className="text-xs text-[#6B647F] mt-0.5 leading-relaxed">{toast.message}</p>
              </div>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[#928BA6] hover:text-[#1F1A2E] p-1 rounded-md transition-colors cursor-pointer"
              aria-label="Dismiss toast"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

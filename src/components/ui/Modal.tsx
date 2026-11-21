import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
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

  const maxSizes = {
    sm: 'max-w-md', // 448px
    md: 'max-w-xl', // 576px
    lg: 'max-w-2xl', // 672px
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1F1A2E]/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className={cn(
          'w-full bg-white rounded-[20px] border border-[#ECE8F4] shadow-[0_24px_64px_rgba(63,29,122,0.18)] overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150',
          maxSizes[size]
        )}
      >
        {/* Sticky Header */}
        <div className="px-6 py-4 border-b border-[#ECE8F4] flex items-center justify-between bg-white shrink-0">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-[#1F1A2E]">
              {title}
            </h2>
            {description && <p className="text-xs text-[#6B647F] mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#928BA6] hover:text-[#1F1A2E] hover:bg-[#F7F4FF] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1">{children}</div>

        {/* Sticky Footer */}
        {footer && (
          <div className="px-6 py-3.5 border-t border-[#ECE8F4] bg-[#FCFBFF] flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { forwardRef, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        <select
          ref={ref}
          className={cn(
            'w-full h-10 pl-3.5 pr-9 bg-white text-[#1F1A2E] text-sm appearance-none cursor-pointer',
            'rounded-[12px] border border-[#DCD5EA] transition-all duration-150',
            'focus:outline-none focus:border-[#8B5CF6] focus:ring-3 focus:ring-[#8B5CF6]/25',
            'disabled:bg-[#F7F5FB] disabled:text-[#928BA6] disabled:cursor-not-allowed',
            error && 'border-[#B91C1C] focus:border-[#B91C1C] focus:ring-[#B91C1C]/20',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="w-4 h-4 text-[#928BA6] absolute right-3 pointer-events-none" />
      </div>
    );
  }
);
Select.displayName = 'Select';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, rows = 3, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          'w-full p-3 bg-white text-[#1F1A2E] placeholder:text-[#928BA6] text-sm',
          'rounded-[12px] border border-[#DCD5EA] transition-all duration-150',
          'focus:outline-none focus:border-[#8B5CF6] focus:ring-3 focus:ring-[#8B5CF6]/25',
          'disabled:bg-[#F7F5FB] disabled:text-[#928BA6] disabled:cursor-not-allowed resize-y',
          error && 'border-[#B91C1C] focus:border-[#B91C1C] focus:ring-[#B91C1C]/20',
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

interface FormFieldProps {
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  required,
  error,
  helperText,
  children,
  className,
}) => {
  return (
    <div className={cn('flex flex-col gap-1.5 w-full', className)}>
      {label && (
        <label className="text-xs font-semibold text-[#1F1A2E] flex items-center justify-between">
          <span>
            {label}
            {required && <span className="text-[#B91C1C] ml-1">*</span>}
          </span>
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-[#B91C1C] flex items-center gap-1 mt-0.5" role="alert">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-xs text-[#928BA6] mt-0.5">{helperText}</p>
      ) : null}
    </div>
  );
};

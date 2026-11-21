import React, { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, leftIcon, rightIcon, type = 'text', ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <div className="absolute left-3 text-[#928BA6] pointer-events-none flex items-center justify-center">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          type={type}
          className={cn(
            'w-full h-10 px-3.5 bg-white text-[#1F1A2E] placeholder:text-[#928BA6] text-sm',
            'rounded-[12px] border border-[#DCD5EA] transition-all duration-150',
            'focus:outline-none focus:border-[#8B5CF6] focus:ring-3 focus:ring-[#8B5CF6]/25',
            'disabled:bg-[#F7F5FB] disabled:text-[#928BA6] disabled:cursor-not-allowed',
            error && 'border-[#B91C1C] focus:border-[#B91C1C] focus:ring-[#B91C1C]/20',
            leftIcon && 'pl-9',
            rightIcon && 'pr-9',
            className
          )}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 text-[#928BA6] flex items-center justify-center">
            {rightIcon}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

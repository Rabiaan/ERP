import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-full select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5F57C4] focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer';

    const variants = {
      // Pillio single black CTA
      primary: 'bg-[#0E0E12] text-white hover:bg-[#1C1C24] active:bg-[#000000] shadow-sm',
      secondary:
        'bg-white text-[#0E0E12] border border-[#ECEBF3] hover:bg-[#F6F5FB] hover:border-[#D5D1F8] active:bg-[#E7E5FB]',
      ghost: 'bg-transparent text-[#7C7C8A] hover:bg-[#F6F5FB] hover:text-[#0E0E12]',
      danger: 'bg-[#E5484D] text-white hover:bg-[#D93D42] active:bg-[#B91C1C]',
      link: 'bg-transparent text-[#5F57C4] hover:text-[#7A72DD] hover:underline p-0 h-auto font-medium rounded-none',
    };

    const sizes = {
      sm: 'h-8 px-3.5 text-xs gap-1.5',
      md: 'h-10 px-5 text-sm gap-2',
      lg: 'h-12 px-6 text-[15px] gap-2.5',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], variant !== 'link' && sizes[size], className)}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

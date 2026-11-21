import React, { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  frosted?: boolean;
}

export const Card: React.FC<CardProps> = ({
  className,
  hoverable = false,
  frosted = false,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-[24px] transition-all duration-200',
        frosted ? 'bg-white/75 backdrop-blur-md' : 'bg-white',
        'shadow-[0_1px_2px_rgba(30,25,80,0.04),0_8px_24px_rgba(30,25,80,0.05)]',
        hoverable &&
          'hover:shadow-[0_4px_12px_rgba(30,25,80,0.06),0_12px_32px_rgba(30,25,80,0.09)] hover:-translate-y-0.5 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn('p-5 pb-3 flex items-center justify-between gap-3', className)} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<HTMLAttributes<HTMLHeadingElement>> = ({ className, children, ...props }) => (
  <h3 className={cn('text-[15px] font-medium text-[#0E0E12] tracking-tight', className)} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<HTMLAttributes<HTMLParagraphElement>> = ({ className, children, ...props }) => (
  <p className={cn('text-xs text-[#7C7C8A] mt-0.5 font-normal', className)} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn('p-5 pt-2', className)} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn('p-5 pt-3 border-t border-[#ECEBF3]/60 flex items-center justify-between', className)} {...props}>
    {children}
  </div>
);

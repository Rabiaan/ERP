import React from 'react';
import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <div
      className={cn(
        'animate-pulse rounded-[8px] bg-[#F7F5FB] border border-[#ECE8F4]/60',
        className
      )}
    />
  );
};

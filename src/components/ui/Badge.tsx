import React from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Laptop,
  Check,
  Building,
  UserCheck,
  FileText,
  Calendar,
  AlertTriangle,
  MinusCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export type BadgeVariant =
  | 'active'
  | 'probation'
  | 'on-leave'
  | 'exited'
  | 'present'
  | 'late'
  | 'absent'
  | 'remote'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'processing'
  | 'draft'
  | 'valid'
  | 'expiring'
  | 'expired'
  | 'open'
  | 'interviewing'
  | 'hired'
  | 'on-track'
  | 'at-risk'
  | 'behind'
  | 'completed'
  | 'neutral'
  | 'purple';

interface BadgeProps {
  children?: React.ReactNode;
  variant?: BadgeVariant | string;
  className?: string;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  className,
  size = 'md',
  icon: customIcon,
}) => {
  const normalized = (variant || '').toLowerCase().replace(/\s+/g, '-');

  let bgClass = 'bg-[#F4F3F8] text-[#555068]';
  let defaultIcon: React.ReactNode = <span className="w-1.5 h-1.5 rounded-full bg-current" />;

  switch (normalized) {
    case 'active':
    case 'present':
    case 'approved':
    case 'paid':
    case 'valid':
    case 'completed':
    case 'on-track':
    case 'hired':
      bgClass = 'bg-[#E6F6EE] text-[#1D7C4D]';
      defaultIcon = <CheckCircle2 className="w-3 h-3 shrink-0" />;
      break;

    case 'probation':
    case 'late':
    case 'pending':
    case 'processing':
    case 'interviewing':
    case 'at-risk':
    case 'expiring':
    case 'expiring-soon':
      bgClass = 'bg-[#FEF5E7] text-[#8A5200]';
      defaultIcon = <Clock className="w-3 h-3 shrink-0" />;
      break;

    case 'absent':
    case 'rejected':
    case 'expired':
    case 'behind':
    case 'needs-repair':
      bgClass = 'bg-[#FDECEC] text-[#D32F2F]';
      defaultIcon = <XCircle className="w-3 h-3 shrink-0" />;
      break;

    case 'on-leave':
    case 'draft':
    case 'exited':
    case 'decommissioned':
      bgClass = 'bg-[#F4F3F8] text-[#555068]';
      defaultIcon = <MinusCircle className="w-3 h-3 shrink-0" />;
      break;

    case 'remote':
      bgClass = 'bg-[#EAF1FC] text-[#2962FF]';
      defaultIcon = <Laptop className="w-3 h-3 shrink-0" />;
      break;

    case 'open':
    case 'purple':
      bgClass = 'bg-[#EFE9FE] text-[#5F57C4]';
      defaultIcon = <Sparkles className="w-3 h-3 shrink-0" />;
      break;

    default:
      bgClass = 'bg-[#F4F3F8] text-[#555068]';
      defaultIcon = <span className="w-1.5 h-1.5 rounded-full bg-[#6B6A85]" />;
  }

  const iconToRender = customIcon !== undefined ? customIcon : defaultIcon;

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full select-none tracking-tight',
        size === 'sm' ? 'px-2 py-0.5 text-[12px] gap-1' : 'px-2.5 py-1 text-xs gap-1.5',
        bgClass,
        className
      )}
    >
      {iconToRender}
      <span>{children || variant}</span>
    </span>
  );
};

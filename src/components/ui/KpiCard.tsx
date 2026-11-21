import React from 'react';
import { TrendingUp, TrendingDown, Minus, MoreHorizontal } from 'lucide-react';
import { Card } from './Card';
import { cn } from '../../lib/utils';

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: {
    value: string;
    trend: 'up' | 'down' | 'neutral';
    label?: string;
    isPositive?: boolean; // De-couple trend direction from good/bad
  };
  icon?: React.ReactNode;
  sparklineData?: number[];
  className?: string;
  subtext?: string;
  onClick?: () => void;
  onOptionsClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  unit,
  delta,
  icon,
  sparklineData,
  className,
  subtext,
  onClick,
  onOptionsClick,
}) => {
  // Determine delta color: if isPositive is explicitly set, use it; otherwise 'up' is green and 'down' is red
  const isPositive = delta?.isPositive !== undefined
    ? delta.isPositive
    : delta?.trend === 'up';

  return (
    <Card
      className={cn(
        'p-5 flex flex-col justify-between relative overflow-hidden group hover:shadow-[0_12px_28px_rgba(30,25,80,0.07)] transition-all',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-medium text-[#6B6A85]">
          {icon && <span className="text-[#8D86EA] shrink-0">{icon}</span>}
          <span>{label}</span>
        </div>
        <button
          type="button"
          aria-label="Options"
          onClick={(e) => {
            e.stopPropagation();
            onOptionsClick?.();
          }}
          className="text-[#6B6A85] hover:text-[#524E65] p-1 rounded-full transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="my-3 flex items-baseline gap-2">
        <div className="text-[34px] lg:text-[38px] font-medium text-[#0E0E12] tracking-tight tabular-nums leading-none">
          {value}
        </div>
        {unit && (
          <span className="text-lg font-normal text-[#6B6A85] tracking-tight">
            {unit}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-[#6B6A85] pt-1">
        <div className="flex items-center gap-2">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full select-none text-[12px]',
                isPositive
                  ? 'bg-[#E6F6EE] text-[#1D7C4D]'
                  : delta.trend === 'neutral'
                  ? 'bg-[#F4F3F8] text-[#555068]'
                  : 'bg-[#FDECEC] text-[#D32F2F]'
              )}
            >
              {delta.trend === 'up' ? (
                <TrendingUp className="w-3 h-3" />
              ) : delta.trend === 'down' ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              <span>{delta.value}</span>
            </span>
          )}
          <span className="truncate">{delta?.label || subtext || 'vs last month'}</span>
        </div>

        {sparklineData && sparklineData.length > 0 && (
          <div className="w-14 h-4 flex items-end gap-1 shrink-0 ml-2">
            {sparklineData.map((val, idx) => {
              const max = Math.max(...sparklineData);
              const heightPercent = max > 0 ? (val / max) * 100 : 20;
              return (
                <div
                  key={idx}
                  style={{ height: `${Math.max(20, heightPercent)}%` }}
                  className="w-1.5 rounded-full bg-[#E3E1F5] group-hover:bg-[#8D86EA] transition-colors"
                />
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};

interface HeroKpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  detailRight?: {
    title: string;
    time?: string;
  };
  progressPercent: number; // 0 to 100
  className?: string;
  icon?: React.ReactNode;
  onOptionsClick?: () => void;
}

export const HeroKpiCard: React.FC<HeroKpiCardProps> = ({
  label,
  value,
  unit,
  subtitle,
  detailRight,
  progressPercent,
  className,
  icon,
  onOptionsClick,
}) => {
  const clampedPercent = Math.min(100, Math.max(0, progressPercent));

  return (
    <div
      className={cn(
        'relative rounded-[24px] p-6 text-white overflow-hidden shadow-[0_1px_2px_rgba(55,48,110,0.10),0_10px_24px_rgba(127,119,224,0.16)] ring-1 ring-inset ring-white/25 flex flex-col justify-between min-h-[170px]',
        'bg-gradient-to-br from-[#A9A3F5] to-[#7F77E0]',
        className
      )}
    >
      {/* Background soft glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.06] rounded-full blur-3xl pointer-events-none transform translate-x-12 -translate-y-12" />

      {/* Header */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2 text-white/90 text-sm font-medium">
          {icon}
          <span>{label}</span>
        </div>
        <button
          type="button"
          aria-label="Options"
          onClick={onOptionsClick}
          className="text-white/70 hover:text-white p-1 rounded-full transition-colors"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Main Metric & Detail Right */}
      <div className="flex items-baseline justify-between relative z-10 my-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[38px] lg:text-[44px] font-medium leading-none tracking-tight">
            {value}
          </span>
          {unit && (
            <span className="text-xl lg:text-2xl text-white/75 font-normal">
              {unit}
            </span>
          )}
          {subtitle && (
            <span className="ml-3 text-xs text-white/80 font-medium px-2 py-0.5 bg-white/20 rounded-full backdrop-blur-xs">
              {subtitle}
            </span>
          )}
        </div>

        {detailRight && (
          <div className="text-right text-xs text-white/90">
            <div className="font-medium text-white text-[13px]">{detailRight.title}</div>
            {detailRight.time && <div className="text-white/75 text-[12px]">{detailRight.time}</div>}
          </div>
        )}
      </div>

      {/* Progress pill with hatched pattern */}
      <div className="relative z-10 mt-1">
        <div className="w-full h-3.5 bg-white/25 rounded-full p-0.5 overflow-hidden flex items-center">
          <div
            className="h-full bg-white rounded-full transition-all duration-500 shadow-xs"
            style={{ width: `${clampedPercent}%` }}
          />
          <div
            className="h-full flex-1 rounded-r-full hatch-pattern-white opacity-60 ml-0.5"
          />
        </div>
      </div>
    </div>
  );
};

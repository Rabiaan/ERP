import React, { useState } from 'react';
import { cn } from '../../lib/utils';

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  status?: 'online' | 'busy' | 'away' | 'offline';
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  size = 'md',
  className,
  status,
}) => {
  const [imageError, setImageError] = useState(false);

  const getInitials = (str: string) => {
    if (!str) return '??';
    const parts = str.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const sizes = {
    sm: 'w-7 h-7 text-[11px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-11 h-11 text-sm',
    xl: 'w-16 h-16 text-lg',
  };

  const statusColors = {
    online: 'bg-[#15803D]',
    busy: 'bg-[#B91C1C]',
    away: 'bg-[#B45309]',
    offline: 'bg-[#928BA6]',
  };

  return (
    <div className={cn('relative inline-flex shrink-0 select-none', className)}>
      <div
        className={cn(
          'rounded-full overflow-hidden flex items-center justify-center font-semibold border border-[#E0D6FD]/80 shadow-xs',
          sizes[size],
          !src || imageError
            ? 'bg-[#EFE9FE] text-[#5B21B6]'
            : 'bg-[#F7F5FB]'
        )}
      >
        {src && !imageError ? (
          <img
            src={src}
            alt={name}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{getInitials(name)}</span>
        )}
      </div>

      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-white',
            size === 'sm' || size === 'md' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5',
            statusColors[status]
          )}
        />
      )}
    </div>
  );
};

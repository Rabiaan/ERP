import React, { useEffect, useId, type ReactNode } from 'react';
import { AlertCircle, Inbox, LoaderCircle, LockKeyhole, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag className={cn('rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(30,25,80,.04),0_8px_24px_rgba(30,25,80,.05)]', className)}>
      {children}
    </Tag>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8B86A8]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.02em] text-[#0E0E12] sm:text-[32px]">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-[#6B6A85]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PrimaryLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={to}
      className={cn(
        'inline-flex h-12 items-center justify-center rounded-full bg-[#0E0E12] px-6 text-sm font-medium text-white transition hover:bg-[#1C1C24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E0E12]',
        className,
      )}
    >
      {children}
    </a>
  );
}

export function HeroCard({
  eyebrow,
  title,
  value,
  note,
  cta,
  progress,
  className,
}: {
  eyebrow: string;
  title: string;
  value: string | number;
  note?: string;
  cta?: { label: string; href: string };
  progress?: { value: number; max: number };
  className?: string;
}) {
  const max = progress?.max ?? 100;
  const pct = max > 0 ? Math.min(100, Math.round(((progress?.value ?? 0) / max) * 100)) : 0;
  return (
    <Card
      className={cn(
        'relative overflow-hidden bg-[linear-gradient(160deg,#A9A3F5_0%,#7F77E0_100%)] p-6 text-white',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-white/12" />
      <div className="relative flex h-full flex-col">
        <p className="text-xs font-medium text-white/80">{eyebrow}</p>
        <p className="mt-1 text-sm text-white/75">{title}</p>
        <p className="mt-5 font-display text-[44px] font-medium leading-none tabular-nums">
          {value}
          {progress ? <span className="text-[26px] text-white/70"> / {max}</span> : null}
        </p>
        {note ? <p className="mt-2 text-xs text-white/80">{note}</p> : null}
        {progress ? (
          <div
            className="mt-5 h-3.5 w-full overflow-hidden rounded-full bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.38)_0_1.5px,transparent_1.5px_5px)] bg-white/20"
            role="progressbar"
            aria-valuenow={progress.value}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-label={`${title} progress`}
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {cta ? (
          <a
            href={cta.href}
            className="mt-6 inline-flex h-11 w-fit items-center justify-center rounded-full bg-[#0E0E12] px-5 text-xs font-medium text-white transition hover:bg-[#1C1C24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {cta.label}
          </a>
        ) : null}
      </div>
    </Card>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-[13px] font-medium text-[#6B6A85]">{label}</p>
      <p className="mt-3 font-display text-[36px] font-medium leading-none tabular-nums text-[#0E0E12]">
        {value}
      </p>
      {hint ? <p className="mt-2 text-[11px] text-[#9A99AA]">{hint}</p> : null}
    </>
  );
  return href ? (
    <a href={href} className="block rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(30,25,80,.04),0_8px_24px_rgba(30,25,80,.05)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7F77E0]">
      {content}
    </a>
  ) : (
    <Card>{content}</Card>
  );
}

export function StatePanel({
  kind = 'empty',
  title,
  message,
  action,
}: {
  kind?: 'loading' | 'empty' | 'error' | 'denied' | 'future';
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  const icon = {
    loading: <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden />,
    empty: <Inbox className="h-6 w-6" aria-hidden />,
    error: <AlertCircle className="h-6 w-6" aria-hidden />,
    denied: <LockKeyhole className="h-6 w-6" aria-hidden />,
    future: <Inbox className="h-6 w-6" aria-hidden />,
  }[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[24px] p-8 text-center',
        kind === 'future'
          ? 'border border-dashed border-[#D9D4E9] bg-[repeating-linear-gradient(135deg,rgba(14,14,18,.05)_0_1.5px,transparent_1.5px_5px)]'
          : 'bg-white shadow-[0_1px_2px_rgba(30,25,80,.04),0_8px_24px_rgba(30,25,80,.05)]',
      )}
    >
      <div
        className={cn(
          'grid h-11 w-11 place-items-center rounded-full',
          kind === 'error' ? 'bg-[#FDECEC] text-[#E5484D]' : 'bg-[#F2F0FB] text-[#5F57C4]',
        )}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-[#0E0E12]">{title}</p>
        {message ? <p className="mt-1 max-w-md text-xs text-[#6B6A85]">{message}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PillBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const tones = {
    neutral: 'bg-[#F2F0FB] text-[#4B44A3]',
    success: 'bg-[#E6F6EE] text-[#2FA36B]',
    warning: 'bg-[#FFF4DC] text-[#A9751C]',
    danger: 'bg-[#FDECEC] text-[#C93B40]',
    info: 'bg-[#E8F2FF] text-[#2962FF]',
  } as const;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium capitalize', tones[tone])}>
      {children}
    </span>
  );
}

export function toneForStatus(status: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  const value = String(status ?? '').toLowerCase();
  if (['active', 'approved', 'paid', 'succeeded', 'up', "on track", 'valid', 'posted', 'complete'].includes(value)) {
    return 'success';
  }
  if (['pending', 'draft', 'processing', 'queued', 'probation', 'upcoming', 'expiring soon'].includes(value)) {
    return 'warning';
  }
  if (['failed', 'rejected', 'archived', 'suspended', 'expired', 'down', 'behind', 'disabled'].includes(value)) {
    return 'danger';
  }
  if (['inspect', 'support', 'running'].includes(value)) return 'info';
  return 'neutral';
}

export interface GridColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

export function DataGrid<T extends { id?: unknown }>({
  columns,
  rows,
  keyFor,
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'New records will appear here once they are added.',
}: {
  columns: GridColumn<T>[];
  rows: T[];
  keyFor?: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyMessage?: string;
}) {
  if (!rows.length) return <StatePanel title={emptyTitle} message={emptyMessage} />;
  return (
    <div className="w-full overflow-x-auto rounded-[20px] bg-[#F7F6FC]">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8B86A8]"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={keyFor?.(row, index) ?? String(row.id ?? index)} className="border-t border-[#EDEBF5]">
              {columns.map((column) => (
                <td key={column.key} className={cn('px-4 py-3 text-xs text-[#3B3A4B] align-middle', column.className)}>
                  {column.render ? column.render(row) : formatCell((row as Record<string, unknown>)[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatCell(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Array) return value.join(', ');
  if (typeof value === 'object') {
    if ('name' in (value as object)) return String((value as { name: unknown }).name);
    return JSON.stringify(value);
  }
  return String(value);
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-[#4B4A60]">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-[#9A99AA]">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  'h-11 w-full rounded-[14px] border border-[#E4E1EF] bg-white px-3.5 text-sm text-[#0E0E12] outline-none transition placeholder:text-[#B9B9C6] focus:border-[#A9A3F5] focus:ring-2 focus:ring-[#A9A3F5]/25';

export function Modal({
  open,
  title,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0E0E12]/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'max-h-[90vh] w-full overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-2xl sm:rounded-[24px]',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-lg font-medium">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F5F3FB] text-[#6B6A85] hover:bg-[#EBE8F8]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PermissionGate({
  permission,
  children,
  fallback,
}: {
  permission: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, canAny } = useAuth();
  const allowed = Array.isArray(permission) ? canAny(permission) : can(permission);
  if (!allowed) {
    return fallback ?? <StatePanel kind="denied" title="Permission denied" message="You do not have access to this area." />;
  }
  return <>{children}</>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={cn(inputClass, 'h-10 max-w-xs rounded-full bg-white/80')}
    />
  );
}

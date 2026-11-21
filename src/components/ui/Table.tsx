import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (columnKey: string) => void;
  selectedIds?: string[];
  onSelectRow?: (id: string) => void;
  onSelectAll?: () => void;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  sortColumn,
  sortDirection,
  onSort,
  selectedIds = [],
  onSelectRow,
  onSelectAll,
  onRowClick,
  isLoading = false,
  emptyState,
  className,
}: TableProps<T>) {
  const isAllSelected = data.length > 0 && selectedIds.length === data.length;
  const isPartiallySelected = selectedIds.length > 0 && selectedIds.length < data.length;

  return (
    <div className={cn('w-full overflow-x-auto rounded-[16px] border border-[#ECE8F4] bg-white', className)}>
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="bg-[#F7F4FF] border-b border-[#ECE8F4] text-[#6B647F]">
            {onSelectRow && onSelectAll && (
              <th className="w-12 px-4 py-3.5 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = isPartiallySelected;
                  }}
                  onChange={onSelectAll}
                  aria-label="Select all rows"
                  className="rounded-[4px] border-[#DCD5EA] text-[#6D28D9] focus:ring-[#8B5CF6]/30 cursor-pointer w-4 h-4"
                />
              </th>
            )}
            {columns.map((col) => {
              const isSorted = sortColumn === col.key;
              return (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && onSort?.(col.key)}
                  className={cn(
                    'px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6B647F] select-none whitespace-nowrap',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                    col.sortable && 'cursor-pointer hover:text-[#1F1A2E]',
                    col.className
                  )}
                >
                  <div
                    className={cn(
                      'inline-flex items-center gap-1.5',
                      col.align === 'right' && 'flex-row-reverse'
                    )}
                  >
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="text-[#928BA6]">
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <ChevronUp className="w-3.5 h-3.5 text-[#6D28D9]" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-[#6D28D9]" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#ECE8F4]">
          {isLoading ? (
            <tr>
              <td
                colSpan={columns.length + (onSelectRow ? 1 : 0)}
                className="p-8 text-center text-[#6B647F]"
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 border-2 border-[#8B5CF6] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Loading records...</span>
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (onSelectRow ? 1 : 0)}
                className="p-10 text-center"
              >
                {emptyState || (
                  <div className="text-xs text-[#928BA6]">No records found</div>
                )}
              </td>
            </tr>
          ) : (
            data.map((row) => {
              const id = keyExtractor(row);
              const isSelected = selectedIds.includes(id);

              return (
                <tr
                  key={id}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'min-h-[52px] transition-colors duration-100 group',
                    onRowClick && 'cursor-pointer',
                    isSelected
                      ? 'bg-[#F7F4FF] relative after:absolute after:left-0 after:top-0 after:bottom-0 after:w-[3px] after:bg-[#8B5CF6]'
                      : 'hover:bg-[#F7F4FF]/60'
                  )}
                >
                  {onSelectRow && onSelectAll && (
                    <td
                      className="w-12 px-4 py-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelectRow(id)}
                        aria-label={`Select row ${id}`}
                        className="rounded-[4px] border-[#DCD5EA] text-[#6D28D9] focus:ring-[#8B5CF6]/30 cursor-pointer w-4 h-4"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-3 text-xs text-[#1F1A2E]',
                        col.align === 'right'
                          ? 'text-right tabular-nums'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left',
                        col.className
                      )}
                    >
                      {col.render ? col.render(row) : (row as any)[col.key]}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

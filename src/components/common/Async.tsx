import React, { useEffect, useRef, useState, type DependencyList, type ReactNode } from 'react';
import { errorMessage } from '../../api/client';
import { StatePanel } from './Ui';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useApiData<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadRef
      .current()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason: unknown) => {
        if (active && (reason as { name?: string })?.name !== 'AbortError') {
          setError(errorMessage(reason));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [...deps, revision]);

  return { data, loading, error, reload: () => setRevision((value) => value + 1) };
}

export function AsyncView<T>({
  state,
  children,
  emptyTitle,
  emptyMessage,
  deniedCode,
}: {
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
  deniedCode?: string;
}) {
  if (state.loading) return <StatePanel kind="loading" title="Loading" message="Fetching the latest data…" />;
  if (state.error) {
    const denied = deniedCode ? state.error.toLowerCase().includes(deniedCode.toLowerCase()) : false;
    return (
      <StatePanel
        kind={denied ? 'denied' : 'error'}
        title={denied ? 'Permission denied' : 'Could not load this view'}
        message={state.error}
        action={
          <button
            type="button"
            onClick={state.reload}
            className="mt-2 rounded-full bg-white px-4 py-2 text-xs font-medium text-[#0E0E12] shadow-sm hover:bg-[#F5F3FB]"
          >
            Try again
          </button>
        }
      />
    );
  }
  if (state.data === null || state.data === undefined) {
    return <StatePanel title={emptyTitle ?? 'No data'} message={emptyMessage} />;
  }
  return <>{children(state.data)}</>;
}

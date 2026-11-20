'use client';
import { useEffect, type ReactNode } from 'react';
import { getAppStore, useApp } from '@/store/appStore';

/** Loads the library from IndexedDB once, then renders children. */
export function StoreGate({ children }: { children: ReactNode }) {
  const hydrated = useApp((s) => s.hydrated);
  useEffect(() => {
    if (!getAppStore().getState().hydrated) void getAppStore().getState().hydrate();
  }, []);
  if (!hydrated)
    return (
      <div className="band" aria-busy="true">
        <p className="wrap text-mut">Loading your decisions…</p>
      </div>
    );
  return <>{children}</>;
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import { analyse, simulate, toSimInput, type Analysis, type Decision, type SimResult } from '@/engine';

export function useAnalysis(d: Decision | undefined): Analysis | null {
  return useMemo(() => (d ? analyse(d) : null), [d]);
}

/** Synchronous simulation. Replaced by the worker-backed hook in milestone 4. */
export function useSimulationSync(a: Analysis | null): SimResult | null {
  return useMemo(() => {
    const inp = a ? toSimInput(a.model) : null;
    return inp ? simulate(inp) : null;
  }, [a]);
}

/** Matches a CSS media query; false during SSR. */
export function useMedia(query: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

/** Element size via ResizeObserver. */
export function useSize<T extends HTMLElement>(): [(el: T | null) => void, { w: number; h: number }] {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      const { width, height } = e.contentRect;
      setSize((s) => (s.w === Math.round(width) && s.h === Math.round(height) ? s : { w: Math.round(width), h: Math.round(height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

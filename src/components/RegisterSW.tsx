'use client';
import { useEffect } from 'react';

/** Registers the offline service worker in production builds. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const v = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(v)}`, { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Hand over everything this page loaded (incl. lazily-loaded chunks) for offline use.
        const urls = performance.getEntriesByType('resource').map((e) => e.name);
        reg.active?.postMessage({ type: 'cache-urls', urls });
      })
      .catch(() => undefined);
  }, []);
  return null;
}

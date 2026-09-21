'use client';

import { useEffect } from 'react';

/**
 * Registers the minimal no-op service worker (public/sw.js) so the app
 * satisfies stricter PWA-installability heuristics on some browsers.
 * It does not add offline support or caching — see sw.js for why.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is a progressive enhancement; ignore failures
      // (e.g. unsupported browser, dev server without HTTPS).
    });
  }, []);

  return null;
}

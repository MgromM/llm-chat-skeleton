// Minimal no-op service worker.
//
// Its only job is to exist and respond to `fetch`, which is what some
// browsers' PWA-installability heuristics check for (stricter than the
// baseline manifest+HTTPS+icons requirement). It intentionally does NOT
// cache anything — this is a live chat app with real-time API responses,
// and a caching service worker here would risk serving stale data.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Intentional passthrough: let the browser handle the request normally.
});

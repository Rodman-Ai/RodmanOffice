// RodmanWord service worker — offline app shell cache.
// Strategy: NETWORK-FIRST for everything, with cache fallback for
// offline. Previously the SW served static assets cache-first which
// meant CSS / JS updates lingered on users' devices for an extra
// reload after each release. Network-first ensures every reload
// fetches the freshest copy when online; the cache only serves when
// the network is unreachable.
//
// Keep VERSION in sync with RW_BUILD.cache in app.js so the About
// dialog displays the same version users actually have cached.
const VERSION = 'rwd-v9';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './docx.js',
  './pdfio.js',
  './interop.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for ALL same-origin GETs. The cache is updated on
  // every successful fetch so the next offline session can serve the
  // most recent copy. If the network fails, fall back to whatever is
  // in the cache; for navigations, fall back to the cached
  // index.html so an offline reload still boots the app.
  e.respondWith(
    fetch(req).then((r) => {
      if (r && r.ok) {
        const copy = r.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match(req).then((cached) => {
      if (cached) return cached;
      if (req.mode === 'navigate' ||
          req.headers.get('accept')?.includes('text/html')) {
        return caches.match('./index.html').then((idx) => idx || new Response(
          'Offline and no cached copy available.',
          { status: 503, statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' } }
        ));
      }
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }))
  );
});

// RodmanConvert service worker — offline app shell.
// Network-first, cache-fallback. Mirrors /word/sw.js's strategy.
const VERSION = 'rconv-v2';
const CACHE_PREFIX = 'rconv-';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './detect.js',
  './matrix.js',
  './worker.js',
  './bulk.js',
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
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== VERSION)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

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

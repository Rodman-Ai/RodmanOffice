// RodmanVision service worker — network-first with offline cache fallback.
// Pattern lifted from slides/sw.js. The launcher SW only handles its own
// shell, so this SW owns /diagrams/ scope.
// The shared engine at /lib/diagrams/ lives outside this SW's scope (./),
// so it's fetched from the network on first save/export and HTTP-cached.
const VERSION = 'rodman-vision-v1';
const CACHE_PREFIX = 'rodman-vision-';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './diagram.js',
  './render.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(APP_SHELL))
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
      if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
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

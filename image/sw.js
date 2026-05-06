/* Retro Paint — network-first app shell cache with offline fallback. */
const CACHE = 'retro-paint-v8';
const CACHE_PREFIX = 'retro-paint-';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './js/app.js',
  './js/modes.js',
  './js/menus.js',
  './js/sounds.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => {
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
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        if (res && res.ok) {
          caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

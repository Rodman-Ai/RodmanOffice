// RodmanSlides service worker — network-first with offline cache fallback.
// Pattern lifted from word/sw.js — the launcher SW only handles its own
// shell, so this SW owns /slides/ scope.
// Note: the new PPTX engine lives at /lib/slides/ which is outside this
// SW's scope (./), so we cannot precache it here. It's fetched from the
// network on first PPTX import / export and HTTP-cached after that.
const VERSION = 'rodman-slides-v2';
const CACHE_PREFIX = 'rodman-slides-';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './deck.js',
  './render.js',
  './themes.js',
  './present.js',
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

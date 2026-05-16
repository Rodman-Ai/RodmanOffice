// RodmanOffice launcher service worker.
//
// Scope is "/" because this SW is registered from the launcher at the
// site root. Per-app service workers (e.g. /word/sw.js) use a more
// specific scope and take precedence for their own folders.
//
// To avoid caching sub-app assets here (which would shadow the per-app
// SWs and break their offline updates), we ONLY cache launcher shell
// paths. Everything else falls through to the network — including the
// initial /word/ navigation request, which the word SW will own from
// then on.
const VERSION = 'rodmanoffice-launcher-v2';
const CACHE_PREFIX = 'rodmanoffice-launcher-';
const SHELL = [
  './',
  './index.html',
  './launcher.css',
  './launcher.js',
  './manifest.webmanifest',
  './icon.svg',
  './404.html',
];

// Resolve SHELL entries to absolute URLs once so we can compare cheaply
// in fetch handlers.
const SHELL_URLS = SHELL.map((p) => new URL(p, self.location).href);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== VERSION)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Only intercept requests for the launcher shell. Everything else —
  // including sub-app navigations and assets — passes through to the
  // network so per-app SWs can manage their own caches.
  if (!SHELL_URLS.includes(url.href)) return;

  // Network-first for the shell so launcher updates roll out on reload;
  // fall back to cache when offline.
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return r;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});

// RodmanTranscribe service worker.
//
// Two jobs:
//   1. Cross-origin isolation. whisper.cpp WASM (via transcribe.js) needs
//      SharedArrayBuffer, which requires `crossOriginIsolated`, which in
//      turn needs COOP/COEP response headers. GitHub Pages can't set
//      headers, so we synthesize them here by re-emitting every response
//      with COOP: same-origin + COEP: credentialless. This is the
//      well-known `coi-serviceworker` technique (Guido Zuidhof, MIT) —
//      `credentialless` (not `require-corp`) so cross-origin model/CDN
//      fetches still load without per-resource CORP headers.
//   2. App-shell precache for offline launch. The model (~1 GB, cached in
//      Cache Storage by the app) and the cross-origin WASM/CDN assets are
//      deliberately NOT precached here.

const VERSION = 'rtranscribe-v3';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './engine.js',
  './manifest.webmanifest',
  './icon.svg',
];
const SHELL_URLS = new Set(SHELL.map((p) => new URL(p, self.location).href));

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('rtranscribe-') && k !== VERSION)
        .map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

// Re-emit a response with the cross-origin-isolation headers attached.
function withCoiHeaders(response) {
  // Opaque (cross-origin no-cors) responses can't be rewritten — pass through.
  if (!response || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Skip the browser's only-if-cached cross-origin oddity.
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  // Cross-origin no-cors (e.g. the CDN worker/wasm, HF model) → omit
  // credentials so `credentialless` isolation accepts them, pass through.
  const request = req.mode === 'no-cors'
    ? new Request(req, { credentials: 'omit' })
    : req;

  event.respondWith((async () => {
    const url = new URL(request.url);

    // Shell: NETWORK-FIRST, falling back to cache only when offline.
    //
    // This used to be cache-first, which meant a returning visitor kept
    // running whatever app.js/engine.js/styles.css were cached under the
    // first VERSION they ever saw — every subsequent deploy was invisible
    // until VERSION changed. For an app that's actively iterated and served
    // from GitHub Pages, always preferring the network (and only falling
    // back to cache offline) is the correct trade-off: the model + CDN WASM
    // already require the network on first real use anyway.
    if (request.method === 'GET' && SHELL_URLS.has(url.href)) {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) caches.open(VERSION).then((c) => c.put(request, fresh.clone())).catch(() => {});
        return withCoiHeaders(fresh);
      } catch {
        const cached = await caches.match(request);
        if (cached) return withCoiHeaders(cached);
        throw new Error('offline and shell not cached');
      }
    }

    // Everything else: network, then add COI headers where possible.
    try {
      return withCoiHeaders(await fetch(request));
    } catch (err) {
      const cached = await caches.match(request);
      if (cached) return withCoiHeaders(cached);
      throw err;
    }
  })());
});

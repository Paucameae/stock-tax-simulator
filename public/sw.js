/// Service Worker for Simulateur Fiscal MSFT
/// Cache-first for static assets, network-first for API calls

// Replaced at build time (see vite.config.ts) by the build version so each
// deploy gets a distinct cache that the `activate` handler can purge. In dev
// the placeholder is left as-is, which is harmless.
const SW_VERSION = '__SW_VERSION__';
const CACHE_NAME = `stock-tax-simulator-${SW_VERSION}`;

// Static assets to precache (populated at build time via index.html)
// The SW will also cache any same-origin request at runtime
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
];

// Install: precache essential assets.
// NOTE: we deliberately do NOT call self.skipWaiting() here. A freshly
// installed SW stays in the `waiting` state while an older version still
// controls open tabs, so an active user keeps running entirely on the old
// version (its cache intact) until they explicitly opt in to the update via
// the in-app banner (which posts SKIP_WAITING below).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Allow the page to trigger the waiting SW's activation on demand (banner
// "Recharger" button). The client reloads once on `controllerchange`.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests except ECB API
  if (url.origin !== self.location.origin &&
      !url.hostname.endsWith('ecb.europa.eu')) {
    return;
  }

  // Network-first for API calls (ECB rates, MSFT quote)
  if (url.pathname.startsWith('/api/') ||
      url.hostname.endsWith('ecb.europa.eu')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Network-first for navigation requests (HTML pages)
  // This ensures a new deploy's index.html (with updated asset hashes) is always fetched
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for hashed static assets (immutable by design)
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback: return cached index for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

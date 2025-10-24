// Auto-updating Service Worker for Neo CT (no manual version bumps needed)
const CACHE_NAME = 'neo-ct-auto'; // single stable cache; entries update themselves

self.addEventListener('install', (event) => {
  // take control immediately on new install
  self.skipWaiting();
  event.waitUntil((async () => {
    // Optional: warm a tiny set that rarely changes (icons)
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([
      './icon-192.png',
      './icon-512.png',
      './apple-touch-icon.png',
    ]);
  })());
});

self.addEventListener('activate', (event) => {
  // claim any open pages so the new SW is active right away
  event.waitUntil(self.clients.claim());
});

// Strategy helpers
async function networkFirst(request) {
  try {
    const fresh = await fetch(request, { cache: 'no-store' });
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // final fallback: try the root if it's a navigation
    if (request.mode === 'navigate') return caches.match('./index.html');
    throw e;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then((fresh) => {
    cache.put(request, fresh.clone());
    return fresh;
  }).catch(() => null);
  return cached || fetchPromise || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const dest = req.destination;

  // HTML pages (navigations) → network first
  if (req.mode === 'navigate' || dest === 'document') {
    event.respondWith(networkFirst(req));
    return;
  }

  // JS & CSS → network first (so code updates without manual versioning)
  if (dest === 'script' || dest === 'style') {
    event.respondWith(networkFirst(req));
    return;
  }

  // Icons & images → cache first
  if (dest === 'image' || dest === 'font') {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Everything else → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});

// Optional: allow page to ask SW to update immediately (if we ever add an update UI)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const CACHE_NAME = 'dust-above-heavens-v12';

// Cache ONLY core lightweight app shell assets on install (< 100 KB total)
// High-res covers and audio are cached on-demand at runtime to prevent mobile install timeout/failure!
const CORE_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. chapters.json handling: Network-First with Cache Fallback
  if (url.pathname.endsWith('chapters.json')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cloneForCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              // Cache both exact request and canonical path
              cache.put(event.request, cloneForCache);
              cache.put('./chapters.json', networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fails/offline, serve from cache immediately
          return caches.match(event.request, { ignoreSearch: true }).then((cached) => {
            if (cached) return cached;
            return caches.match('./chapters.json', { ignoreSearch: true });
          });
        })
    );
    return;
  }

  // 2. Images (Covers & Icons): Cache-First, then Network (saves mobile bandwidth)
  if (/\.(png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. All other requests (HTML, CSS, JS): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
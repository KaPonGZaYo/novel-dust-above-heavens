const SHELL_CACHE = 'dust-above-heavens-shell-v51';
const DATA_CACHE = 'dust-above-heavens-data-v1';

// Core lightweight app shell cached on install
const CORE_SHELL_ASSETS = [
  './',
  './index.html',
  './reader.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(CORE_SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          // Keep DATA_CACHE intact across shell updates so images & chapters stay cached!
          if (key !== SHELL_CACHE && key !== DATA_CACHE) {
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
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Only handle same-origin requests in SW (let Google Fonts/CDNs use browser HTTP cache)
  if (url.origin !== self.location.origin) return;

  // 1. Individual chapter JSON: Stale-While-Revalidate in persistent DATA_CACHE (instant repeat reads!)
  if (/\/chapters\/ch_\d+\.json$/i.test(url.pathname)) {
    const canonicalKey = './chapters/' + url.pathname.split('/').pop();
    event.respondWith(
      caches.open(DATA_CACHE).then((cache) =>
        cache.match(canonicalKey, { ignoreSearch: true }).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(canonicalKey, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cached);

          // If explicitly cache-busted (?v=...), wait for network; otherwise return cached immediately!
          if (url.searchParams.has('v')) {
            return networkFetch.then((res) => res || cached);
          }
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // 2. chapters_meta.json & chapters.json: Network-First with DATA_CACHE Fallback
  if (url.pathname.endsWith('chapters_meta.json') || url.pathname.endsWith('chapters.json')) {
    const canonicalKey = './' + url.pathname.split('/').pop();
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(canonicalKey, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(canonicalKey, { ignoreSearch: true }))
    );
    return;
  }

  // 3. Images (Covers, Portraits, Locations, Icons): Cache-First in persistent DATA_CACHE
  if (/\.(png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(DATA_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        })
      )
    );
    return;
  }

  // 4. HTML & Navigation requests: Stale-While-Revalidate in SHELL_CACHE (instant ~20-50ms open!)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    const canonicalKey = url.pathname.endsWith('/') ? './index.html' : ('./' + url.pathname.split('/').pop());
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(canonicalKey, { ignoreSearch: true }).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(canonicalKey, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cached);

          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // 5. All other same-origin requests: Stale-While-Revalidate
  event.respondWith(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.match(event.request, { ignoreSearch: true }).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    )
  );
});

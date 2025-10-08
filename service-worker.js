// --- Service Worker for Krishi Mitra ---

const CACHE_NAME = 'krishi-mitra-static-v3';
const DYNAMIC_CACHE_NAME = 'krishi-mitra-dynamic-v3';

// App Shell: All the essential files for the app to run.
const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.svg',
];


self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Precaching App Shell...');
      return cache.addAll(APP_SHELL_FILES);
    })
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME && key !== DYNAMIC_CACHE_NAME) {
          console.log('[SW] Removing old cache:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // --- STRATEGY 1: Cache-First for Cross-Origin (CDNs, fonts, etc.) ---
    // Cache all third-party assets to ensure true offline functionality.
    if (url.origin !== self.location.origin) {
        event.respondWith(
            caches.match(request).then(response => {
                return response || fetch(request).then(fetchRes => {
                    return caches.open(DYNAMIC_CACHE_NAME).then(cache => {
                        // Only cache successful responses
                        if(fetchRes.status === 200) {
                            cache.put(request.url, fetchRes.clone());
                        }
                        return fetchRes;
                    });
                });
            })
        );
        return;
    }

    // --- STRATEGY 2: Cache-First for Local Media ---
    // For same-origin media files (like downloaded videos), serve from cache first for speed.
    if (url.pathname.match(/\.(mp4|jpg|png|jpeg|svg|gif)$/)) {
        event.respondWith(
            caches.match(request).then(response => {
                return response || fetch(request).then(fetchRes => {
                    return caches.open(DYNAMIC_CACHE_NAME).then(cache => {
                        cache.put(request.url, fetchRes.clone());
                        return fetchRes;
                    });
                });
            })
        );
    // --- STRATEGY 3: Stale-While-Revalidate for App Assets ---
    // For the app shell and other same-origin assets (HTML, JS/TSX), serve from cache immediately
    // for a fast perceived load, and then update the cache with a fresh version from the network.
    } else {
        event.respondWith(
            caches.match(request).then(response => {
                const fetchPromise = fetch(request).then(networkResponse => {
                    return caches.open(DYNAMIC_CACHE_NAME).then(cache => {
                        cache.put(request, networkResponse.clone());
                        return networkResponse;
                    });
                }).catch(err => {
                     console.warn('[SW] Fetch failed, serving from cache if available.', err);
                });
                return response || fetchPromise;
            })
        );
    }
});
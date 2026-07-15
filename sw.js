// NeoSkin Service Worker
// Strategy: NETWORK-FIRST for everything.
// Always fetches fresh from network — falls back to cache only when offline.
// This guarantees users always get the latest version after every GitHub push.
const CACHE_NAME = 'neoskin-v4';

// Install — take control immediately, no waiting
self.addEventListener('install', event => {
    self.skipWaiting();
});

// Allow page to trigger skip waiting manually
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Activate — delete ALL old caches so stale files are never served
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch — NETWORK FIRST
// 1. Try network → if success, cache the fresh response and return it
// 2. If network fails (offline) → fall back to cache
// External requests (Firebase, fonts, CDN) always go straight to network
self.addEventListener('fetch', event => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Always network-only for external APIs — never cache Firebase/CDN
    const isExternal = !url.origin.includes(self.location.origin);
    if (isExternal) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Network-first for local app files (index.html, manifest, icons)
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cache the fresh response for offline fallback
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                // Offline fallback — serve from cache
                return caches.match(event.request)
                    .then(cached => cached || caches.match('./index.html'));
            })
    );
});

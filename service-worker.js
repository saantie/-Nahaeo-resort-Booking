const CACHE_NAME = 'resort-booking-v2';
const BASE_PATH = '/';  // เปลี่ยนเป็น '/' สำหรับ root hosting; ถ้ามี subpath ให้ใส่ '/Nahaeo-resort-Booking/'

// Files to cache (using relative paths)
const urlsToCache = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'app.js',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'icon-192.png',
  BASE_PATH + 'icon-512.png'
];

// Install event - cache essential files
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache).catch(err => {
          console.error('[SW] Cache addAll error:', err);
          // Don't fail installation if caching fails
          return Promise.resolve();
        });
      })
      .then(() => {
        console.log('[SW] Installed successfully');
        return self.skipWaiting(); // Activate immediately
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Activated successfully');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// Fetch event - Network first for API calls, Cache first for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip cross-origin requests except for Google Scripts
  if (url.origin !== location.origin && !url.origin.includes('script.google.com')) {
    console.log('[SW] Skipping non-origin request:', url.href);
    return;
  }

  // Network first strategy for API calls (Google Sheets data)
  if (url.origin.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the response for offline access
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          console.log('[SW] API fetch failed, falling back to cache');
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            // If no cache, return a custom offline response instead of 404
            return new Response('Offline: No data available', { status: 503 });
          });
        })
    );
    return;
  }

  // Cache first strategy for app assets
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Return cached version and update in background
          console.log('[SW] Serving from cache:', event.request.url);
          fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, responseClone);
                });
              }
            })
            .catch(() => {
              // Ignore fetch errors when updating cache
            });
          
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        console.log('[SW] Fetching from network:', event.request.url);
        return fetch(event.request)
          .then(response => {
            // Check if valid response
            if (!response || response.status !== 200) {
              console.warn('[SW] Invalid response:', response.status);
              return response;
            }
            
            // Cache the new response
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
            
            return response;
          })
          .catch(error => {
            console.error('[SW] Fetch failed:', error);
            // Return a custom offline page if available, or fallback
            return caches.match(BASE_PATH + 'index.html').then(fallback => {
              if (fallback) return fallback;
              return new Response('Resource not found and offline', { status: 404 });
            });
          });
      })
  );
});

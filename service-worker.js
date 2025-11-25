const CACHE_NAME = 'resort-booking-v2';
const BASE_PATH = '/Nahaeo-resort-Booking/';

// Files to cache (using relative paths)
const urlsToCache = [
  '/',
  'index.html',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
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
  
  // Skip cross-origin requests
  if (url.origin !== location.origin && !url.origin.includes('script.google.com')) {
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
          return caches.match(event.request);
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
        return fetch(event.request)
          .then(response => {
            // Check if valid response
            if (!response || response.status !== 200) {
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
            // Return a custom offline page if available
            return caches.match(BASE_PATH + 'index.html');
          });
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

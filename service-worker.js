const CACHE_NAME = 'tcwr-main-v4';

const urlsToCache = [
  '/', 
  '/index.html',
  '/manifest.json',
  '/service-worker.js', 
  '/Bylaws.html',
  '/Flushables.html',
  '/HallofChampions.html',
  '/Records.html',
  'contactcommish.html',
  '/dynastychat.html',
  '/main.html',
  '/rookiedraftcountdown.html',
  
  // Images 
  '/DYNASTYLOGO.png',
  '/Subject.jpeg',
  '/ainteasy.jpeg',
  '/thehomies.jpeg', 
  '/trophy3.jpeg',
  
  // Audio
  '/magicword.mp3',
  '/camp-fire.mp3',
  
  // Icons
  '/tcwr-icon-192.png',
  '/tcwr-icon-512.png'
];

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install event received, beginning caching.');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) 
      .catch((error) => {
        console.error('[Service Worker] Failed to cache resources:', error);
      })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Strategy: Network-First for HTML/JS pages so your mobile phone updates instantly
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  } else {
    // Strategy: Cache-First for static assets (Images, Audio, Icons)
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request);
      })
    );
  }
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  console.log('[Service Worker] Activate event received, cleaning up old caches.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Forces immediate activation across tabs
  );
});

// -------------------------------------------------------------
// --- 2. PUSH RECEIVER LOGIC (CRITICAL FOR NOTIFICATIONS) ---
// -------------------------------------------------------------
self.addEventListener('push', (event) => {
    let payload = event.data ? event.data.json() : {};
    
    const title = payload.sender || 'New Message Received'; 
    const bodyText = payload.content || 'Tap to view the latest chat.';

    console.log('[Service Worker] Push received with payload:', payload);

    const options = {
        body: bodyText,
        icon: '/tcwr-icon-192.png', 
        badge: '/tcwr-icon-192.png',
        vibrate: [100, 50, 100],
        data: { 
            url: '/dynastychat.html' 
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// ---------------------------------------------
// --- 3. NOTIFICATION CLICK LOGIC ---
// ---------------------------------------------
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const urlToOpen = event.notification.data.url || '/'; 

    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((windowClients) => {
            let matchingClient = windowClients.find(wc => wc.url.endsWith(urlToOpen));
            
            if (matchingClient) {
                return matchingClient.focus();
            } else {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

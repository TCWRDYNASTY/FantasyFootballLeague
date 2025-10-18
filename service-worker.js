const CACHE_NAME = 'tcwr-main-v2'; 

const urlsToCache = [
  './',
  'index.html',
  'manifest.json',
  'service-worker.js', 
  'bylaws.html',
  'Flushables.html',
  'HallofChampions.html',
  'Records.html',
  'contactcommish.html',
  'dynastychat.html',
  'main.html',
  'rookiedraftcountdown.html',
  'style.css',
  'DYNASTYLOGO.jpeg',
  // --- CORRECTED LINES BELOW ---
  'Subject.jpeg', // Corrected quotes and removed trailing comma
  'ainteasy.jpeg',
  'trophy3.jpeg', // Corrected starting quote
  'wildlifeentrance.jpeg',
  // --- Audio and Icons ---
  'prizewheel.mp3',
  'magic word.mp3',
  'camp-fire.mp3',
  'tcwr-icon-192.png',
  'tcwr-icon-512.png'
];

// --- 1. CACHING/OFFLINE LOGIC ---

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
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
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
    })
  );
});

// --- 2. PUSH RECEIVER LOGIC (CRITICAL FOR NOTIFICATIONS) ---

self.addEventListener('push', (event) => {
  // Receives the payload and displays the notification
  const data = event.data ? event.data.json() : { 
    title: 'New Notification', 
    body: 'You have a new message!' 
  };
  
  console.log('[Service Worker] Push received with data:', data);

  const title = data.title || 'Notification';
  const options = {
    body: data.body || 'You have a new notification!',
    icon: data.icon || '/tcwr-192.png', 
    badge: data.badge || '/tcwr-192.png', 
    data: { 
      url: data.url || '/' 
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// --- 3. NOTIFICATION CLICK LOGIC ---

self.addEventListener('notificationclick', (event) => {
  // Handles clicks on the displayed notification
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

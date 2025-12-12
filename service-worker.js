const CACHE_NAME = 'tcwr-main-v2'; 

const urlsToCache = [
  '/', 
  '/index.html',
  '/manifest.json',
  '/service-worker.js', 
  '/Bylaws.html',
  '/Flushables.html',
  '/HallofChampions.html',
  '/Records.html',
  '/contactcommish.html',
  '/dynastychat.html',
  '/main.html',
  '/rookiedraftcountdown.html',
  // REMOVED: '/style.css' (Add back ONLY if file exists)
  
  // Images 
  '/DYNASTYLOGO.jpeg',
  '/Subject.jpeg',
  '/ainteasy.jpeg',
  '/thehomies.jpeg', 
  '/trophy3.jpeg',
  
  // Audio
  // REMOVED: '/prizewheel.mp3' (Not in file list)
  '/magicword.mp3', // FIX: Corrected filename (removed space)
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

// -------------------------------------------------------------
// --- 2. PUSH RECEIVER LOGIC (CRITICAL FOR NOTIFICATIONS) ---
// -------------------------------------------------------------

self.addEventListener('push', (event) => {
    // Attempt to parse the payload sent from your Supabase Edge Function
    let payload = event.data ? event.data.json() : {};
    
    // The payload should contain the message row: {user_id, content, sender, etc.}
    const title = payload.sender || 'New Message Received'; 
    const bodyText = payload.content || 'Tap to view the latest chat.';

    console.log('[Service Worker] Push received with payload:', payload);

    const options = {
        body: bodyText,
        // Ensure this icon path is correct
        icon: '/tcwr-icon-192.png', 
        badge: '/tcwr-icon-192.png',
        vibrate: [100, 50, 100],
        data: { 
            // This URL will be used when the notification is clicked
            url: '/dynastychat.html' 
        }
    };

    // Show the notification to the user
    event.waitUntil(self.registration.showNotification(title, options));
});

// ---------------------------------------------
// --- 3. NOTIFICATION CLICK LOGIC ---
// ---------------------------------------------

self.addEventListener('notificationclick', (event) => {
    // Handles clicks on the displayed notification
    event.notification.close();

    // Use the URL saved in the notification's data field
    const urlToOpen = event.notification.data.url || '/'; 

    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((windowClients) => {
            let matchingClient = windowClients.find(wc => wc.url.endsWith(urlToOpen));
            
            // If the chat window is already open, focus it
            if (matchingClient) {
                return matchingClient.focus();
            } else {
                // Otherwise, open a new window to the chat page
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

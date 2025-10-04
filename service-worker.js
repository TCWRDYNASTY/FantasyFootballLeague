const CACHE_NAME = 'tcwr-main-v2'; 
const urlsToCache = [

  './',
  'index.html',
  'manifest.json',
  'service-worker.js',
 
  'main.html',
  '3-Hall-of-Champions.html', 
  '4Flushables.html',
  '7Records.html',
  '8Bylaws.html',
  'Fourth-and-Roaster.html',  
  'Sidebetwheel.html',
  'contactcommish.html',
  'rookiedraftcountdown.html',
  'underconstruction.html',
  
  'wildlifeentrance.jpeg',
  'Bucky-bear.jpg',            
  'DYNASTYLOGO.jpeg',
  'Subject.jpeg',
  'ainteasy.jpeg',
  'bylawsbackground.jpeg',
  'thehomies.jpeg',
  'trophy3.jpeg',
  'tcwr-192.png',
  'tcwr-512.png',
  
  // AUDIO ASSETS
  'magicword.mp3',
  'prizewheel.mp3',
  'camp-fire.mp3',
  
  // EXTERNAL DEPENDENCY
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install event received, beginning caching.');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // This should now succeed without a 'Request failed' error!
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

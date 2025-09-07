const cacheName = 'tcwr-v1';
const filesToCache = [
  '/',
  '/index.html',
  '/main.html',
  '/style.css',
  '/wildlifeentrance.jpeg',
  '/magicword.mp3',
  '/tcwr-192.png',
  '/tcwr-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => {
      return cache.addAll(filesToCache);
    }).catch((error) => {
      console.error('Failed to cache resources:', error);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
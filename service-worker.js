const cacheName = 'tcwr-v1';
const filesToCache = [
  '/',
  '/index.html',
  '/main.html',
  '/3Hall%20of%20Champions.html',
  '/4Flushables.html',
  '/7Records.html',
  '/8Bylaws.html',
  '/Fourth&Roaster.html',
  '/Sidebetwheel.html',
  '/contactcommish.html',
  '/rookiedraftcountdown.html',
  '/underconstruction.html',
  '/style.css',
  '/wildlifeentrance.jpeg',
  '/Bucky%20bear.jpg',
  '/DYNASTYLOGO.jpg',
  '/Subject.jpeg',
  '/ainteasy.jpeg',
  '/bylawsbackground.jpeg',
  '/thehomies.jpeg',
  '/trophy3.jpeg',
  '/magicword.mp3',
  '/prizewheel.mp3',
  '/camp-fire.mp3',
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

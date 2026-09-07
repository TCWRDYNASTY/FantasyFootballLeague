/* =========================================================
   TCWR DYNASTY SERVICE WORKER
   Website caching + Firebase Cloud Messaging
   ========================================================= */


/* =========================================================
   FIREBASE CLOUD MESSAGING
   ========================================================= */

importScripts(
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js'
);

importScripts(
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js'
);


firebase.initializeApp({
  apiKey: "AIzaSyCZYJeAJjeiaUoV2s1NBjGXVYOJtixh-qk",
  authDomain: "tcwr-dynasty.firebaseapp.com",
  projectId: "tcwr-dynasty",
  storageBucket: "tcwr-dynasty.firebasestorage.app",
  messagingSenderId: "544187199777",
  appId: "1:544187199777:web:05753208f1daee32558e60"
});


const firebaseMessaging = firebase.messaging();


/* =========================================================
   FIREBASE BACKGROUND MESSAGE HANDLER
   ========================================================= */

firebaseMessaging.onBackgroundMessage(payload => {

  console.log(
    '[Service Worker] Firebase background message received:',
    payload
  );


  const messageType =
    payload.data?.type ||
    payload.data?.messageType ||
    '';


  /* Commissioner notification */

  if (messageType === 'commissioner') {

    const notificationTitle =
      'Message from Commissioner';


    const notificationOptions = {

      body: '',

      icon: './tcwr-icon-192.png',

      badge: './tcwr-icon-192.png',

      data: {
        url: './'
      }

    };


    return self.registration.showNotification(
      notificationTitle,
      notificationOptions
    );
  }

});


/* =========================================================
   CACHE
   ========================================================= */

const CACHE_NAME = 'tcwr-main-v10';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './service-worker.js',
  './Bylaws.html',
  './Records.html',
  './contactcommish.html',
  './legends.html',
  './media.html',
  './rookiedraftcountdown.html',

  './DYNASTYLOGO.png',
  './ainteasy.jpeg',
  './thehomies.jpeg',
  './toilet.png',
  './trophy3.jpeg',
  './episode1-cover.png',
  './wildlifeentrance.jpeg',

  './tcwr-icon-192.png',
  './tcwr-icon-512.png'
];


/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener('install', event => {

  console.log(
    '[Service Worker] Install event received, beginning caching.'
  );


  event.waitUntil(

    caches.open(CACHE_NAME)

      .then(async cache => {

        const results =
          await Promise.allSettled(

            urlsToCache.map(async url => {

              try {

                const request =
                  new Request(url, {
                    cache: 'reload'
                  });


                const response =
                  await fetch(request);


                if (!response.ok) {

                  throw new Error(
                    `${url} returned HTTP ${response.status}`
                  );

                }


                await cache.put(
                  request,
                  response
                );


                console.log(
                  `[Service Worker] Cached successfully: ${url}`
                );

              }

              catch (error) {

                console.error(
                  `[Service Worker] Failed to cache: ${url}`,
                  error
                );

                throw error;

              }

            })

          );


        const failedResources =
          results.filter(
            result =>
              result.status === 'rejected'
          );


        if (failedResources.length > 0) {

          console.warn(
            `[Service Worker] ${failedResources.length} resource(s) failed to cache.`
          );

        }

      })

      .then(() => self.skipWaiting())

  );

});


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener('fetch', event => {

  const request = event.request;


  if (request.method !== 'GET') {

    return;

  }


  const url =
    new URL(request.url);


  const isPageRequest =
    request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js');


  if (isPageRequest) {

    event.respondWith(

      fetch(request)

        .then(networkResponse => {

          if (
            networkResponse &&
            networkResponse.ok &&
            networkResponse.type !== 'opaque'
          ) {

            const responseClone =
              networkResponse.clone();


            caches.open(CACHE_NAME)

              .then(cache => {

                return cache.put(
                  request,
                  responseClone
                );

              })

              .catch(error => {

                console.warn(
                  '[Service Worker] Unable to update page cache:',
                  error
                );

              });

          }


          return networkResponse;

        })

        .catch(async () => {

          const cachedResponse =
            await caches.match(request);


          if (cachedResponse) {

            return cachedResponse;

          }


          if (request.mode === 'navigate') {

            return caches.match(
              './index.html'
            );

          }


          throw new Error(
            `No network or cached response available for ${request.url}`
          );

        })

    );


    return;

  }


  event.respondWith(

    caches.match(request)

      .then(cachedResponse => {

        if (cachedResponse) {

          return cachedResponse;

        }


        return fetch(request)

          .then(networkResponse => {

            if (
              !networkResponse ||
              !networkResponse.ok ||
              networkResponse.type === 'opaque'
            ) {

              return networkResponse;

            }


            const responseClone =
              networkResponse.clone();


            caches.open(CACHE_NAME)

              .then(cache => {

                return cache.put(
                  request,
                  responseClone
                );

              })

              .catch(error => {

                console.warn(
                  '[Service Worker] Unable to cache static asset:',
                  error
                );

              });


            return networkResponse;

          });

      })

  );

});


/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener('activate', event => {

  console.log(
    '[Service Worker] Activate event received, cleaning up old caches.'
  );


  event.waitUntil(

    caches.keys()

      .then(cacheNames => {

        return Promise.all(

          cacheNames.map(cacheName => {

            if (cacheName !== CACHE_NAME) {

              console.log(
                `[Service Worker] Deleting old cache: ${cacheName}`
              );


              return caches.delete(
                cacheName
              );

            }


            return Promise.resolve(false);

          })

        );

      })

      .then(() => self.clients.claim())

  );

});


/* =========================================================
   EXISTING PUSH RECEIVER
   ========================================================= */

self.addEventListener('push', event => {

  let payload = {};


  try {

    payload =
      event.data
        ? event.data.json()
        : {};

  }

  catch (error) {

    console.warn(
      '[Service Worker] Push payload was not valid JSON:',
      error
    );


    payload = {

      content:
        event.data
          ? event.data.text()
          : ''

    };

  }


  /*
     Firebase Cloud Messaging messages are handled
     by firebaseMessaging.onBackgroundMessage above.

     Do not display the old notification for Firebase
     messages or the user could receive two notifications.
  */

  const isFirebaseMessage =
    !!(
      payload.from ||
      payload.messageId ||
      payload.collapse_key ||
      payload.notification
    );


  if (isFirebaseMessage) {

    console.log(
      '[Service Worker] Firebase push detected. Firebase Messaging will handle it.'
    );

    return;

  }


  /* Existing TCWR push notification behavior */

  const title =
    payload.sender ||
    'New Message Received';


  const bodyText =
    payload.content ||
    'Tap to view the latest chat.';


  console.log(
    '[Service Worker] Push received with payload:',
    payload
  );


  const options = {

    body: bodyText,

    icon: './tcwr-icon-192.png',

    badge: './tcwr-icon-192.png',

    vibrate: [100, 50, 100],

    data: {
      url: './dynastychat.html'
    }

  };


  event.waitUntil(

    self.registration.showNotification(
      title,
      options
    )

  );

});


/* =========================================================
   NOTIFICATION CLICK LOGIC
   ========================================================= */

self.addEventListener('notificationclick', event => {

  event.notification.close();


  const urlToOpen =
    event.notification.data?.url ||
    './';


  event.waitUntil(

    clients.matchAll({

      type: 'window',

      includeUncontrolled: true

    })

      .then(windowClients => {

        const absoluteUrl =
          new URL(
            urlToOpen,
            self.location.href
          ).href;


        const matchingClient =
          windowClients.find(

            windowClient =>
              windowClient.url === absoluteUrl ||
              windowClient.url.endsWith(urlToOpen)

          );


        if (matchingClient) {

          return matchingClient.focus();

        }


        return clients.openWindow(
          urlToOpen
        );

      })

  );

});

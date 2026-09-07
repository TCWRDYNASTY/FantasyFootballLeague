importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCZYJeAJjeiaUoV2s1NBjGXVYOJtixh-qk",
    authDomain: "tcwr-dynasty.firebaseapp.com",
    projectId: "tcwr-dynasty",
    storageBucket: "tcwr-dynasty.firebasestorage.app",
    messagingSenderId: "544187199777",
    appId: "1:544187199777:web:05753208f1daee32558e60"
});

const messaging = firebase.messaging();

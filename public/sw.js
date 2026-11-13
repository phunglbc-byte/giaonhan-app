// Service Worker for GiaoNhanApp PWA
const CACHE_NAME = 'giaonhan-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through fetch for dynamic API requests
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

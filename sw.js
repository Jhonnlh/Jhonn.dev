const CACHE_NAME = 'jhonn-sol-shell-v1';
const APP_SHELL = [
  './private.html',
  './style.css',
  './theme.js',
  './private.js',
  './pwa.js',
  './manifest.webmanifest',
  './icons/jhonn-sol-icon.svg',
  './icons/jhonn-sol-icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
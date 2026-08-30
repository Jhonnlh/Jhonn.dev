const CACHE_NAME = 'jhonn-sol-shell-v2';
const APP_SHELL = [
  './style.css',
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

  const requestPath = new URL(event.request.url).pathname;
  if (requestPath.endsWith('.html') || requestPath.endsWith('.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
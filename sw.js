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
// Manejar notificaciones push
self.addEventListener('push', (event) => {
  const data = event.data?.json?.() || {};
  const title = data.title || 'Jhonn & Sol';
  const options = {
    body: data.body || 'Nuevo mensaje',
    icon: data.icon || '❤️',
    badge: data.badge || '❤️',
    tag: 'jhonn-sol-notification',
    requireInteraction: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Manejar clics en notificaciones
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        if (clientList[i].url.includes('index.html') || clientList[i].url.endsWith('/')) return clientList[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('/index.html');
    })
  );
});

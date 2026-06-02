// sw.js — service worker: offline cache app shell + jalur notifikasi.

const CACHE = 'haribaik-v4-3';
const SHELL = [
  'index.html',
  'favorites.html',
  'css/styles.css',
  'js/config.js',
  'js/api.js',
  'js/db.js',
  'js/context.js',
  'js/chat.js',
  'js/voice.js',
  'js/theme.js',
  'js/favorites.js',
  'js/share.js',
  'js/notify.js',
  'js/app.js',
  'icons/icon.svg',
  'manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  // Jangan cache panggilan API.
  if (request.url.includes('/api/')) return;

  // Network-first untuk navigasi, cache-first untuk aset shell.
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});

// Klik notifikasi → fokus/buka app.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('index.html');
    })
  );
});

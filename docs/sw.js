// sw.js — service worker: offline cache app shell + jalur notifikasi.

const CACHE = 'haribaik-v4-47';
const SHELL = [
  'index.html',
  'favorites.html',
  'journal.html',
  'amalan.html',
  'doa.html',
  'tentang.html',
  'css/styles.css',
  'js/config.js',
  'js/tentang.js',
  'js/errlog.js',
  'js/install.js',
  'js/i18n.js',
  'js/api.js',
  'js/db.js',
  'js/context.js',
  'js/chat.js',
  'js/scope.js',
  'js/voice.js',
  'js/theme.js',
  'js/a11y.js',
  'js/settings.js',
  'js/favorites.js',
  'js/journal.js',
  'js/amalan.js',
  'js/pray.js',
  'js/qibla.js',
  'js/cloud.js',
  'vendor/supabase.js',
  'js/presence.js',
  'js/doa.js',
  'js/push.js',
  'js/tts.js',
  'js/share.js',
  'js/notify.js',
  'js/app.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/splash.jpg',
  'manifest.json',
];
// Library pihak ketiga (di-cache agar fitur Share tetap jalan offline).
const THIRD_PARTY = ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(SHELL); // shell wajib
      // Pihak ketiga: best-effort, jangan gagalkan instalasi bila offline.
      await Promise.allSettled(THIRD_PARTY.map((u) => c.add(new Request(u, { mode: 'cors' }))));
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Host statik pihak ketiga yang AMAN di-cache (aset jarang berubah).
const CACHEABLE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Jangan cache panggilan API backend.
  if (url.pathname.includes('/api/')) return;

  // PENTING: jangan cache API dinamis lintas-origin (Supabase REST/Auth/Realtime,
  // Aladhan, reverse-geocode, dll). Cache-first di sini menyebabkan BACAAN BASI →
  // sinkron antar-perangkat & dinding doa tampak tidak ter-update. Biarkan jaringan.
  const sameOrigin = url.origin === location.origin;
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.host)) return;

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

// Push masuk dari server (adzan / pengingat) → tampilkan notifikasi.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  const title = data.title || 'HariBaik 🌿';
  const opts = {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: data.tag || 'haribaik',
    data: { url: data.url || 'index.html' },
    vibrate: [80, 40, 80],
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// Endpoint langganan bisa berubah → langganan ulang dengan kunci yang sama.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    try {
      const key = e.oldSubscription && e.oldSubscription.options && e.oldSubscription.options.applicationServerKey;
      if (key) await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    } catch { /* akan dipulihkan saat app dibuka */ }
  })());
});

// Klik notifikasi → fokus/buka app pada halaman terkait.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || 'index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) if ('focus' in c) { c.navigate?.(target); return c.focus(); }
      return self.clients.openWindow(target);
    })
  );
});

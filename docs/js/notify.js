// notify.js — pengingat harian via Notification API + Service Worker.
// Konfigurasi (waktu, aktif/nonaktif) diatur di panel Pengaturan (settings.js).
//
// Catatan keterbatasan (MVP): push terjadwal yang andal pada waktu tetap memerlukan
// push server (Fase 4). Di sini pengingat dipicu saat app dibuka/kembali aktif melewati
// waktu yang disetel, dan jalur notifikasi SW sudah disiapkan.

import { Meta } from './db.js';
import { t } from './i18n.js';

export async function initNotify() {
  await maybeFireReminder();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeFireReminder();
  });
}

async function maybeFireReminder() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!(await Meta.get('reminderEnabled', false))) return;

  const time = await Meta.get('reminderTime', null);
  if (!time) return;

  const today = new Date().toDateString();
  const lastShown = await Meta.get('reminderShownDay', null);
  if (lastShown === today) return;

  const [hh, mm] = time.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hh, mm, 0, 0);

  if (now >= target) {
    show(t('rem_title'), t('rem_body'));
    await Meta.set('reminderShownDay', today);
  }
}

function show(title, body) {
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'haribaik-daily' };
  if (navigator.serviceWorker?.ready) {
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(title, opts))
      .catch(() => new Notification(title, opts));
  } else {
    new Notification(title, opts);
  }
}

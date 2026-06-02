// notify.js — pengingat harian via Notification API + Service Worker.
//
// Catatan keterbatasan (MVP): push terjadwal yang andal pada waktu tetap memerlukan
// push server (Fase 4). Di sini pengingat dipicu saat app dibuka/kembali aktif melewati
// waktu yang disetel, dan jalur notifikasi SW sudah disiapkan.

import { Meta } from './db.js';

const DEFAULT_TIME = '05:30'; // setelah Subuh

export async function initNotify(btn, toast) {
  btn?.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      toast?.('Browser tidak mendukung notifikasi');
      return;
    }
    if (Notification.permission === 'granted') {
      const time = await promptTime();
      if (time) {
        await Meta.set('reminderTime', time);
        toast?.(`Pengingat diatur pukul ${time}`);
      }
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      await Meta.set('reminderTime', DEFAULT_TIME);
      toast?.(`Pengingat aktif (pukul ${DEFAULT_TIME})`);
    } else {
      toast?.('Izin notifikasi ditolak');
    }
  });

  // Cek saat app dibuka: jika sudah lewat waktu pengingat & belum tampil hari ini.
  await maybeFireReminder();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeFireReminder();
  });
}

async function maybeFireReminder() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

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
    show('HariBaik 🌿', 'Mulai harimu dengan kebaikan. Yuk, sapa hatimu hari ini.');
    await Meta.set('reminderShownDay', today);
  }
}

function show(title, body) {
  const opts = { body, icon: 'icons/icon.svg', badge: 'icons/icon.svg', tag: 'haribaik-daily' };
  if (navigator.serviceWorker?.ready) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => {
      new Notification(title, opts);
    });
  } else {
    new Notification(title, opts);
  }
}

function promptTime() {
  const v = prompt('Atur waktu pengingat harian (format HH:MM):', '05:30');
  if (v && /^\d{2}:\d{2}$/.test(v)) return v;
  return null;
}

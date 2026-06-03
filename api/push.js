// push.js — endpoint HTTP untuk Web Push. Saat ini: kirim notifikasi UJI ke
// langganan milik pemanggil (untuk verifikasi izin + jalur enkripsi di perangkat).

import { sendPush, vapidFromEnv } from './webpush.js';

export async function handlePushTest(body) {
  const vapid = vapidFromEnv();
  if (!vapid) return { status: 503, body: { error: 'Push belum dikonfigurasi di server (VAPID).' } };

  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return { status: 400, body: { error: 'Langganan push tidak valid.' } };
  }
  const en = body?.lang === 'en';
  const payload = JSON.stringify({
    title: 'HariBaik 🌿',
    body: en ? 'Test notification successful — background notifications are active.' : 'Notifikasi uji berhasil — notifikasi latar aktif. 🎉',
    tag: 'haribaik-test', url: 'index.html',
  });
  try {
    const r = await sendPush(sub, payload, vapid);
    return { status: r.ok ? 200 : 502, body: { ok: r.ok, status: r.status } };
  } catch (e) {
    return { status: 500, body: { error: e.message } };
  }
}

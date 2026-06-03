// push.js — Web Push (notifikasi latar): berlangganan, simpan preferensi ke Supabase,
// kirim notifikasi uji. Server (scheduler) yang benar-benar mengirim adzan/pengingat.

import { VAPID_PUBLIC_KEY, BACKEND_URL } from './config.js';
import { Meta } from './db.js';
import { getLang } from './i18n.js';
import { cloudEnabled, getClient, getUser, signInAnon } from './cloud.js';

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
export function pushConfigured() {
  return !!VAPID_PUBLIC_KEY && cloudEnabled();
}

function urlB64ToU8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function reg() { return navigator.serviceWorker.ready; }

export async function isPushSubscribed() {
  if (!pushSupported()) return false;
  try { return !!(await (await reg()).pushManager.getSubscription()); } catch { return false; }
}

// Bangun baris langganan dari preferensi lokal saat ini.
async function buildRow(sub, user) {
  const j = sub.toJSON();
  const loc = await Meta.get('prayerLoc', null);
  return {
    endpoint: sub.endpoint,
    user_id: user.id,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta',
    lang: getLang(),
    reminder_enabled: !!(await Meta.get('reminderEnabled', false)),
    reminder_time: (await Meta.get('reminderTime', '05:30')) || '05:30',
    adzan_enabled: !!(await Meta.get('adzanEnabled', false)),
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
    method: 20,
    updated_at: new Date().toISOString(),
  };
}

async function upsert(sub, user) {
  const c = await getClient();
  await c.from('push_subscriptions').upsert(await buildRow(sub, user), { onConflict: 'endpoint' });
}

// Aktifkan: minta izin, pastikan akun (anon boleh), berlangganan, simpan preferensi.
export async function enablePush() {
  if (!pushSupported()) throw new Error('unsupported');
  if (!pushConfigured()) throw new Error('unconfigured');
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');

  let user = await getUser();
  if (!user) {
    const { error } = await signInAnon();
    if (error) throw new Error('auth');
    user = await getUser();
    if (!user) throw new Error('auth');
  }
  const r = await reg();
  let sub = await r.pushManager.getSubscription();
  if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(VAPID_PUBLIC_KEY) });
  await upsert(sub, user);
  return true;
}

// Perbarui preferensi (mis. setelah ubah waktu pengingat, toggle adzan, atau lokasi).
// Hanya jika sudah berlangganan & login — kalau tidak, no-op.
export async function syncPushPrefs() {
  if (!pushSupported() || !pushConfigured()) return;
  const sub = await (await reg()).pushManager.getSubscription();
  if (!sub) return;
  const user = await getUser();
  if (!user) return;
  try { await upsert(sub, user); } catch { /* abaikan */ }
}

export async function disablePush() {
  if (!pushSupported()) return;
  const sub = await (await reg()).pushManager.getSubscription();
  if (!sub) return;
  try { const c = await getClient(); await c.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); } catch { /* */ }
  try { await sub.unsubscribe(); } catch { /* */ }
}

// Kirim notifikasi uji ke perangkat ini (verifikasi izin + jalur push end-to-end).
export async function sendTestPush() {
  if (!pushConfigured()) throw new Error('unconfigured');
  await enablePush(); // pastikan berlangganan
  const sub = await (await reg()).pushManager.getSubscription();
  const j = sub.toJSON();
  const res = await fetch(`${BACKEND_URL}/api/push/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: { endpoint: sub.endpoint, keys: j.keys }, lang: getLang() }),
  });
  if (!res.ok) throw new Error(`test ${res.status}`);
  return res.json();
}

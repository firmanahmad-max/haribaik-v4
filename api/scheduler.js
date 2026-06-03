// scheduler.js — pengirim notifikasi latar (adzan + pengingat harian).
// Berjalan tiap 30 detik: baca semua langganan via Supabase service role,
// hitung waktu lokal tiap pengguna (tz), kirim push bila waktunya tiba.
// Dedupe per slot harian (last_sent) agar tidak ganda. No-op bila env belum lengkap.

import { sendPush, vapidFromEnv } from './webpush.js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TICK_MS = 30_000;

// Label adzan → field Aladhan (selaras dengan docs/js/pray.js).
const PRAYER_FIELD = { Subuh: 'Fajr', Dzuhur: 'Dhuhr', Ashar: 'Asr', Maghrib: 'Maghrib', Isya: 'Isha' };
const PRAYER_EN = { Subuh: 'Fajr', Dzuhur: 'Dhuhr', Ashar: 'Asr', Maghrib: 'Maghrib', Isya: 'Isha' };

const prayerCache = new Map(); // key → { times, at }

function localParts(tz, date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'Asia/Jakarta',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

async function fetchSubs() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`fetch subs ${res.status}`);
  return res.json();
}

async function patchLastSent(endpoint, lastSent) {
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ last_sent: lastSent, updated_at: new Date().toISOString() }),
  });
}

async function deleteSub(endpoint) {
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

async function prayerTimes(lat, lng, dateStr, method) {
  const key = `${dateStr}|${lat.toFixed(2)},${lng.toFixed(2)}|${method}`;
  const hit = prayerCache.get(key);
  if (hit) return hit.times;
  const [y, m, d] = dateStr.split('-');
  const url = `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${lat}&longitude=${lng}&method=${method}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`aladhan ${res.status}`);
  const json = await res.json();
  const t = json?.data?.timings || {};
  const times = {};
  for (const [label, field] of Object.entries(PRAYER_FIELD)) times[label] = String(t[field] || '').slice(0, 5);
  if (prayerCache.size > 500) prayerCache.clear();
  prayerCache.set(key, { times, at: Date.now() });
  return times;
}

function reminderPayload(lang) {
  const en = lang === 'en';
  return JSON.stringify({
    title: 'HariBaik 🌿',
    body: en ? 'Start your day with kindness. Greet your heart today.' : 'Mulai harimu dengan kebaikan. Yuk, sapa hatimu hari ini.',
    tag: 'haribaik-daily', url: 'index.html',
  });
}
function adzanPayload(prayer, lang) {
  const en = lang === 'en';
  const name = en ? (PRAYER_EN[prayer] || prayer) : prayer;
  return JSON.stringify({
    title: en ? `🕌 ${name} time` : `🕌 Waktunya ${name}`,
    body: en ? `It's time for ${name}. May your prayer be accepted.` : `Sudah masuk waktu ${name}. Semoga ibadahmu diterima.`,
    tag: 'haribaik-adzan', url: 'amalan.html',
  });
}

function pruneToday(lastSent, date) {
  const out = {};
  for (const k of Object.keys(lastSent || {})) if (k.startsWith(`${date}:`)) out[k] = true;
  return out;
}

async function tick(vapid) {
  let subs;
  try { subs = await fetchSubs(); } catch { return; }
  for (const sub of subs) {
    const tz = sub.tz || 'Asia/Jakarta';
    const { date, hm } = localParts(tz);
    const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    const ls = pruneToday(sub.last_sent, date);
    const before = JSON.stringify(ls);
    const due = [];

    if (sub.reminder_enabled && sub.reminder_time === hm && !ls[`${date}:reminder`]) {
      due.push({ slot: `${date}:reminder`, payload: reminderPayload(sub.lang) });
    }
    if (sub.adzan_enabled && sub.lat != null && sub.lng != null) {
      try {
        const times = await prayerTimes(sub.lat, sub.lng, date, sub.method || 20);
        for (const p of (sub.adzan_prayers || Object.keys(PRAYER_FIELD))) {
          if (times[p] === hm && !ls[`${date}:${p}`]) due.push({ slot: `${date}:${p}`, payload: adzanPayload(p, sub.lang) });
        }
      } catch { /* abaikan kegagalan Aladhan untuk sub ini */ }
    }

    let gone = false;
    for (const item of due) {
      try {
        const r = await sendPush(subscription, item.payload, vapid);
        if (r.gone) { gone = true; break; }
        if (r.ok) ls[item.slot] = true;
      } catch { /* abaikan; coba lagi tick berikutnya */ }
    }
    if (gone) { try { await deleteSub(sub.endpoint); } catch { /* */ } continue; }
    if (JSON.stringify(ls) !== before) { try { await patchLastSent(sub.endpoint, ls); } catch { /* */ } }
  }
}

let timer = null;
export function startScheduler() {
  const vapid = vapidFromEnv();
  if (!vapid || !SUPABASE_URL || !SERVICE_KEY) {
    console.log('[scheduler] nonaktif — butuh VAPID_* + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  if (timer) return;
  console.log('[scheduler] aktif — cek tiap 30 detik untuk adzan & pengingat');
  timer = setInterval(() => { tick(vapid).catch(() => {}); }, TICK_MS);
  timer.unref?.();
}

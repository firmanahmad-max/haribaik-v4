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

// ---------- Notifikasi sosial (aamiin / balasan) ----------
async function fetchNotifs() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications?pushed=eq.false&select=*&limit=200`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`fetch notifs ${res.status}`);
  return res.json();
}

async function fetchSubsForUser(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${userId}&select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return [];
  return res.json();
}

async function markNotifPushed(n) {
  const q = `user_id=eq.${n.user_id}&kind=eq.${encodeURIComponent(n.kind)}&ref_id=eq.${n.ref_id}`;
  await fetch(`${SUPABASE_URL}/rest/v1/notifications?${q}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ pushed: true, updated_at: new Date().toISOString() }),
  });
}

function notifPayload(kind, count, lang) {
  const en = lang === 'en';
  if (kind === 'reply') {
    return JSON.stringify({
      title: en ? '💬 Support for your prayer' : '💬 Ada dukungan untuk doamu',
      body: count > 1
        ? (en ? `${count} new replies to your prayer.` : `${count} balasan baru untuk doamu.`)
        : (en ? 'Your prayer received support.' : 'Doamu mendapat dukungan.'),
      tag: 'hb-reply', url: 'doa.html',
    });
  }
  return JSON.stringify({
    title: en ? '🤍 Your prayer was said Amin' : '🤍 Doamu diaminkan',
    body: count > 1
      ? (en ? `${count} people said Amin to your prayer.` : `${count} orang mengaminkan doamu.`)
      : (en ? 'Someone said Amin to your prayer.' : 'Seseorang mengaminkan doamu.'),
    tag: 'hb-aamiin', url: 'doa.html',
  });
}

// Kuras antrean notifikasi: kirim ke semua langganan penerima, lalu tandai terkirim.
async function drainNotifications(vapid) {
  let notifs;
  try { notifs = await fetchNotifs(); } catch { return; }
  if (!notifs.length) return;
  const subsCache = new Map(); // user_id → subs[]
  for (const n of notifs) {
    let subs = subsCache.get(n.user_id);
    if (!subs) { subs = await fetchSubsForUser(n.user_id); subsCache.set(n.user_id, subs); }
    let anySent = false;
    for (const sub of subs) {
      const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      try {
        const r = await sendPush(subscription, notifPayload(n.kind, n.count, sub.lang), vapid);
        if (r.gone) { try { await deleteSub(sub.endpoint); } catch { /* */ } continue; }
        if (r.ok) anySent = true;
      } catch { /* abaikan sub ini */ }
    }
    // Tandai terkirim bila ada yang berhasil, ATAU bila penerima tak punya langganan
    // (agar antrean tidak menumpuk untuk pengguna tanpa push).
    if (anySent || subs.length === 0) { try { await markNotifPushed(n); } catch { /* */ } }
  }
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
  console.log('[scheduler] aktif — cek tiap 30 detik untuk adzan, pengingat & notifikasi sosial');
  timer = setInterval(() => {
    tick(vapid).catch(() => {});
    drainNotifications(vapid).catch(() => {});
  }, TICK_MS);
  timer.unref?.();
}

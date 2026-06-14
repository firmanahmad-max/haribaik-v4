// presence.js — indikator pengguna online via Supabase Realtime broadcast.
// Pendekatan heartbeat: setiap klien menyiarkan "hello" tiap 20 detik. Klien lain
// mencatat pengirim & waktu terakhirnya; entri yang sudah > 45 detik tanpa kabar
// dianggap offline. Hitungan = entri segar di Map. Hindari kebergantungan pada
// fitur "presence" Supabase yang butuh konfigurasi tambahan di sisi project.

import { getClient, cloudEnabled } from './cloud.js';

let channel = null;
let me = null;
const seen = new Map(); // id -> lastSeenMs
const HEARTBEAT_MS = 20_000;
const STALE_MS = 45_000;

function deviceId() {
  try {
    let id = localStorage.getItem('hb_devId');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('hb_devId', id); }
    return id;
  } catch { return 'd-' + Math.random().toString(36).slice(2); }
}

function tickUI(numEl) {
  const now = Date.now();
  for (const [k, ts] of seen) if (now - ts > STALE_MS) seen.delete(k);
  const n = seen.size;
  numEl.textContent = n;
  const wrap = numEl.closest('.presence');
  if (wrap) wrap.hidden = n < 1;
}

export async function initPresence(numEl) {
  if (!cloudEnabled() || !numEl) return;
  if (channel) return;
  const c = await getClient();
  if (!c) return;

  me = deviceId();
  seen.set(me, Date.now()); // hitung diri sendiri

  channel = c.channel('online-count', { config: { broadcast: { self: false } } });

  channel.on('broadcast', { event: 'hi' }, ({ payload }) => {
    if (!payload?.id || payload.id === me) return;
    seen.set(payload.id, Date.now());
    tickUI(numEl);
  });
  channel.on('broadcast', { event: 'bye' }, ({ payload }) => {
    if (!payload?.id) return;
    seen.delete(payload.id);
    tickUI(numEl);
  });

  const sayHi = () => {
    seen.set(me, Date.now()); // jaga agar diri sendiri tidak ikut dianggap stale
    return channel.send({ type: 'broadcast', event: 'hi', payload: { id: me } }).catch(() => {});
  };
  const sayBye = () => { try { channel.send({ type: 'broadcast', event: 'bye', payload: { id: me } }); } catch { /* abaikan */ } };

  // Pasang interval hanya SEKALI, walau status SUBSCRIBED dipicu ulang saat
  // websocket reconnect (cegah heartbeat ganda & memory leak interval).
  let intervalsSet = false;
  channel.subscribe(async (status) => {
    if (status !== 'SUBSCRIBED') return;
    await sayHi();
    if (intervalsSet) return;
    intervalsSet = true;
    setInterval(sayHi, HEARTBEAT_MS);
    setInterval(() => tickUI(numEl), 5_000);
  });

  window.addEventListener('pagehide', sayBye);
  window.addEventListener('beforeunload', sayBye);

  tickUI(numEl);
}

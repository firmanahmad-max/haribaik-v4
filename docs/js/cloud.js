// cloud.js — integrasi Supabase (Fase 4): auth, sinkron multi-perangkat, dinding doa.
// Klien langsung ke Supabase memakai anon key; keamanan dijaga RLS.
// supabase-js dimuat secara DINAMIS agar kegagalan CDN tidak memblokir aplikasi.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { Journal, Favorites, Deeds, Meta, dayKey } from './db.js';
import { t } from './i18n.js';

let supabase = null;
let createClientFn = null;

export function cloudEnabled() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('gagal memuat ' + src));
    document.head.appendChild(s);
  });
}

// Muat supabase-js dari bundel UMD SATU FILE (same-origin → di-cache SW, tanpa
// waterfall esm.sh yang lambat). Fallback ke CDN bila berkas lokal gagal.
async function ensureLib() {
  if (createClientFn) return createClientFn;
  if (!window.supabase) {
    try { await loadScript('vendor/supabase.js'); }
    catch { await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'); }
  }
  if (!window.supabase || !window.supabase.createClient) throw new Error('Pustaka cloud gagal dimuat');
  createClientFn = window.supabase.createClient;
  return createClientFn;
}

export async function getClient() {
  if (!cloudEnabled()) return null;
  if (!supabase) {
    const createClient = await ensureLib();
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Lewati Web Locks (navigator.locks) yang bisa deadlock saat reload → UI blank.
        lock: async (_name, _acquireTimeout, fn) => fn(),
      },
    });
  }
  return supabase;
}

// ---------- Auth ----------
export async function getUser() {
  const c = await getClient();
  if (!c) return null;
  // Pakai getSession() (baca dari storage, lokal & cepat) — getUser() memanggil jaringan
  // dan bisa menggantung saat reload. Tambah timeout agar UI tak pernah blank.
  try {
    const res = await Promise.race([
      c.auth.getSession(),
      new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), 4000)),
    ]);
    return res?.data?.session?.user || null;
  } catch {
    return null;
  }
}
export async function signInEmail(email) {
  const c = await getClient();
  return c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } });
}
export async function signInAnon() {
  const c = await getClient();
  return c.auth.signInAnonymously();
}
export async function signOut() {
  const c = await getClient();
  return c.auth.signOut();
}
export async function onAuth(cb) {
  const c = await getClient();
  c?.auth.onAuthStateChange((_e, session) => cb(session?.user || null));
}
// Upgrade akun anonim → email (mempertahankan data & user_id yang sama).
// Mengirim tautan konfirmasi ke email; setelah diklik, akun anonim menjadi permanen.
export async function linkEmail(email) {
  const c = await getClient();
  return c.auth.updateUser({ email }, { emailRedirectTo: location.href.split('#')[0] });
}

// ---------- Indikator sinkron (chip kecil pojok bawah) ----------
function syncChip() {
  let el = document.getElementById('cloudSyncChip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cloudSyncChip';
    el.className = 'sync-chip';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}
export function showSyncStatus(state) {
  const map = {
    syncing: { txt: t('sync_syncing'), cls: 'sync-chip show' },
    synced: { txt: t('sync_done'), cls: 'sync-chip show ok' },
    error: { txt: t('sync_fail'), cls: 'sync-chip show err' },
  };
  const s = map[state];
  if (!s) return;
  const el = syncChip();
  el.textContent = s.txt;
  el.className = s.cls;
  if (state !== 'syncing') setTimeout(() => { el.className = 'sync-chip'; }, 2600);
}

// Dipakai SETIAP halaman saat dimuat: sinkron latar + tampilkan indikator,
// muat ulang otomatis ketika baru sign-in (mis. kembali dari magic link),
// dan panggil onSynced agar halaman me-render ulang data terbaru.
export async function initCloudSync(onSynced) {
  if (!cloudEnabled()) return;
  let hadUser = false;
  let busy = false;

  // forceRender=true → render & tampilkan chip apa pun hasilnya (mis. saat awal/manual).
  // Saat latar (fokus/berkala), hanya render + chip bila benar ada data baru masuk.
  const run = async (forceRender) => {
    if (busy) return;
    const u = await getUser();
    if (!u) return;
    busy = true;
    if (forceRender) showSyncStatus('syncing');
    try {
      const r = await syncNow(u);
      const didChange = !!(r && r.changed);
      if (forceRender || didChange) showSyncStatus('synced');
      if (forceRender || didChange) await onSynced?.();
    } catch {
      if (forceRender) showSyncStatus('error');
    } finally {
      busy = false;
    }
  };

  try {
    const u = await getUser();
    hadUser = !!u;
    if (u) await run(true);
  } catch { /* abaikan */ }

  onAuth(async (user) => {
    if (user && !hadUser) {
      hadUser = true;
      showSyncStatus('syncing');
      try { await syncNow(user); } catch { /* abaikan */ }
      location.reload();
    }
    if (!user) hadUser = false;
  });

  // Segarkan agar aktivitas dari perangkat lain muncul: saat tab kembali aktif + berkala.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(false); });
  window.addEventListener('focus', () => run(false));
  setInterval(() => { if (document.visibilityState === 'visible') run(false); }, 60000);
}

// ---------- Sinkron dua arah (gabung lokal ⇄ cloud) ----------
// Setelan skalar (last-write, tapi tak menimpa nilai cloud dgn null).
const SCALAR_SETTINGS = ['reminderTime', 'reminderEnabled', 'prayerLoc', 'adzanEnabled', 'imsakTime', 'iftarTime'];

// Normalisasi daftar challenge (dukung bentuk lama: objek tunggal `challenge`).
function normChallenges(val) {
  if (Array.isArray(val)) return val.filter((x) => x && x.habit);
  if (val && val.habit) return [{ ...val }];
  return [];
}
// Gabung challenge dari 2 perangkat berdasarkan id/nama; days di-union (tak hilang).
function mergeChallenges(localVal, cloudVal) {
  const out = new Map();
  const put = (c) => {
    if (!c || !c.habit) return;
    const key = c.id || ('h:' + c.habit.toLowerCase());
    const ex = out.get(key);
    if (!ex) { out.set(key, { ...c, id: c.id || key, days: c.days || {} }); return; }
    out.set(key, {
      ...ex,
      days: { ...(ex.days || {}), ...(c.days || {}) },
      target: Math.max(ex.target || 30, c.target || 30),
      startDay: ex.startDay && c.startDay ? (ex.startDay < c.startDay ? ex.startDay : c.startDay) : (ex.startDay || c.startDay),
    });
  };
  normChallenges(localVal).forEach(put);
  normChallenges(cloudVal).forEach(put);
  return [...out.values()];
}
// Gabung riwayat challenge (union, cap 20 terakhir).
function mergeHistory(localVal, cloudVal) {
  const seen = new Set(); const out = [];
  for (const h of [...(Array.isArray(cloudVal) ? cloudVal : []), ...(Array.isArray(localVal) ? localVal : [])]) {
    if (!h || !h.habit) continue;
    const key = `${h.habit}|${h.startDay}|${h.finishedDay}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(h);
  }
  return out.slice(-20);
}

// Gabung memori AI (item {text,ts}) dari 2 perangkat: union by teks, urut waktu, cap 20.
function mergeMemory(localVal, cloudVal) {
  const all = [...(Array.isArray(cloudVal) ? cloudVal : []), ...(Array.isArray(localVal) ? localVal : [])]
    .filter((m) => m && m.text);
  all.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const seen = new Set(); const out = [];
  for (const m of all) {
    const low = String(m.text).toLowerCase().trim();
    if (seen.has(low)) continue;
    seen.add(low); out.push({ text: m.text, ts: m.ts || Date.now() });
  }
  return out.slice(-20);
}

export async function syncNow(user) {
  const c = await getClient();
  if (!c || !user) return { ok: false, changed: false };
  let changed = false;

  // ---- PROFILE + SETTINGS ----
  const localProfile = (await Meta.get('profile', null));
  const { data: cloudProf } = await c.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const cs = (cloudProf && cloudProf.settings) || {};
  if (cloudProf) {
    if (!localProfile || !localProfile.nama) {
      await Meta.set('profile', { nama: cloudProf.nama || '', goal: cloudProf.goal || '', gender: cloudProf.gender || '', usia: cloudProf.usia || '', peran: cloudProf.peran || '' });
      if (cloudProf.nama) changed = true;
    }
    // Tarik setelan skalar yang masih kosong di lokal.
    for (const k of SCALAR_SETTINGS) {
      const local = await Meta.get(k, null);
      if ((local == null || local === '') && cs[k] != null) { await Meta.set(k, cs[k]); changed = true; }
    }
  }

  // ---- CHALLENGES + RIWAYAT (gabung per item — tak saling menimpa) ----
  const localChallenges = await Meta.get('challenges', null);
  const localHistory = await Meta.get('challengeHistory', null);
  const mergedHistory = mergeHistory(localHistory, cs.challengeHistory);
  const finished = new Set(mergedHistory.map((h) => `${h.habit}|${h.startDay}`));
  const mergedChallenges = mergeChallenges(localChallenges, cs.challenges ?? cs.challenge)
    .filter((x) => !finished.has(`${x.habit}|${x.startDay}`)); // yang sudah selesai di salah satu perangkat, keluar dari aktif
  if (JSON.stringify(localChallenges || []) !== JSON.stringify(mergedChallenges)) { await Meta.set('challenges', mergedChallenges); changed = true; }
  if (JSON.stringify(localHistory || []) !== JSON.stringify(mergedHistory)) { await Meta.set('challengeHistory', mergedHistory); changed = true; }

  // ---- MEMORI AI (gabung berdasarkan teks, batasi 20 terbaru) ----
  const localMem = (await Meta.get('aiMemory', null)) || [];
  const mergedMem = mergeMemory(localMem, cs.aiMemory);
  if (JSON.stringify(localMem) !== JSON.stringify(mergedMem)) { await Meta.set('aiMemory', mergedMem); changed = true; }

  // Susun setelan untuk DIDORONG: utamakan lokal, jangan timpa nilai cloud dengan null.
  const settings = { challenges: mergedChallenges, challengeHistory: mergedHistory, aiMemory: mergedMem };
  for (const k of SCALAR_SETTINGS) {
    const local = await Meta.get(k, null);
    settings[k] = (local != null && local !== '') ? local : (cs[k] ?? null);
  }
  const lp = (await Meta.get('profile', {})) || {};
  await c.from('profiles').upsert({ id: user.id, nama: lp.nama || '', goal: lp.goal || '', gender: lp.gender || '', usia: lp.usia || '', peran: lp.peran || '', settings, updated_at: new Date().toISOString() });

  // ---- JOURNAL (gabung berdasarkan ts+mood) ----
  const localJ = (await Journal.all()) || [];
  const { data: cloudJ } = await c.from('journal').select('*').eq('user_id', user.id);
  const ck = new Set((cloudJ || []).map((e) => `${e.ts}|${e.mood}`));
  const lk = new Set(localJ.map((e) => `${e.ts}|${e.mood}`));
  const pushJ = localJ.filter((e) => !ck.has(`${e.ts}|${e.mood}`)).map((e) => ({ user_id: user.id, mood: e.mood, note: e.note || '', ts: e.ts, day: e.day || dayKey(e.ts), source: e.source || null }));
  if (pushJ.length) await c.from('journal').insert(pushJ);
  for (const e of (cloudJ || [])) if (!lk.has(`${e.ts}|${e.mood}`)) { await Journal.add({ mood: e.mood, note: e.note || '', ts: e.ts, source: e.source }); changed = true; }

  // ---- FAVORITES (gabung berdasarkan source+translation) ----
  const localF = (await Favorites.all()) || [];
  const { data: cloudF } = await c.from('favorites').select('*').eq('user_id', user.id);
  const cfk = new Set((cloudF || []).map((e) => `${e.source}|${e.translation}`));
  const lfk = new Set(localF.map((e) => `${e.source}|${e.translation}`));
  const pushF = localF.filter((e) => !cfk.has(`${e.source}|${e.translation}`)).map((e) => ({ user_id: user.id, arabic: e.arabic, translation: e.translation, source: e.source, source_type: e.source_type, ts: e.ts }));
  if (pushF.length) await c.from('favorites').insert(pushF);
  for (const e of (cloudF || [])) if (!lfk.has(`${e.source}|${e.translation}`)) { await Favorites.add({ arabic: e.arabic, translation: e.translation, source: e.source, source_type: e.source_type }); changed = true; }

  // ---- DEEDS (gabung per hari, OR semua flag) ----
  const localD = (await Deeds.all()) || [];
  const { data: cloudD } = await c.from('deeds').select('*').eq('user_id', user.id);
  const cByDay = {}; (cloudD || []).forEach((d) => { cByDay[d.day] = d; });
  const lByDay = {}; localD.forEach((d) => { lByDay[d.day] = d; });
  const upserts = [];
  for (const day of new Set([...Object.keys(cByDay), ...Object.keys(lByDay)])) {
    const cd = cByDay[day]?.data;
    const ld = lByDay[day];
    const merged = {
      salat: { ...(cd?.salat || {}), ...(ld?.salat || {}) },
      tilawah: !!(cd?.tilawah || ld?.tilawah),
      puasa: !!(cd?.puasa || ld?.puasa),
    };
    const ldNorm = ld ? { salat: ld.salat || {}, tilawah: !!ld.tilawah, puasa: !!ld.puasa } : null;
    if (JSON.stringify(ldNorm) !== JSON.stringify(merged)) { await Deeds.set(day, merged); changed = true; }
    upserts.push({ user_id: user.id, day, data: merged, updated_at: new Date().toISOString() });
  }
  if (upserts.length) await c.from('deeds').upsert(upserts);

  await Meta.set('lastSync', Date.now());
  return { ok: true, changed };
}

// ---------- Dinding Doa ----------
export async function listDoa(limit = 50) {
  const c = await getClient();
  // Saring doa tersembunyi (dilaporkan). Bila kolom `hidden` belum ada (migrasi
  // keamanan belum dijalankan), jatuh ke kueri tanpa filter agar feed tetap jalan.
  let { data, error } = await c.from('doa_requests').select('*').eq('hidden', false).order('created_at', { ascending: false }).limit(limit);
  if (error && /hidden/.test(error.message || '')) {
    ({ data, error } = await c.from('doa_requests').select('*').order('created_at', { ascending: false }).limit(limit));
  }
  if (error) throw error;
  return data || [];
}
// Laporkan doa. Setelah ambang laporan tercapai, doa otomatis disembunyikan (di server).
export async function reportDoa(doaId, reason) {
  const c = await getClient();
  const { error } = await c.rpc('report_doa', { p_doa: doaId, p_reason: (reason || '').slice(0, 200) });
  if (error) throw error;
}
export async function myAamiins() {
  const u = await getUser();
  if (!u) return new Set();
  const c = await getClient();
  const { data } = await c.from('aamiins').select('doa_id').eq('user_id', u.id);
  return new Set((data || []).map((a) => a.doa_id));
}
export async function postDoa(content, displayName) {
  const u = await getUser();
  const c = await getClient();
  const { data, error } = await c.from('doa_requests')
    .insert({ user_id: u.id, content: content.slice(0, 300), display_name: (displayName || 'Anonim').slice(0, 40) })
    .select().single();
  if (error) throw error;
  return data;
}
export async function aamiin(doaId) {
  const c = await getClient();
  const { data, error } = await c.rpc('add_aamiin', { p_doa: doaId });
  if (error) throw error;
  return data;
}
export async function deleteDoa(id) {
  const c = await getClient();
  const { error } = await c.from('doa_requests').delete().eq('id', id);
  if (error) throw error;
}
export async function subscribeDoa(onInsert, onUpdate) {
  const c = await getClient();
  const ch = c.channel('doa-wall')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doa_requests' }, (p) => onInsert(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doa_requests' }, (p) => onUpdate?.(p.new))
    .subscribe();
  return () => c.removeChannel(ch);
}

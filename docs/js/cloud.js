// cloud.js — integrasi Supabase (Fase 4): auth, sinkron multi-perangkat, dinding doa.
// Klien langsung ke Supabase memakai anon key; keamanan dijaga RLS.
// supabase-js dimuat secara DINAMIS agar kegagalan CDN tidak memblokir aplikasi.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { Journal, Favorites, Deeds, Meta } from './db.js';
import { t } from './i18n.js';

let supabase = null;
let createClientFn = null;

export function cloudEnabled() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function ensureLib() {
  if (!createClientFn) {
    const mod = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    createClientFn = mod.createClient;
  }
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
  try {
    const u = await getUser();
    hadUser = !!u;
    if (u) {
      showSyncStatus('syncing');
      try { await syncNow(u); showSyncStatus('synced'); await onSynced?.(); }
      catch { showSyncStatus('error'); }
    }
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
}

// ---------- Sinkron dua arah (gabung lokal ⇄ cloud) ----------
const SETTINGS_KEYS = ['challenge', 'challengeHistory', 'reminderTime', 'reminderEnabled', 'prayerLoc', 'adzanEnabled', 'imsakTime', 'iftarTime'];

export async function syncNow(user) {
  const c = await getClient();
  if (!c || !user) return { ok: false };

  // ---- PROFILE + SETTINGS ----
  const localProfile = (await Meta.get('profile', null));
  const { data: cloudProf } = await c.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (cloudProf) {
    if (!localProfile || !localProfile.nama) {
      await Meta.set('profile', { nama: cloudProf.nama || '', goal: cloudProf.goal || '', gender: cloudProf.gender || '', usia: cloudProf.usia || '', peran: cloudProf.peran || '' });
    }
    const s = cloudProf.settings || {};
    for (const k of SETTINGS_KEYS) {
      const local = await Meta.get(k, null);
      if ((local == null || local === '') && s[k] != null) await Meta.set(k, s[k]);
    }
  }
  const settings = {};
  for (const k of SETTINGS_KEYS) settings[k] = await Meta.get(k, null);
  const lp = (await Meta.get('profile', {})) || {};
  await c.from('profiles').upsert({ id: user.id, nama: lp.nama || '', goal: lp.goal || '', gender: lp.gender || '', usia: lp.usia || '', peran: lp.peran || '', settings, updated_at: new Date().toISOString() });

  // ---- JOURNAL (gabung berdasarkan ts+mood) ----
  const localJ = (await Journal.all()) || [];
  const { data: cloudJ } = await c.from('journal').select('*').eq('user_id', user.id);
  const ck = new Set((cloudJ || []).map((e) => `${e.ts}|${e.mood}`));
  const lk = new Set(localJ.map((e) => `${e.ts}|${e.mood}`));
  const pushJ = localJ.filter((e) => !ck.has(`${e.ts}|${e.mood}`)).map((e) => ({ user_id: user.id, mood: e.mood, note: e.note || '', ts: e.ts, day: e.day, source: e.source || null }));
  if (pushJ.length) await c.from('journal').insert(pushJ);
  for (const e of (cloudJ || [])) if (!lk.has(`${e.ts}|${e.mood}`)) await Journal.add({ mood: e.mood, note: e.note || '', ts: e.ts, source: e.source });

  // ---- FAVORITES (gabung berdasarkan source+translation) ----
  const localF = (await Favorites.all()) || [];
  const { data: cloudF } = await c.from('favorites').select('*').eq('user_id', user.id);
  const cfk = new Set((cloudF || []).map((e) => `${e.source}|${e.translation}`));
  const lfk = new Set(localF.map((e) => `${e.source}|${e.translation}`));
  const pushF = localF.filter((e) => !cfk.has(`${e.source}|${e.translation}`)).map((e) => ({ user_id: user.id, arabic: e.arabic, translation: e.translation, source: e.source, source_type: e.source_type, ts: e.ts }));
  if (pushF.length) await c.from('favorites').insert(pushF);
  for (const e of (cloudF || [])) if (!lfk.has(`${e.source}|${e.translation}`)) await Favorites.add({ arabic: e.arabic, translation: e.translation, source: e.source, source_type: e.source_type });

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
    await Deeds.set(day, merged);
    upserts.push({ user_id: user.id, day, data: merged, updated_at: new Date().toISOString() });
  }
  if (upserts.length) await c.from('deeds').upsert(upserts);

  await Meta.set('lastSync', Date.now());
  return { ok: true };
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

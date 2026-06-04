// errlog.js — monitoring error ringan (QA rilis). Tanpa dependency: kirim error
// klien langsung ke tabel Supabase `app_errors` via REST + anon key (best-effort).
// Privasi: hanya info teknis (pesan/stack/halaman/UA) — tidak mengirim data pribadi.
// Tabel hanya bisa di-INSERT (RLS), dibaca lewat dashboard/service role saja.

import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_VERSION } from './config.js';

const MAX_PER_SESSION = 8; // batasi agar tidak membanjiri
let sent = 0;
const seen = new Set(); // dedupe pesan identik per sesi

function post(payload) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  if (!navigator.onLine) return;
  if (sent >= MAX_PER_SESSION) return;
  const sig = `${payload.message}|${payload.lineno}|${payload.colno}`;
  if (seen.has(sig)) return;
  seen.add(sig);
  sent++;
  try {
    fetch(`${SUPABASE_URL}/rest/v1/app_errors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch { /* abaikan */ }
}

function record(message, source, lineno, colno, stack) {
  post({
    message: String(message || 'unknown').slice(0, 500),
    source: String(source || location.pathname).slice(0, 300),
    lineno: Number(lineno) || null,
    colno: Number(colno) || null,
    stack: stack ? String(stack).slice(0, 2000) : null,
    page: location.pathname,
    ua: navigator.userAgent.slice(0, 300),
    app_version: APP_VERSION || null,
  });
}

window.addEventListener('error', (e) => {
  // Abaikan error pemuatan resource (img/script) tanpa pesan berguna.
  if (e.message || e.error) record(e.message, e.filename, e.lineno, e.colno, e.error?.stack);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  record(r?.message || String(r), 'promise', null, null, r?.stack);
});

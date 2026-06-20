// tentang.js — halaman Tentang & Disclaimer: init tema + terjemahan UI chrome.
// Muat daftar donatur dinamis dari Supabase (fallback ke daftar statis di HTML
// bila cloud tidak terkonfigurasi / migrasi belum dijalankan / koneksi gagal).
import { initTheme } from './theme.js';
import { applyI18n } from './i18n.js';
import { cloudEnabled, getClient } from './cloud.js';

applyI18n();
initTheme(document.getElementById('themeBtn'));

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
function fmtDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s || '');
}

async function loadDonors() {
  if (!cloudEnabled()) return;
  const tbody = document.getElementById('donorTbody');
  if (!tbody) return;
  try {
    const c = await getClient();
    if (!c) return;
    const { data, error } = await c
      .from('donors')
      .select('display_name, donated_at, created_at')
      .order('donated_at', { ascending: true })
      .order('created_at', { ascending: true });
    if (error || !Array.isArray(data) || data.length === 0) return; // biarkan fallback
    tbody.innerHTML = data
      .map(
        (d, i) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(d.display_name)}</td><td>${escapeHtml(fmtDate(d.donated_at))}</td></tr>`
      )
      .join('');
  } catch { /* biarkan fallback HTML tampil */ }
}

loadDonors();

import('./presence.js').then((m) => m.initPresence(document.getElementById('presenceN')));

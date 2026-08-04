// social-util.js — util bersama untuk fitur komunitas (Doa, Syukur).
// Dipisah agar Dinding Doa & Papan Syukur berbagi logika: escape, waktu,
// skeleton, toast, cache "sudah kuberi reaksi" per perangkat, & cache feed.

import { locale } from './i18n.js';

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtTime(iso) {
  try { return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); }
  catch { return ''; }
}

export function skeletonHtml(n = 3) {
  let s = '';
  for (let i = 0; i < n; i++) {
    s += `<section class="card jcard doa-skel" aria-hidden="true"><div class="sk-line w80"></div><div class="sk-line w95"></div><div class="sk-meta"></div></section>`;
  }
  return s;
}

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// Set persisten per perangkat (mis. "sudah kuaamiin/kupeluk") agar reaksi tetap
// terisi setelah refresh walau kueri server sempat kosong karena timing sesi.
export function localSet(prefix, uid) {
  const key = `${prefix}:${uid || 'anon'}`;
  const read = () => {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
  };
  return {
    get: read,
    add(id) {
      try { const s = read(); s.add(id); localStorage.setItem(key, JSON.stringify([...s])); } catch { /* abaikan */ }
    },
  };
}

// Cache feed terakhir agar tampil INSTAN saat dibuka lagi, lalu disegarkan.
export function feedCache(key) {
  return {
    get() { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } },
    set(items) { try { localStorage.setItem(key, JSON.stringify((items || []).slice(0, 50))); } catch { /* abaikan */ } },
  };
}

// Filter kata kasar dasar (ID + EN). Bukan sensor sempurna — friksi awal;
// pelanggaran serius ditangani tombol Laporkan + ambang auto-sembunyi di server.
const BADWORDS = ['anjing', 'bangsat', 'kontol', 'memek', 'ngentot', 'bajingan', 'jancok', 'tolol', 'goblok', 'pepek', 'tai', 'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick'];
export function hasProfanity(text) {
  const low = ` ${text.toLowerCase().replace(/[^a-z\s]/g, ' ')} `;
  return BADWORDS.some((w) => low.includes(` ${w} `));
}

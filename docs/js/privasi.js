// privasi.js — halaman Kebijakan Privasi. Bilingual (ID/EN) via dua blok konten
// yang di-toggle; header/nav pakai i18n biasa. Tanpa i18n dict untuk isi kebijakan
// (teks panjang) agar i18n.js tetap ramping.

import { applyI18n, getLang } from './i18n.js';
import { initTheme } from './theme.js';

const $ = (id) => document.getElementById(id);

function setLang(l) {
  const en = l === 'en';
  $('pp-id').hidden = en;
  $('pp-en').hidden = !en;
  const btn = $('ppLang');
  if (btn) btn.textContent = en ? 'Bahasa Indonesia' : 'English'; // tombol menawarkan bahasa lain
  document.documentElement.lang = l;
}

function init() {
  applyI18n();
  initTheme($('themeBtn'));
  let l = getLang() === 'en' ? 'en' : 'id';
  setLang(l);
  $('ppLang').addEventListener('click', () => { l = l === 'id' ? 'en' : 'id'; setLang(l); });
}

init();

import('./presence.js').then((m) => m.initPresence(document.getElementById('presenceN'))).catch(() => {});

// community.js — hub "Komunitas & Sosial" (Fase 5). Segmented control 3 bagian:
//   🤲 Doa (Dinding Doa + balasan) · 🌾 Syukur (Papan Syukur) · 🤝 Bersama (Kebaikan Bersama)
// Menggantikan entry doa.js lama; tiap bagian dimuat lazy & dibersihkan saat pindah.

import { applyI18n, t } from './i18n.js';
import { initTheme } from './theme.js';
import { initSettings, openSettings } from './settings.js';
import { cloudEnabled, getUser, onAuth } from './cloud.js';
import { mountDoa } from './doa-wall.js';
import { mountSyukur } from './syukur.js';
import { mountKebaikan } from './kebaikan.js';

const $ = (id) => document.getElementById(id);
const SECTIONS = [
  { key: 'doa', icon: '🤲', label: 'com_doa', mount: mountDoa },
  { key: 'syukur', icon: '🌾', label: 'com_syukur', mount: mountSyukur },
  { key: 'bersama', icon: '🤝', label: 'com_bersama', mount: mountKebaikan },
];

let me = null;
let cleanup = null;
let active = 'doa';

async function switchTo(key) {
  active = key;
  const seg = $('comSeg');
  seg?.querySelectorAll('.ib-seg-btn').forEach((b) => {
    const on = b.dataset.sec === key;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (cleanup) { try { cleanup(); } catch { /* abaikan */ } cleanup = null; }
  const body = $('secBody');
  if (!body) return;
  body.innerHTML = '';
  const sec = SECTIONS.find((s) => s.key === key) || SECTIONS[0];
  try { localStorage.setItem('communityTab', key); } catch { /* abaikan */ }
  cleanup = await sec.mount(body, me);
}

async function render() {
  const root = $('doaRoot');
  if (cleanup) { try { cleanup(); } catch { /* abaikan */ } cleanup = null; }
  if (!cloudEnabled()) { root.innerHTML = `<section class="card jcard"><p class="jempty">Cloud belum dikonfigurasi.</p></section>`; return; }
  me = await getUser();
  if (!me) {
    root.innerHTML = `<section class="card jcard"><p class="jempty">${t('doa_login')}</p><button class="primary-btn" id="doaLogin">${t('doa_login_btn')}</button></section>`;
    $('doaLogin').addEventListener('click', () => openSettings());
    return;
  }
  const segBtns = SECTIONS.map((s, i) => `<button class="ib-seg-btn${i === 0 ? ' active' : ''}" data-sec="${s.key}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}">${s.icon} ${t(s.label)}</button>`).join('');
  root.innerHTML = `<div class="ib-seg" id="comSeg" role="tablist">${segBtns}</div><div id="secBody"></div>`;
  $('comSeg').querySelectorAll('.ib-seg-btn').forEach((b) => b.addEventListener('click', () => switchTo(b.dataset.sec)));
  let start = 'doa';
  try { const saved = localStorage.getItem('communityTab'); if (SECTIONS.some((s) => s.key === saved)) start = saved; } catch { /* abaikan */ }
  await switchTo(start);
}

async function init() {
  applyI18n();
  initTheme($('themeBtn'));
  initSettings(() => {});
  $('settingsBtn').addEventListener('click', () => openSettings());
  onAuth(() => render());
  await render();
}

init();

import('./presence.js').then((m) => m.initPresence(document.getElementById('presenceN')));

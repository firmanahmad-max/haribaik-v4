// ibadah.js — halaman Konten Ibadah (Fase 5): Dzikir pagi/petang, Tasbih digital,
// Asmaul Husna, dan Doa Harian. Konten terkurasi dari ibadah-data.js.

import { initTheme } from './theme.js';
import { t, getLang, applyI18n } from './i18n.js';
import { Meta, Favorites, dayKey } from './db.js';
import { buildTemporal } from './context.js';
import { TASBIH, DZIKIR_PAGI, DZIKIR_PETANG, ASMAUL_HUSNA, DOA_HARIAN } from './ibadah-data.js';

const $ = (id) => document.getElementById(id);
const lng = () => getLang();

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

// ==================== DZIKIR ====================
let dzikirMode = null; // 'pagi' | 'petang'

async function getDzikirProgress() {
  const p = (await Meta.get('dzikirProgress', null)) || {};
  const today = dayKey();
  if (p.day !== today) return { day: today, pagi: {}, petang: {} };
  return { day: today, pagi: p.pagi || {}, petang: p.petang || {} };
}
async function setDzikirCount(mode, idx, count) {
  const p = await getDzikirProgress();
  p[mode][idx] = count;
  await Meta.set('dzikirProgress', p);
}

async function renderDzikir() {
  const body = $('ibadahBody');
  if (!dzikirMode) {
    const w = buildTemporal().waktu; // Pagi/Siang/Sore/Malam
    dzikirMode = (w === 'Sore' || w === 'Malam') ? 'petang' : 'pagi';
  }
  const list = dzikirMode === 'pagi' ? DZIKIR_PAGI : DZIKIR_PETANG;
  const prog = await getDzikirProgress();
  const cur = prog[dzikirMode] || {};

  const cards = list.map((d, i) => {
    const done = (cur[i] || 0) >= d.n;
    const c = cur[i] || 0;
    return `<section class="card ib-dzikir${done ? ' ib-done' : ''}" data-idx="${i}">
      <div class="ib-arabic">${escapeHtml(d.ar)}</div>
      <div class="ib-trans">${escapeHtml(d[lng()] || d.id)}</div>
      <div class="ib-foot">
        <span class="ib-src">${escapeHtml(d.src)}</span>
        <button class="ib-count" aria-label="Hitung bacaan"><span class="ib-check">${done ? '✓' : ''}</span><b class="ib-c">${c}</b><span class="ib-of">/${d.n}</span></button>
      </div>
    </section>`;
  }).join('');

  body.innerHTML = `
    <div class="ib-toggle">
      <button class="ib-tg-btn${dzikirMode === 'pagi' ? ' active' : ''}" data-m="pagi">${t('ib_pagi')}</button>
      <button class="ib-tg-btn${dzikirMode === 'petang' ? ' active' : ''}" data-m="petang">${t('ib_petang')}</button>
    </div>
    <p class="field-hint" style="margin:2px 2px 12px">${t('ib_dzikir_hint')}</p>
    <div class="ib-list">${cards}</div>`;

  body.querySelectorAll('.ib-tg-btn').forEach((b) => b.addEventListener('click', () => {
    dzikirMode = b.dataset.m;
    renderDzikir();
  }));

  body.querySelectorAll('.ib-dzikir').forEach((card) => {
    const idx = Number(card.dataset.idx);
    const d = list[idx];
    card.querySelector('.ib-count').addEventListener('click', async () => {
      const prog2 = await getDzikirProgress();
      let c = (prog2[dzikirMode][idx] || 0) + 1;
      if (c > d.n) c = 0; // ketuk lagi setelah selesai → reset hitungan dzikir ini
      await setDzikirCount(dzikirMode, idx, c);
      vibrate(c >= d.n ? 14 : 6);
      const done = c >= d.n;
      card.classList.toggle('ib-done', done);
      card.querySelector('.ib-c').textContent = c;
      card.querySelector('.ib-check').textContent = done ? '✓' : '';
      if (done) toast(t('ib_dzikir_done'));
    });
  });
}

// ==================== TASBIH ====================
let tasbihKey = null;

async function renderTasbih() {
  const body = $('ibadahBody');
  const state = (await Meta.get('tasbihState', null)) || { key: TASBIH[0].key, count: 0 };
  tasbihKey = state.key;
  const totals = (await Meta.get('tasbihTotals', {})) || {};
  const preset = TASBIH.find((x) => x.key === tasbihKey) || TASBIH[0];
  const count = state.count || 0;
  const total = totals[tasbihKey] || 0;
  const pct = Math.min(100, Math.round((count / preset.target) * 100));

  body.innerHTML = `
    <div class="ib-chips">
      ${TASBIH.map((x) => `<button class="chip-btn ib-preset ib-preset-ar${x.key === tasbihKey ? ' selected' : ''}" data-k="${x.key}" title="${escapeHtml(lng() === 'en' ? x.en : x.id)}">${escapeHtml(x.ar)}</button>`).join('')}
    </div>
    <div class="tasbih-wrap">
      <div class="tasbih-arabic">${escapeHtml(preset.ar)}</div>
      <div class="tasbih-mean">${escapeHtml(lng() === 'en' ? preset.en : preset.id)}</div>
      <button class="tasbih-btn" id="tasbihBtn" aria-label="Tambah hitungan">
        <b id="tasbihCount">${count}</b>
        <span class="tasbih-target">/ ${preset.target}</span>
      </button>
      <div class="tasbih-bar"><i id="tasbihBar" style="width:${pct}%"></i></div>
      <div class="tasbih-meta">
        <span>${t('ib_total')}: <b id="tasbihTotal">${total}</b></span>
        <button class="mini-btn danger" id="tasbihReset">${t('ib_reset')}</button>
      </div>
    </div>`;

  body.querySelectorAll('.ib-preset').forEach((b) => b.addEventListener('click', async () => {
    await Meta.set('tasbihState', { key: b.dataset.k, count: 0 });
    renderTasbih();
  }));

  $('tasbihBtn').addEventListener('click', async () => {
    const st = (await Meta.get('tasbihState', null)) || { key: tasbihKey, count: 0 };
    st.count = (st.count || 0) + 1;
    await Meta.set('tasbihState', st);
    const tot = (await Meta.get('tasbihTotals', {})) || {};
    tot[tasbihKey] = (tot[tasbihKey] || 0) + 1;
    await Meta.set('tasbihTotals', tot);

    $('tasbihCount').textContent = st.count;
    $('tasbihTotal').textContent = tot[tasbihKey];
    const p = Math.min(100, Math.round((st.count / preset.target) * 100));
    $('tasbihBar').style.width = p + '%';
    if (st.count === preset.target) { vibrate([20, 40, 20]); toast(t('ib_tasbih_done').replace('{n}', preset.target)); }
    else vibrate(8);
  });

  $('tasbihReset').addEventListener('click', async () => {
    await Meta.set('tasbihState', { key: tasbihKey, count: 0 });
    renderTasbih();
  });
}

// ==================== ASMAUL HUSNA ====================
function renderAsma() {
  const body = $('ibadahBody');
  const items = ASMAUL_HUSNA.map((a, i) => `
    <div class="ib-asma">
      <span class="ib-asma-no">${i + 1}</span>
      <div class="ib-asma-main">
        <span class="ib-asma-ar">${escapeHtml(a.ar)}</span>
        <span class="ib-asma-tr">${escapeHtml(a.tr)}</span>
      </div>
      <span class="ib-asma-mean">${escapeHtml(lng() === 'en' ? a.en : a.id)}</span>
    </div>`).join('');
  body.innerHTML = `
    <input id="asmaSearch" class="ch-input" type="search" placeholder="${t('ib_asma_search')}" aria-label="${t('ib_asma_search')}" />
    <p class="field-hint" style="margin:0 2px 10px">${t('ib_asma_hint')}</p>
    <div class="ib-asma-grid" id="asmaGrid">${items}</div>`;

  const grid = $('asmaGrid');
  $('asmaSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    grid.querySelectorAll('.ib-asma').forEach((el, i) => {
      const a = ASMAUL_HUSNA[i];
      const hay = `${a.tr} ${a.id} ${a.en}`.toLowerCase();
      el.hidden = q && !hay.includes(q);
    });
  });
}

// ==================== DOA HARIAN ====================
function renderDoa() {
  const body = $('ibadahBody');
  const cards = DOA_HARIAN.map((d, i) => `
    <section class="card ib-doa" data-idx="${i}">
      <div class="ib-doa-title">${escapeHtml(lng() === 'en' ? d.t_en : d.t_id)}</div>
      <div class="ib-arabic">${escapeHtml(d.ar)}</div>
      <div class="ib-trans">${escapeHtml(lng() === 'en' ? d.en : d.id)}</div>
      <div class="ib-foot">
        <span class="ib-src">${escapeHtml(d.src)}</span>
        <div class="ib-doa-actions">
          <button class="mini-btn js-copy">📋 ${t('btn_copy')}</button>
          <button class="mini-btn js-fav">🔖 ${t('btn_save')}</button>
        </div>
      </div>
    </section>`).join('');
  body.innerHTML = `<div class="ib-list">${cards}</div>`;

  body.querySelectorAll('.ib-doa').forEach((card) => {
    const d = DOA_HARIAN[Number(card.dataset.idx)];
    card.querySelector('.js-copy').addEventListener('click', async () => {
      const txt = `${d.ar}\n\n"${lng() === 'en' ? d.en : d.id}"\n— ${d.src}\n\nvia HariBaik`;
      try { await navigator.clipboard.writeText(txt); toast(t('copied')); } catch { toast(t('copy_fail')); }
    });
    const favBtn = card.querySelector('.js-fav');
    favBtn.addEventListener('click', async () => {
      if (favBtn.classList.contains('active')) return;
      await Favorites.add({ arabic: d.ar, translation: lng() === 'en' ? d.en : d.id, source: d.src, source_type: 'doa' });
      favBtn.classList.add('active');
      favBtn.innerHTML = `✓ ${t('saved_done')}`;
      vibrate(12);
      toast(t('saved_fav'));
    });
  });
}

// ==================== NAV ====================
const SECTIONS = { dzikir: renderDzikir, tasbih: renderTasbih, asma: renderAsma, doa: renderDoa };

function selectSection(sec) {
  document.querySelectorAll('.ib-seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.sec === sec));
  SECTIONS[sec]?.();
}

async function init() {
  applyI18n();
  initTheme($('themeBtn'));
  $('ibSeg').addEventListener('click', (e) => {
    const b = e.target.closest('.ib-seg-btn');
    if (b) selectSection(b.dataset.sec);
  });
  selectSection('dzikir');
}

init();

import('./presence.js').then((m) => m.initPresence(document.getElementById('presenceN')));

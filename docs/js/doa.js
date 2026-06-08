// doa.js — Dinding Doa (Fase 4): kirim doa request, aamiin, realtime.

import { applyI18n, t, locale } from './i18n.js';
import { initTheme } from './theme.js';
import { initSettings, openSettings } from './settings.js';
import { cloudEnabled, getUser, onAuth, listDoa, myAamiins, postDoa, aamiin, deleteDoa, reportDoa, subscribeDoa } from './cloud.js';

// Filter kata kasar dasar (ID + EN). Bukan sensor sempurna — sekadar friksi awal;
// pelanggaran serius ditangani tombol Laporkan + ambang auto-sembunyi di server.
const BADWORDS = ['anjing', 'bangsat', 'kontol', 'memek', 'ngentot', 'bajingan', 'jancok', 'tolol', 'goblok', 'pepek', 'tai', 'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick'];
function hasProfanity(text) {
  const low = ` ${text.toLowerCase().replace(/[^a-z\s]/g, ' ')} `;
  return BADWORDS.some((w) => low.includes(` ${w} `));
}

const $ = (id) => document.getElementById(id);
let me = null;
let aaminSet = new Set();
let unsub = null;

// Cache lokal status "aamiin" per perangkat: hati tetap terisi setelah refresh
// walau kueri server (myAamiins) sempat balik kosong karena timing sesi/token.
function localAaminKey(uid) { return 'doaAamiin:' + (uid || 'anon'); }
function getLocalAamins(uid) {
  try { return new Set(JSON.parse(localStorage.getItem(localAaminKey(uid)) || '[]')); }
  catch { return new Set(); }
}
function addLocalAamin(uid, id) {
  try {
    const s = getLocalAamins(uid); s.add(id);
    localStorage.setItem(localAaminKey(uid), JSON.stringify([...s]));
  } catch { /* abaikan */ }
}

// Cache feed terakhir agar dinding doa tampil INSTAN saat dibuka lagi,
// lalu disegarkan dari server di belakang layar.
const FEED_CACHE_KEY = 'doaFeedCache';
function getCachedFeed() {
  try { return JSON.parse(localStorage.getItem(FEED_CACHE_KEY) || '[]'); } catch { return []; }
}
function setCachedFeed(items) {
  try { localStorage.setItem(FEED_CACHE_KEY, JSON.stringify((items || []).slice(0, 50))); } catch { /* abaikan */ }
}
function skeletonHtml(n = 3) {
  let s = '';
  for (let i = 0; i < n; i++) {
    s += `<section class="card jcard doa-skel" aria-hidden="true"><div class="sk-line w80"></div><div class="sk-line w95"></div><div class="sk-meta"></div></section>`;
  }
  return s;
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtTime(iso) {
  try { return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); }
  catch { return ''; }
}

function doaCard(d) {
  const mine = me && d.user_id === me.id;
  const done = aaminSet.has(d.id);
  return `<section class="card jcard doa-item" data-id="${escapeHtml(d.id)}">
    <p class="doa-content">${escapeHtml(d.content)}</p>
    <div class="doa-meta"><span>🤲 ${escapeHtml(d.display_name || t('anon'))}</span><span>${fmtTime(d.created_at)}</span></div>
    <div class="card-actions">
      <button class="mini-btn js-aamiin${done ? ' active' : ''}"${done ? ' disabled' : ''}>🤍 ${t('doa_aamiin')} · <b class="aamiin-n">${d.aamiin_count || 0}</b></button>
      ${mine
        ? `<button class="mini-btn danger js-del">${t('del')}</button>`
        : `<button class="mini-btn js-report" title="${t('doa_report')}" aria-label="${t('doa_report')}">⚑</button>`}
    </div>
  </section>`;
}

function wireCard(card) {
  const id = card.dataset.id;
  card.querySelector('.js-aamiin')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const n = await aamiin(id);
      card.querySelector('.aamiin-n').textContent = n;
      btn.classList.add('active');
      aaminSet.add(id);
      addLocalAamin(me && me.id, id); // ingat di perangkat agar tetap terisi setelah refresh
      if (navigator.vibrate) navigator.vibrate(8);
    } catch { btn.disabled = false; toast(t('cloud_err')); }
  });
  card.querySelector('.js-del')?.addEventListener('click', async () => {
    try { await deleteDoa(id); card.remove(); toast(t('doa_deleted')); } catch { toast(t('cloud_err')); }
  });
  card.querySelector('.js-report')?.addEventListener('click', async (e) => {
    if (!confirm(t('doa_report_confirm'))) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try { await reportDoa(id); card.remove(); toast(t('doa_reported')); }
    catch { btn.disabled = false; toast(t('cloud_err')); }
  });
}

function prependDoa(row) {
  const feed = $('doaFeed');
  if (!feed || feed.querySelector(`[data-id="${row.id}"]`)) return;
  const empty = feed.querySelector('.jempty');
  if (empty) feed.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.innerHTML = doaCard(row);
  const node = wrap.firstElementChild;
  feed.prepend(node);
  wireCard(node);
}

async function loadFeed() {
  const feed = $('doaFeed');
  // 1) INSTAN: tampilkan cache lokal (atau skeleton) tanpa menunggu jaringan.
  aaminSet = getLocalAamins(me && me.id);
  const cached = getCachedFeed();
  if (cached.length) {
    feed.innerHTML = cached.map(doaCard).join('');
    feed.querySelectorAll('.doa-item').forEach(wireCard);
  } else {
    feed.innerHTML = skeletonHtml();
  }
  // 2) Segarkan dari server di belakang layar.
  try {
    const [items, mine] = await Promise.all([listDoa(50), myAamiins()]);
    aaminSet = new Set([...mine, ...getLocalAamins(me && me.id)]);
    setCachedFeed(items);
    if (!items.length) { feed.innerHTML = `<section class="card jcard"><p class="jempty">${t('doa_empty')}</p></section>`; return; }
    feed.innerHTML = items.map(doaCard).join('');
    feed.querySelectorAll('.doa-item').forEach(wireCard);
  } catch (e) {
    // Bila ada cache, biarkan tetap tampil; jika tidak, tampilkan pesan error.
    if (!cached.length) feed.innerHTML = `<section class="card jcard"><p class="jempty">${escapeHtml(e.message)}</p></section>`;
  }
}

async function sendDoa() {
  const text = $('doaText').value.trim();
  if (!text) return toast(t('doa_min'));
  if (hasProfanity(text)) return toast(t('doa_profanity'));
  const name = $('doaName').value.trim();
  const btn = $('doaSend');
  btn.disabled = true;
  try {
    const row = await postDoa(text, name);
    $('doaText').value = '';
    toast(t('doa_sent'));
    prependDoa(row);
  } catch (e) {
    // Trigger rate-limit di server menaikkan pesan 'rate_limit: ...'.
    toast(/rate_limit/i.test(e.message) ? t('doa_rate') : `${t('cloud_err')}: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function render() {
  const root = $('doaRoot');
  if (!cloudEnabled()) { root.innerHTML = '<section class="card jcard"><p class="jempty">Cloud belum dikonfigurasi.</p></section>'; return; }
  me = await getUser();
  if (!me) {
    root.innerHTML = `<section class="card jcard"><p class="jempty">${t('doa_login')}</p><button class="primary-btn" id="doaLogin">${t('doa_login_btn')}</button></section>`;
    $('doaLogin').addEventListener('click', () => openSettings());
    return;
  }
  root.innerHTML = `
    <section class="card jcard">
      <textarea id="doaText" rows="3" maxlength="300" placeholder="${t('doa_ph')}"></textarea>
      <input id="doaName" class="ch-input" maxlength="40" placeholder="${t('doa_name_ph')}" style="margin:8px 0" />
      <button class="primary-btn" id="doaSend">${t('doa_send')}</button>
    </section>
    <div id="doaFeed"></div>`;
  $('doaSend').addEventListener('click', sendDoa);
  await loadFeed();
  if (unsub) unsub();
  unsub = await subscribeDoa(
    (row) => { if (!row.hidden) prependDoa(row); },
    (row) => {
      const feed = $('doaFeed');
      const card = feed?.querySelector(`[data-id="${row.id}"]`);
      if (!card) return;
      if (row.hidden) { card.remove(); return; }
      const n = card.querySelector('.aamiin-n');
      if (n) n.textContent = row.aamiin_count || 0;
    }
  );
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

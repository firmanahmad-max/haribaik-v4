// amalan.js — halaman Amalan: tracker ibadah harian, statistik, Istiqomah Challenge,
// dan Mode Ramadan (Fase 3 + perbaikan).

import { Deeds, Meta, Journal, Favorites, Messages, dayKey } from './db.js';
import { initTheme, isRamadan, setRamadan } from './theme.js';
import { postReport } from './api.js';
import { shareCard } from './share.js';
import { speak, stopSpeak, ttsSupported } from './tts.js';
import { hijriMonth, hijriYear } from './context.js';
import { trapFocus } from './a11y.js';
import { CITIES, getCurrentCoords, getTimings, PRAYER_ORDER, reverseGeocode } from './pray.js';
import { qiblaBearing, requestOrientationPermission, startCompass, compassSupported } from './qibla.js';
import { t, getLang, applyI18n, presetHabits, weekdaysShort, locale } from './i18n.js';
import { initCloudSync } from './cloud.js';
import { pushSupported, pushConfigured, enablePush, syncPushPrefs } from './push.js';

const $ = (id) => document.getElementById(id);

const SALAT = ['Subuh', 'Dzuhur', 'Ashar', 'Maghrib', 'Isya'];
const TODAY = dayKey(Date.now());

const state = { today: null, all: [], times: null, loc: null, selectedPrayer: null, adzanTimers: [], qiblaBearing: null, heading: 0, displayRot: 0, rafId: null, stopCompass: null };

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

function emptyDeed(day) {
  return { day, salat: {}, tilawah: false, puasa: false };
}
function deedComplete(d, ramadan) {
  const base = SALAT.every((s) => d.salat?.[s]) && d.tilawah;
  return ramadan ? base && d.puasa : base;
}
function salatCount(d) {
  return SALAT.filter((s) => d.salat?.[s]).length;
}
function isOn(key, d = state.today) {
  if (key.startsWith('salat:')) return !!d.salat?.[key.split(':')[1]];
  return !!d[key];
}
function deedItemsHtml(d) {
  const ramadan = isRamadan();
  const items = [
    ...SALAT.map((s) => ({ key: `salat:${s}`, icon: '🕌', label: t('salat_' + s), on: !!d.salat?.[s] })),
    { key: 'tilawah', icon: '📖', label: t('deed_tilawah'), on: !!d.tilawah },
  ];
  if (ramadan) items.push({ key: 'puasa', icon: '🌙', label: t('deed_puasa'), on: !!d.puasa });
  return items.map((it) => `
    <button class="deed-item${it.on ? ' done' : ''}" data-key="${it.key}" aria-pressed="${it.on}">
      <span class="deed-ico">${it.icon}</span>
      <span class="deed-label">${it.label}</span>
      <span class="deed-check">${it.on ? '✓' : ''}</span>
    </button>`).join('');
}
function countOf(d) {
  const ramadan = isRamadan();
  const total = SALAT.length + 1 + (ramadan ? 1 : 0);
  const done = salatCount(d) + (d.tilawah ? 1 : 0) + (ramadan && d.puasa ? 1 : 0);
  return { done, total };
}

// ---------- Checklist hari ini ----------
function renderToday() {
  $('deedsList').innerHTML = deedItemsHtml(state.today);
  updateCount();
}
function updateCount() {
  const { done, total } = countOf(state.today);
  $('deedsCount').textContent = `${done}/${total}`;
}

// Toggle hari ini secara in-place (menjaga fokus keyboard).
async function toggleDeed(key, btn) {
  const d = state.today;
  if (key.startsWith('salat:')) {
    const s = key.split(':')[1];
    d.salat = d.salat || {};
    d.salat[s] = !d.salat[s];
  } else {
    d[key] = !d[key];
  }
  await Deeds.set(TODAY, d);
  const idx = state.all.findIndex((x) => x.day === TODAY);
  if (idx >= 0) state.all[idx] = d; else state.all.push(d);
  if (navigator.vibrate) navigator.vibrate(8);
  const on = isOn(key);
  btn.classList.toggle('done', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.querySelector('.deed-check').textContent = on ? '✓' : '';
  updateCount();
  renderStats();
}

// ---------- Statistik ----------
function computeStreak(predicate) {
  const map = {};
  state.all.forEach((d) => { map[d.day] = d; });
  let streak = 0;
  const cur = new Date();
  for (;;) {
    const d = map[dayKey(cur.getTime())];
    if (d && predicate(d)) { streak++; cur.setDate(cur.getDate() - 1); } else break;
  }
  return streak;
}

function renderStats() {
  const ramadan = isRamadan();
  const salatStreak = computeStreak((d) => SALAT.every((s) => d.salat?.[s]));
  const tilawahStreak = computeStreak((d) => d.tilawah);
  const fullStreak = computeStreak((d) => deedComplete(d, ramadan));
  const totalDays = state.all.filter((d) => salatCount(d) > 0 || d.tilawah || d.puasa).length;

  $('deedsStats').innerHTML = `
    <div class="jstat"><b>🕌 ${salatStreak}</b><span>${t('d_streak_salat')}</span></div>
    <div class="jstat"><b>📖 ${tilawahStreak}</b><span>${t('d_streak_tilawah')}</span></div>
    <div class="jstat"><b>⭐ ${fullStreak}</b><span>${t('d_perfect')}</span></div>
    <div class="jstat"><b>${totalDays}</b><span>${t('d_active')}</span></div>`;

  const map = {};
  state.all.forEach((d) => { map[d.day] = d; });
  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const k = dayKey(dt.getTime());
    const d = map[k] || emptyDeed(k);
    const sc = salatCount(d);
    const label = weekdaysShort()[dt.getDay()];
    const pct = Math.round((sc / 5) * 100);
    const aria = `${label}, ${sc}/5`;
    cells.push(`<button class="dweek-cell" data-day="${k}" aria-label="${aria}" title="${k}: ${sc}/5">
      <div class="dweek-ring" style="--p:${pct}"><span>${sc}<small>/5</small></span></div>
      <i class="dweek-til ${d.tilawah ? 'on' : ''}"></i>
      <span>${label}</span>
    </button>`);
  }
  $('deedsWeek').innerHTML = cells.join('');
}

// ---------- Editor hari (termasuk hari terlewat) ----------
async function openDayEditor(day) {
  let d = (await Deeds.get(day)) || emptyDeed(day);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const label = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(day + 'T00:00:00'));
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Amalan ${label}">
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">${label}</h2>
      <div class="deeds-list" id="edList"></div>
      <div class="sheet-actions"><span class="spacer"></span><button class="chip-btn" id="edClose">${t('close')}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const close = async () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 250); await refresh(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  trapFocus(overlay, overlay.querySelector('.sheet'), { onEscape: close });
  overlay.querySelector('#edClose').addEventListener('click', close);

  const list = overlay.querySelector('#edList');
  const draw = () => {
    list.innerHTML = deedItemsHtml(d);
    list.querySelectorAll('.deed-item').forEach((b) => b.addEventListener('click', async () => {
      const key = b.dataset.key;
      if (key.startsWith('salat:')) { const s = key.split(':')[1]; d.salat = d.salat || {}; d.salat[s] = !d.salat[s]; }
      else d[key] = !d[key];
      await Deeds.set(day, d);
      const on = isOn(key, d);
      b.classList.toggle('done', on);
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('.deed-check').textContent = on ? '✓' : '';
      if (navigator.vibrate) navigator.vibrate(6);
    }));
  };
  draw();
  overlay.querySelector('#edClose').focus();
}

// ---------- Istiqomah Challenge (multi) ----------
// Model: Meta.challenges = [{ id, habit, startDay, target, days:{[dayKey]:true} }, ...]
// Migrasi otomatis dari format lama (Meta.challenge tunggal) → array.
const MAX_ACTIVE_CHALLENGES = 5;
function newChallengeId() {
  try { return crypto.randomUUID(); } catch { return 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2,7); }
}

async function getChallenges() {
  // Migrasi 1x dari kunci lama `challenge` (objek tunggal) → `challenges` (array).
  const arr = await Meta.get('challenges', null);
  if (Array.isArray(arr)) return arr;
  const legacy = await Meta.get('challenge', null);
  if (legacy && legacy.habit) {
    const migrated = [{ ...legacy, id: newChallengeId() }];
    await Meta.set('challenges', migrated);
    await Meta.set('challenge', null); // bersihkan kunci lama
    return migrated;
  }
  return [];
}

function challengeStreak(ch) {
  const days = ch.days || {};
  let streak = 0;
  const cur = new Date();
  if (!days[dayKey(cur.getTime())]) cur.setDate(cur.getDate() - 1);
  for (;;) { if (days[dayKey(cur.getTime())]) { streak++; cur.setDate(cur.getDate() - 1); } else break; }
  return streak;
}

function challengeCardHtml(ch) {
  const days = ch.days || {};
  const doneCount = Object.keys(days).length;
  const pct = Math.round((doneCount / ch.target) * 100);
  const todayDone = !!days[TODAY];
  const streak = challengeStreak(ch);
  const complete = doneCount >= ch.target;

  const start = new Date(ch.startDay + 'T00:00:00');
  let grid = '';
  for (let i = 0; i < ch.target; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const k = dayKey(d.getTime());
    const isFuture = d.getTime() > Date.now() && k !== TODAY;
    const done = !!days[k];
    grid += `<button class="ch-cell${done ? ' done' : ''}${k === TODAY ? ' today' : ''}${isFuture ? ' future' : ''}" data-day="${k}"${isFuture ? ' disabled' : ''} aria-label="Hari ${i + 1}${done ? ', selesai' : ''}" title="Hari ${i + 1}">${done ? '✓' : i + 1}</button>`;
  }

  return `<section class="ch-card" data-cid="${escapeHtml(ch.id)}">
    <div class="ch-head">
      <div><b>${escapeHtml(ch.habit)}</b><div class="field-hint">${t('ch_started')} ${escapeHtml(ch.startDay)} · 🔥 ${streak} ${t('ch_streak')}</div></div>
      <div class="ch-progress"><b>${doneCount}/${ch.target}</b><span>${pct}%</span></div>
    </div>
    <div class="ch-bar"><i style="width:${pct}%"></i></div>
    <div class="ch-grid">${grid}</div>
    <div class="ch-actions">
      ${complete
        ? `<button class="primary-btn js-ch-finish" type="button">${t('ch_finish')}</button>`
        : `<button class="primary-btn js-ch-check" type="button"${todayDone ? ' disabled' : ''}>${todayDone ? t('ch_done_today') : t('ch_mark_today')}</button>`}
      <button class="mini-btn danger js-ch-cancel" type="button">${t('ch_cancel')}</button>
    </div>
  </section>`;
}

function composerHtml(empty) {
  return `
    ${empty ? `<p class="jempty" style="text-align:left">${t('ch_pick')}</p>` : ''}
    <div class="ch-composer">
      <input id="chHabit" class="ch-input" type="text" maxlength="40" list="chPresets" placeholder="${t('ch_ph')}" aria-label="${t('d_challenge')}" />
      <datalist id="chPresets">${presetHabits().map((h) => `<option value="${escapeHtml(h)}"></option>`).join('')}</datalist>
      <button class="primary-btn" id="chStart" type="button">${empty ? t('ch_start') : t('ch_add')}</button>
    </div>`;
}

async function saveChallenges(list) {
  await Meta.set('challenges', list);
}

async function renderChallenges(list) {
  const area = $('challengeArea');
  if (!list.length) {
    area.innerHTML = composerHtml(true);
    $('chStart').addEventListener('click', () => addChallenge());
    return;
  }
  const atLimit = list.length >= MAX_ACTIVE_CHALLENGES;
  area.innerHTML = `
    <div class="ch-list">${list.map(challengeCardHtml).join('')}</div>
    <p class="field-hint" style="margin:10px 0 6px">${t('ch_grid_hint')}</p>
    ${atLimit ? `<p class="field-hint">${t('ch_limit').replace('{n}', MAX_ACTIVE_CHALLENGES)}</p>` : composerHtml(false)}`;

  if (!atLimit) $('chStart').addEventListener('click', () => addChallenge());

  // Delegasi event per kartu (data-cid).
  area.querySelectorAll('.ch-card').forEach((card) => {
    const cid = card.dataset.cid;
    const ch = list.find((x) => x.id === cid);
    if (!ch) return;
    card.querySelector('.ch-grid').addEventListener('click', async (e) => {
      const cell = e.target.closest('.ch-cell[data-day]:not([disabled])');
      if (!cell) return;
      const k = cell.dataset.day;
      ch.days = ch.days || {};
      if (ch.days[k]) delete ch.days[k]; else ch.days[k] = true;
      await saveChallenges(list);
      if (navigator.vibrate) navigator.vibrate(8);
      renderChallenges(list);
    });
    card.querySelector('.js-ch-check')?.addEventListener('click', async () => {
      ch.days = ch.days || {};
      ch.days[TODAY] = true;
      await saveChallenges(list);
      if (navigator.vibrate) navigator.vibrate(12);
      toast(t('ch_day_toast'));
      renderChallenges(list);
    });
    card.querySelector('.js-ch-finish')?.addEventListener('click', async () => {
      const doneCount = Object.keys(ch.days || {}).length;
      const hist = (await Meta.get('challengeHistory', [])) || [];
      hist.push({ habit: ch.habit, startDay: ch.startDay, finishedDay: TODAY, daysDone: doneCount, target: ch.target });
      await Meta.set('challengeHistory', hist.slice(-20));
      const rest = list.filter((x) => x.id !== cid);
      await saveChallenges(rest);
      toast(t('ch_archived'));
      renderChallenges(rest);
      renderChallengeHistory();
    });
    card.querySelector('.js-ch-cancel').addEventListener('click', async () => {
      if (!confirm(t('ch_cf_cancel'))) return;
      const rest = list.filter((x) => x.id !== cid);
      await saveChallenges(rest);
      renderChallenges(rest);
    });
  });
}

async function addChallenge() {
  const input = $('chHabit');
  const habit = (input?.value || '').trim().slice(0, 40);
  if (!habit) return toast(t('ch_write_first'));
  const list = (await getChallenges()) || [];
  if (list.length >= MAX_ACTIVE_CHALLENGES) return toast(t('ch_limit').replace('{n}', MAX_ACTIVE_CHALLENGES));
  // Cegah duplikat aktif (nama sama persis, abaikan case).
  if (list.some((x) => x.habit.toLowerCase() === habit.toLowerCase())) return toast(t('ch_dup'));
  list.push({ id: newChallengeId(), habit, startDay: TODAY, target: 30, days: {} });
  await saveChallenges(list);
  toast(t('ch_start_toast'));
  renderChallenges(list);
}

async function renderChallengeHistory() {
  const hist = (await Meta.get('challengeHistory', [])) || [];
  const el = $('challengeHistory');
  if (!hist.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<h3 class="jsub">${t('ch_history')}</h3>` +
    hist.slice().reverse().map((h) => `<div class="ch-hist-item">✅ <b>${escapeHtml(h.habit)}</b> <small>${h.daysDone}/${h.target} ${t('ch_days')} · ${escapeHtml(h.finishedDay)}</small></div>`).join('');
}

// ---------- Ramadan ----------
let countdownTimer = null;
async function initRamadan() {
  const on = isRamadan();
  $('ramadanToggle').checked = on;
  applyRamadanUi(on);
  $('imsakTime').value = (await Meta.get('imsakTime', '')) || '';
  $('iftarTime').value = (await Meta.get('iftarTime', '')) || '';

  $('ramadanToggle').addEventListener('change', async (e) => {
    setRamadan(e.target.checked);
    applyRamadanUi(e.target.checked);
    await refresh();
    updateCountdown();
    toast(e.target.checked ? t('ramadan_on') : t('ramadan_off'));
  });
  $('imsakTime').addEventListener('change', (e) => { Meta.set('imsakTime', e.target.value); updateCountdown(); });
  $('iftarTime').addEventListener('change', (e) => { Meta.set('iftarTime', e.target.value); updateCountdown(); });

  countdownTimer = setInterval(() => { updateCountdown(); updatePrayerNext(); }, 1000);
  updateCountdown();
}
function applyRamadanUi(on) {
  $('ramadanExtra').hidden = !on;
  $('ramadanHint').textContent = on ? t('ramadan_hint_on') : t('ramadan_hint_off');
}
function updateCountdown() {
  const el = $('ramadanCountdown');
  if (!el) return;
  if (!isRamadan()) { el.textContent = ''; return; }
  const mk = (hm) => { if (!hm) return null; const [h, m] = hm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  const now = new Date();
  const cands = [];
  const im = mk($('imsakTime').value);
  const ift = mk($('iftarTime').value);
  if (im) cands.push({ t: im, label: t('imsak') });
  if (ift) cands.push({ t: ift, label: t('iftar') });
  if (!cands.length) { el.textContent = ''; return; }
  let next = cands.filter((c) => c.t > now).sort((a, b) => a.t - b.t)[0];
  if (!next) { const c = cands.sort((a, b) => a.t - b.t)[0]; const nt = new Date(c.t); nt.setDate(nt.getDate() + 1); next = { t: nt, label: c.label }; }
  const diff = next.t - now;
  const hh = Math.floor(diff / 3600000), mm = Math.floor((diff % 3600000) / 60000), ss = Math.floor((diff % 60000) / 1000);
  el.innerHTML = `${t('cd_to')} <b>${next.label}</b>: ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

async function maybeSuggestRamadan() {
  if (isRamadan() || hijriMonth() !== 9) return;
  const y = hijriYear();
  if (Number(await Meta.get('ramadanSuggestedFor', 0)) === y) return;
  await Meta.set('ramadanSuggestedFor', y);
  if (confirm(t('ramadan_suggest'))) {
    setRamadan(true);
    $('ramadanToggle').checked = true;
    applyRamadanUi(true);
    await refresh();
    updateCountdown();
  }
}

// ---------- Jadwal Sholat ----------
const FARD = ['Subuh', 'Dzuhur', 'Ashar', 'Maghrib', 'Isya'];

function fillCitySelect() {
  const sel = $('citySelect');
  CITIES.forEach((c) => { const o = document.createElement('option'); o.value = c.name; o.textContent = c.name; sel.appendChild(o); });
}

async function initJadwal() {
  fillCitySelect();
  $('useLocation').addEventListener('click', async () => {
    $('jadwalLoc').textContent = t('jl_getting');
    try {
      const { lat, lng } = await getCurrentCoords();
      $('jadwalLoc').textContent = t('jl_recognizing');
      const name = await reverseGeocode(lat, lng);
      $('citySelect').value = ''; // lokasi GPS, bukan dari daftar kota
      await loadPrayer({ lat, lng, label: name || (getLang() === 'en' ? 'My location' : 'Lokasimu') });
    } catch {
      $('jadwalLoc').textContent = t('jl_denied');
      toast(t('loc_denied'));
    }
  });
  $('citySelect').addEventListener('change', async (e) => {
    const c = CITIES.find((x) => x.name === e.target.value);
    if (c) await loadPrayer({ lat: c.lat, lng: c.lng, label: c.name });
  });
  // Ketuk waktu untuk memilih target hitung mundur (ketuk lagi = otomatis).
  $('jadwalTimes').addEventListener('click', (e) => {
    const cell = e.target.closest('.jt-item[data-prayer]');
    if (!cell) return;
    const p = cell.dataset.prayer;
    state.selectedPrayer = state.selectedPrayer === p ? null : p;
    updatePrayerNext();
  });

  const saved = await Meta.get('prayerLoc', null);
  if (saved) {
    if (CITIES.some((c) => c.name === saved.label)) $('citySelect').value = saved.label;
    await loadPrayer(saved);
  }
}

async function loadPrayer(loc) {
  $('jadwalLoc').textContent = t('jl_loading');
  try {
    const times = await getTimings(loc.lat, loc.lng);
    state.times = times;
    state.loc = loc;
    await Meta.set('prayerLoc', loc);
    if (pushSupported() && pushConfigured()) { try { await syncPushPrefs(); } catch { /* */ } }
    $('jadwalLoc').textContent = `📍 ${loc.label}`;
    renderTimes(times);
    updatePrayerNext();
    updateQibla(loc);
    await scheduleAdzan();
    // Auto-isi Imsak & Berbuka untuk Mode Ramadan.
    if (isRamadan()) {
      if (times.Imsak) { $('imsakTime').value = times.Imsak; await Meta.set('imsakTime', times.Imsak); }
      if (times.Maghrib) { $('iftarTime').value = times.Maghrib; await Meta.set('iftarTime', times.Maghrib); }
      updateCountdown();
    }
  } catch {
    $('jadwalLoc').textContent = navigator.onLine ? 'Gagal memuat' : 'Offline';
    toast(navigator.onLine ? t('jadwal_fail') : t('jadwal_offline'));
  }
}

function renderTimes(times) {
  $('jadwalTimes').innerHTML = PRAYER_ORDER.map((p) => {
    const minor = !FARD.includes(p);
    const nm = t('p_' + p, p);
    return `<button class="jt-item${minor ? ' minor' : ''}" data-prayer="${p}" aria-label="${nm}"><span>${nm}</span><b>${times[p] || '–'}</b></button>`;
  }).join('');
  $('jadwalPick').hidden = false;
}

function parseToday(hm) {
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function updatePrayerNext() {
  const el = $('jadwalNext');
  if (!el || !state.times) return;
  const now = new Date();
  let target = null;
  let manual = false;

  if (state.selectedPrayer && state.times[state.selectedPrayer]) {
    // Target dipilih manual oleh pengguna.
    const p = state.selectedPrayer;
    const t = parseToday(state.times[p]);
    if (t) {
      if (t <= now) t.setDate(t.getDate() + 1); // sudah lewat → besok
      target = { p, t };
      manual = true;
    }
  }
  if (!target) {
    // Otomatis: sholat wajib berikutnya.
    for (const p of FARD) {
      const t = parseToday(state.times[p]);
      if (t && t > now) { target = { p, t }; break; }
    }
    if (!target) {
      const t = parseToday(state.times.Subuh);
      if (t) { t.setDate(t.getDate() + 1); target = { p: 'Subuh', t }; }
    }
  }
  if (!target) { el.textContent = ''; return; }

  const diff = target.t - now;
  const hh = Math.floor(diff / 3600000), mm = Math.floor((diff % 3600000) / 60000), ss = Math.floor((diff % 60000) / 1000);
  const tag = manual ? ` ${t('tag_picked')}` : ` ${t('tag_next')}`;
  el.innerHTML = `${t('cd_to')} <b>${t('p_' + target.p, target.p)}</b> (${state.times[target.p]})${tag} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  document.querySelectorAll('#jadwalTimes .jt-item').forEach((i) => i.classList.toggle('next', i.dataset.prayer === target.p));
}

// ---------- Notifikasi Adzan ----------
function showNotif(title, body) {
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'haribaik-adzan' };
  if (navigator.serviceWorker?.ready) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => new Notification(title, opts));
  } else {
    new Notification(title, opts);
  }
}

async function initAdzan() {
  const enabled = !!(await Meta.get('adzanEnabled', false));
  $('adzanToggle').checked = enabled;
  $('adzanToggle').addEventListener('change', async (e) => {
    if (e.target.checked) {
      if (!('Notification' in window)) { e.target.checked = false; return toast(t('notif_unsupported')); }
      let perm = Notification.permission;
      if (perm === 'default') perm = await Notification.requestPermission();
      if (perm !== 'granted') { e.target.checked = false; return toast(t('notif_denied')); }
      await Meta.set('adzanEnabled', true);
      await scheduleAdzan();
      // Notifikasi latar: langganan push agar adzan muncul walau app tertutup.
      if (pushSupported() && pushConfigured()) {
        try { await enablePush(); await syncPushPrefs(); } catch { /* tetap pakai adzan saat app terbuka */ }
      }
      toast(t('adzan_on'));
    } else {
      await Meta.set('adzanEnabled', false);
      clearAdzanTimers();
      if (pushSupported() && pushConfigured()) { try { await syncPushPrefs(); } catch { /* */ } }
      toast(t('adzan_off'));
    }
  });
}

function clearAdzanTimers() {
  state.adzanTimers.forEach((id) => clearTimeout(id));
  state.adzanTimers = [];
}

async function scheduleAdzan() {
  clearAdzanTimers();
  if (!state.times) return;
  if (!(await Meta.get('adzanEnabled', false))) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const notified = (await Meta.get('adzanNotified', {})) || {};
  const todayMap = notified[TODAY] || {};
  const now = Date.now();

  for (const p of FARD) {
    const t = parseToday(state.times[p]);
    if (!t) continue;
    const delta = t.getTime() - now;
    if (delta > 0) {
      const id = setTimeout(() => fireAdzan(p), Math.min(delta, 2147483647));
      state.adzanTimers.push(id);
    } else if (delta > -5 * 60000 && !todayMap[p]) {
      // baru saja lewat (≤5 menit) & belum diberitahu → tampilkan susulan
      fireAdzan(p);
    }
  }
}

async function fireAdzan(prayer) {
  const notified = (await Meta.get('adzanNotified', {})) || {};
  notified[TODAY] = notified[TODAY] || {};
  if (notified[TODAY][prayer]) return;
  notified[TODAY][prayer] = true;
  await Meta.set('adzanNotified', notified);
  const nm = t('p_' + prayer, prayer);
  showNotif(`🕌 ${t('adzan_title').replace('{p}', nm)}`, t('adzan_body').replace('{p}', nm));
}

// ---------- Arah Kiblat ----------
function updateQibla(loc) {
  if (!loc) return;
  state.qiblaBearing = qiblaBearing(loc.lat, loc.lng);
  const deg = Math.round(state.qiblaBearing);
  $('qiblaDeg').textContent = t('qibla_deg').replace('{d}', deg);
  $('qiblaNeedle').style.transform = `translateX(-50%) rotate(${state.qiblaBearing}deg)`;
  $('qiblaHint').textContent = compassSupported() ? t('qibla_hint_compass') : t('qibla_hint_static');
}

function onHeading(h) {
  state.heading = h; // hanya simpan target; render dihaluskan di compassLoop
}

// Loop animasi: putar dial mulus ke -heading dengan easing & jalur sudut terpendek
// (menghindari lompatan di batas 0°/360° dan meredam jitter sensor).
function compassLoop() {
  const target = -state.heading;
  const delta = ((target - state.displayRot + 540) % 360) - 180;
  state.displayRot += delta * 0.15;
  const el = $('compass');
  if (el) el.style.transform = `rotate(${state.displayRot.toFixed(2)}deg)`;
  state.rafId = requestAnimationFrame(compassLoop);
}

function initQibla() {
  if (!compassSupported()) { $('qiblaEnable').style.display = 'none'; }
  $('qiblaEnable').addEventListener('click', async () => {
    const ok = await requestOrientationPermission();
    if (!ok) return toast(t('orient_denied'));
    if (state.stopCompass) state.stopCompass();
    state.stopCompass = startCompass(onHeading);
    if (!state.rafId) compassLoop();
    toast(t('compass_on'));
  });
}

// ---------- Laporan Spiritual Mingguan ----------
function weekKey() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${wk}`;
}

async function buildReportData() {
  const map = {};
  state.all.forEach((d) => { map[d.day] = d; });
  let salatDone = 0, tilawahDays = 0, puasaDays = 0, perfectDays = 0;
  for (let i = 0; i < 7; i++) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const d = map[dayKey(dt.getTime())];
    if (!d) continue;
    salatDone += salatCount(d);
    if (d.tilawah) tilawahDays++;
    if (d.puasa) puasaDays++;
    if (deedComplete(d, isRamadan())) perfectDays++;
  }
  const deeds = {
    salatStreak: computeStreak((d) => SALAT.every((s) => d.salat?.[s])),
    salatDone, tilawahStreak: computeStreak((d) => d.tilawah),
    tilawahDays, perfectDays, puasaDays,
  };
  const journal = (await Journal.all()) || [];
  const moods = journal.filter((e) => Date.now() - e.ts < 7 * 86400000).map((e) => e.mood);
  const favCount = ((await Favorites.all()) || []).length;
  const msgs = (await Messages.all()) || [];
  const topics = msgs
    .filter((m) => m.role === 'user' && Date.now() - m.ts < 8 * 86400000)
    .slice(-6).map((m) => String(m.content || '').replace(/^\[[^\]]+\]\s*/, '').slice(0, 120)).filter(Boolean);
  const profile = (await Meta.get('profile', {})) || {};
  return { deeds, moods, favCount, topics, profile, lang: getLang() };
}

function renderReport(data) {
  const el = $('repArea');
  el.className = '';
  el.innerHTML = `
    <div class="rep">
      <h3>${escapeHtml(data.judul)}</h3>
      <p class="rep-sum">${escapeHtml(data.ringkasan)}</p>
      <div class="rep-sec"><b>${t('rep_mood')}</b><p>${escapeHtml(data.mood)}</p></div>
      <div class="rep-sec"><b>${t('rep_ibadah')}</b><p>${escapeHtml(data.ibadah)}</p></div>
      <div class="rep-sec"><b>${t('rep_focus')}</b><p>${escapeHtml(data.fokus)}</p></div>
      <div class="card doa-card">
        <div class="label">${t('doa_label')}</div>
        <div class="arabic">${escapeHtml(data.doa_arabic)}</div>
        <div class="translation">${escapeHtml(data.doa_translation)}</div>
      </div>
      <div class="card-actions">
        <button class="mini-btn" id="repTts">🔊 ${t('btn_listen')}</button>
        <button class="mini-btn" id="repShare">📤 ${t('btn_share')}</button>
        <button class="mini-btn" id="repCopy">📋 ${t('btn_copy')}</button>
      </div>
    </div>`;

  const lng = getLang() === 'en' ? 'en-US' : 'id-ID';
  const ttsBtn = $('repTts');
  if (!ttsSupported()) ttsBtn.style.display = 'none';
  else ttsBtn.addEventListener('click', () => {
    if (ttsBtn.classList.contains('active')) { stopSpeak(); ttsBtn.classList.remove('active'); ttsBtn.innerHTML = `🔊 ${t('btn_listen')}`; return; }
    speak([
      { text: data.ringkasan, lang: lng }, { text: data.mood, lang: lng },
      { text: data.ibadah, lang: lng }, { text: data.fokus, lang: lng }, { text: data.doa_translation, lang: lng },
    ], (sp) => { ttsBtn.classList.toggle('active', sp); ttsBtn.innerHTML = sp ? '⏹ Stop' : `🔊 ${t('btn_listen')}`; });
  });
  $('repShare').addEventListener('click', () => shareCard({ arabic: data.doa_arabic, translation: data.doa_translation, source: data.judul }, toast));
  $('repCopy').addEventListener('click', async () => {
    const txt = `${data.judul}\n\n${data.ringkasan}\n\n${data.mood}\n\n${data.ibadah}\n\n🎯 ${data.fokus}\n\n${data.doa_arabic}\n${data.doa_translation}\n\nvia HariBaik`;
    try { await navigator.clipboard.writeText(txt); toast(t('copied')); } catch { toast(t('copy_fail')); }
  });
}

async function loadCachedReport() {
  const cache = await Meta.get('reportCache', null);
  if (cache?.data && cache.week === weekKey()) renderReport(cache.data);
}

async function generateReport() {
  const payload = await buildReportData();
  if (!payload.moods.length && !payload.deeds.salatDone && !payload.deeds.tilawahDays) {
    return toast(t('rep_min'));
  }
  const btn = $('repBtn');
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = '⏳…';
  try {
    const data = await postReport(payload);
    renderReport(data);
    await Meta.set('reportCache', { week: weekKey(), data });
  } catch (err) {
    const msg = !navigator.onLine || err?.status === 0 ? t('err_offline') : err?.status === 429 ? t('err_429') : t('rep_fail');
    toast(msg);
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

// ---------- Refresh ----------
async function refresh() {
  state.all = (await Deeds.all()) || [];
  state.today = (await Deeds.get(TODAY)) || emptyDeed(TODAY);
  renderToday();
  renderStats();
}

async function init() {
  applyI18n();
  initTheme($('themeBtn'));
  await initRamadan();
  await initJadwal();
  await initAdzan();
  initQibla();
  $('deedsList').addEventListener('click', (e) => {
    const b = e.target.closest('.deed-item[data-key]');
    if (b) toggleDeed(b.dataset.key, b);
  });
  $('deedsWeek').addEventListener('click', (e) => {
    const cell = e.target.closest('.dweek-cell[data-day]');
    if (cell) openDayEditor(cell.dataset.day);
  });
  await refresh();
  await renderChallenges(await getChallenges());
  await renderChallengeHistory();
  $('repBtn').addEventListener('click', generateReport);
  await loadCachedReport();
  await maybeSuggestRamadan();
  initCloudSync(async () => {
    await refresh();
    await renderChallenges(await getChallenges());
    await renderChallengeHistory();
  });
}

init();

import('./presence.js').then((m) => m.initPresence(document.getElementById('presenceN')));

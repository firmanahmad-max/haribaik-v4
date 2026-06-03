// amalan.js — halaman Amalan: tracker ibadah harian, statistik, Istiqomah Challenge,
// dan Mode Ramadan (Fase 3).

import { Deeds, Meta, dayKey } from './db.js';
import { initTheme, isRamadan, setRamadan } from './theme.js';

const $ = (id) => document.getElementById(id);

const SALAT = ['Subuh', 'Dzuhur', 'Ashar', 'Maghrib', 'Isya'];
const TODAY = dayKey(Date.now());

const state = { today: null, all: [] };

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
  const salatDone = SALAT.every((s) => d.salat?.[s]);
  const base = salatDone && d.tilawah;
  return ramadan ? base && d.puasa : base;
}
function salatCount(d) {
  return SALAT.filter((s) => d.salat?.[s]).length;
}

// ---------- Checklist hari ini ----------
function renderToday() {
  const ramadan = isRamadan();
  const d = state.today;
  const items = [
    ...SALAT.map((s) => ({ key: `salat:${s}`, icon: '🕌', label: `Sholat ${s}`, on: !!d.salat?.[s] })),
    { key: 'tilawah', icon: '📖', label: 'Tilawah Al-Quran', on: !!d.tilawah },
  ];
  if (ramadan) items.push({ key: 'puasa', icon: '🌙', label: 'Puasa', on: !!d.puasa });

  $('deedsList').innerHTML = items.map((it) => `
    <button class="deed-item${it.on ? ' done' : ''}" data-key="${it.key}" aria-pressed="${it.on}">
      <span class="deed-ico">${it.icon}</span>
      <span class="deed-label">${it.label}</span>
      <span class="deed-check">${it.on ? '✓' : ''}</span>
    </button>`).join('');

  const total = items.length;
  const done = items.filter((i) => i.on).length;
  $('deedsCount').textContent = `${done}/${total}`;
}

async function toggleDeed(key) {
  const d = state.today;
  if (key.startsWith('salat:')) {
    const s = key.split(':')[1];
    d.salat = d.salat || {};
    d.salat[s] = !d.salat[s];
  } else {
    d[key] = !d[key];
  }
  await Deeds.set(TODAY, d);
  if (navigator.vibrate) navigator.vibrate(8);
  await refresh();
}

// ---------- Statistik ----------
function computeStreak(predicate) {
  const map = {};
  state.all.forEach((d) => { map[d.day] = d; });
  let streak = 0;
  const cur = new Date();
  for (;;) {
    const k = dayKey(cur.getTime());
    const d = map[k];
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
    <div class="jstat"><b>🕌 ${salatStreak}</b><span>streak sholat</span></div>
    <div class="jstat"><b>📖 ${tilawahStreak}</b><span>streak tilawah</span></div>
    <div class="jstat"><b>⭐ ${fullStreak}</b><span>hari sempurna</span></div>
    <div class="jstat"><b>${totalDays}</b><span>hari aktif</span></div>`;

  // 7 hari
  const map = {};
  state.all.forEach((d) => { map[d.day] = d; });
  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const k = dayKey(dt.getTime());
    const d = map[k] || emptyDeed(k);
    const sc = salatCount(d);
    const label = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][dt.getDay()];
    const pct = Math.round((sc / 5) * 100);
    cells.push(`<div class="dweek-cell" title="${k}: ${sc}/5 sholat${d.tilawah ? ', tilawah' : ''}">
      <div class="dweek-ring" style="--p:${pct}"><span>${sc}<small>/5</small></span></div>
      <i class="dweek-til ${d.tilawah ? 'on' : ''}" title="tilawah"></i>
      <span>${label}</span>
    </div>`);
  }
  $('deedsWeek').innerHTML = cells.join('');
}

// ---------- Istiqomah Challenge ----------
const PRESET_HABITS = ['Tilawah 1 halaman', 'Sholat tepat waktu', 'Sedekah harian', 'Dzikir pagi & petang', 'Sholat Dhuha'];

async function getChallenge() {
  return (await Meta.get('challenge', null));
}

function renderChallenge(ch) {
  const area = $('challengeArea');
  if (!ch) {
    area.innerHTML = `
      <p class="jempty" style="text-align:left">Pilih satu kebiasaan baik dan jaga selama 30 hari. Bismillah 🌱</p>
      <input id="chHabit" class="ch-input" type="text" maxlength="40" list="chPresets" placeholder="mis. Tilawah 1 halaman" />
      <datalist id="chPresets">${PRESET_HABITS.map((h) => `<option value="${escapeHtml(h)}"></option>`).join('')}</datalist>
      <button class="primary-btn" id="chStart">Mulai challenge</button>`;
    $('chStart').addEventListener('click', startChallenge);
    return;
  }

  const days = ch.days || {};
  const doneCount = Object.keys(days).length;
  const pct = Math.round((doneCount / ch.target) * 100);
  const todayDone = !!days[TODAY];
  const streak = challengeStreak(ch);

  // grid 30
  const start = new Date(ch.startDay + 'T00:00:00');
  let grid = '';
  for (let i = 0; i < ch.target; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const k = dayKey(d.getTime());
    const isPast = d.getTime() <= Date.now();
    const done = !!days[k];
    grid += `<div class="ch-cell${done ? ' done' : ''}${k === TODAY ? ' today' : ''}${!isPast && !done ? ' future' : ''}" title="Hari ${i + 1}">${done ? '✓' : i + 1}</div>`;
  }

  area.innerHTML = `
    <div class="ch-head">
      <div><b>${escapeHtml(ch.habit)}</b><div class="field-hint">Mulai ${escapeHtml(ch.startDay)} · 🔥 ${streak} hari beruntun</div></div>
      <div class="ch-progress"><b>${doneCount}/${ch.target}</b><span>${pct}%</span></div>
    </div>
    <div class="ch-bar"><i style="width:${pct}%"></i></div>
    <div class="ch-grid">${grid}</div>
    <div class="ch-actions">
      <button class="primary-btn" id="chCheck"${todayDone ? ' disabled' : ''}>${todayDone ? '✓ Sudah hari ini' : 'Tandai selesai hari ini'}</button>
      <button class="mini-btn danger" id="chCancel">Batalkan</button>
    </div>
    ${doneCount >= ch.target ? '<p class="ch-done">🎉 Alhamdulillah, challenge selesai! Semoga jadi kebiasaan.</p>' : ''}`;

  $('chCheck').addEventListener('click', async () => {
    ch.days = ch.days || {};
    ch.days[TODAY] = true;
    await Meta.set('challenge', ch);
    if (navigator.vibrate) navigator.vibrate(12);
    toast('Mantap! Satu hari lagi terlewati 🌟');
    renderChallenge(ch);
  });
  $('chCancel').addEventListener('click', async () => {
    if (!confirm('Batalkan challenge ini? Progresnya akan hilang.')) return;
    await Meta.set('challenge', null);
    renderChallenge(null);
  });
}

function challengeStreak(ch) {
  const days = ch.days || {};
  let streak = 0;
  const cur = new Date();
  // mulai dari hari ini jika sudah, kalau belum mulai dari kemarin
  if (!days[dayKey(cur.getTime())]) cur.setDate(cur.getDate() - 1);
  for (;;) {
    if (days[dayKey(cur.getTime())]) { streak++; cur.setDate(cur.getDate() - 1); } else break;
  }
  return streak;
}

async function startChallenge() {
  const habit = $('chHabit').value.trim().slice(0, 40);
  if (!habit) return toast('Tulis dulu kebiasaan yang ingin kamu jaga');
  const ch = { habit, startDay: TODAY, target: 30, days: {} };
  await Meta.set('challenge', ch);
  toast('Challenge dimulai. Bismillah! 🌱');
  renderChallenge(ch);
}

// ---------- Ramadan ----------
async function initRamadan() {
  const on = isRamadan();
  $('ramadanToggle').checked = on;
  applyRamadanUi(on);
  const imsak = (await Meta.get('imsakTime', '')) || '';
  const iftar = (await Meta.get('iftarTime', '')) || '';
  $('imsakTime').value = imsak;
  $('iftarTime').value = iftar;

  $('ramadanToggle').addEventListener('change', async (e) => {
    setRamadan(e.target.checked);
    applyRamadanUi(e.target.checked);
    await refresh();
    toast(e.target.checked ? 'Mode Ramadan aktif 🌙' : 'Mode Ramadan nonaktif');
  });
  $('imsakTime').addEventListener('change', (e) => Meta.set('imsakTime', e.target.value));
  $('iftarTime').addEventListener('change', (e) => Meta.set('iftarTime', e.target.value));
}
function applyRamadanUi(on) {
  $('ramadanExtra').hidden = !on;
  $('ramadanHint').textContent = on
    ? 'Nuansa Ramadan aktif. Puasa kini bisa ditandai di Amalan hari ini.'
    : 'Aktifkan saat bulan Ramadan untuk fitur puasa & nuansa khusus.';
}

// ---------- Refresh ----------
async function refresh() {
  state.all = (await Deeds.all()) || [];
  state.today = (await Deeds.get(TODAY)) || emptyDeed(TODAY);
  renderToday();
  renderStats();
}

async function init() {
  initTheme($('themeBtn'));
  await initRamadan();
  $('deedsList').addEventListener('click', (e) => {
    const b = e.target.closest('.deed-item[data-key]');
    if (b) toggleDeed(b.dataset.key);
  });
  await refresh();
  renderChallenge(await getChallenge());
}

init();

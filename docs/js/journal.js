// journal.js — halaman Jurnal & Statistik (Fase 2).

import { MOODS } from './config.js';
import { Journal, Meta, dayKey } from './db.js';
import { postInsight } from './api.js';
import { initTheme } from './theme.js';

const $ = (id) => document.getElementById(id);

const MOOD_META = {
  Senang: { emoji: '😊', color: '#f4c430' },
  Sedih: { emoji: '😢', color: '#5b8def' },
  Cemas: { emoji: '😟', color: '#b06bd6' },
  Kesal: { emoji: '😣', color: '#e0664f' },
  Bersyukur: { emoji: '🤲', color: '#2d9b6e' },
  Lelah: { emoji: '😮‍💨', color: '#8a9a92' },
};
const colorOf = (m) => MOOD_META[m]?.color || '#8a9a92';
const emojiOf = (m) => MOOD_META[m]?.emoji || '🙂';

const state = { selectedMood: null, calMonth: startOfMonth(new Date()), entries: [] };

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
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

// ---------- Mood logger ----------
function buildMoodSelector() {
  const wrap = $('jMoodSelector');
  MOODS.forEach((mood) => {
    const b = document.createElement('button');
    b.className = 'mood-pill';
    b.textContent = `${emojiOf(mood)} ${mood}`;
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.mood-pill').forEach((p) => p.classList.remove('selected'));
      if (state.selectedMood === mood) {
        state.selectedMood = null;
      } else {
        b.classList.add('selected');
        state.selectedMood = mood;
        if (navigator.vibrate) navigator.vibrate(8);
      }
    });
    wrap.appendChild(b);
  });
}

async function saveEntry() {
  if (!state.selectedMood) return toast('Pilih mood dulu ya');
  await Journal.add({ mood: state.selectedMood, note: $('jNote').value.trim().slice(0, 300) });
  $('jNote').value = '';
  state.selectedMood = null;
  document.querySelectorAll('#jMoodSelector .mood-pill').forEach((p) => p.classList.remove('selected'));
  toast('Tersimpan ke jurnal 🌿');
  await refresh();
}

// ---------- Statistik ----------
function computeStreak(daySet) {
  let streak = 0;
  const d = new Date();
  for (;;) {
    if (daySet.has(dayKey(d.getTime()))) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  return streak;
}

function renderStats() {
  const entries = state.entries;
  const daySet = new Set(entries.map((e) => e.day));
  const counts = {};
  entries.forEach((e) => { counts[e.mood] = (counts[e.mood] || 0) + 1; });
  const total = entries.length;
  const streak = computeStreak(daySet);
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];

  $('jStatsTop').innerHTML = `
    <div class="jstat"><b>${total}</b><span>catatan</span></div>
    <div class="jstat"><b>${daySet.size}</b><span>hari</span></div>
    <div class="jstat"><b>🔥 ${streak}</b><span>streak</span></div>
    <div class="jstat"><b>${dominant ? emojiOf(dominant) : '–'}</b><span>${dominant || 'belum ada'}</span></div>`;

  // Sebaran mood (bar)
  const max = Math.max(1, ...Object.values(counts));
  $('jDist').innerHTML = MOODS.map((m) => {
    const n = counts[m] || 0;
    const pct = Math.round((n / max) * 100);
    return `<div class="jdist-row">
      <span class="jdist-label">${emojiOf(m)} ${m}</span>
      <div class="jdist-bar"><i style="width:${pct}%;background:${colorOf(m)}"></i></div>
      <span class="jdist-n">${n}</span>
    </div>`;
  }).join('');

  // 7 hari terakhir
  const byDay = {};
  entries.forEach((e) => { (byDay[e.day] ||= []).push(e.mood); });
  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d.getTime());
    const moods = byDay[k] || [];
    const dom = dominantOf(moods);
    const label = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][d.getDay()];
    cells.push(`<div class="jtrend-cell" title="${k}${dom ? ': ' + dom : ''}">
      <i style="background:${dom ? colorOf(dom) : 'transparent'};border:${dom ? 'none' : '1px dashed var(--border)'}"></i>
      <span>${label}</span>
    </div>`);
  }
  $('jTrend').innerHTML = cells.join('');
}

function dominantOf(moods) {
  if (!moods.length) return null;
  const c = {};
  moods.forEach((m) => { c[m] = (c[m] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

// ---------- Kalender ----------
function renderCalendar() {
  const month = state.calMonth;
  const y = month.getFullYear();
  const m = month.getMonth();
  $('jMonthLabel').textContent = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(month);
  $('jCalHead').innerHTML = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((d) => `<div class="jcal-cell jcal-dow">${d}</div>`).join('');

  const byDay = {};
  state.entries.forEach((e) => { (byDay[e.day] ||= []).push(e.mood); });

  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayKey = dayKey(Date.now());
  let html = '';
  for (let i = 0; i < firstDow; i++) html += '<div class="jcal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const moods = byDay[k] || [];
    const dom = dominantOf(moods);
    const isToday = k === todayKey;
    html += `<div class="jcal-cell${isToday ? ' today' : ''}" title="${moods.length ? moods.join(', ') : ''}">
      <span class="jcal-num">${d}</span>
      ${dom ? `<i class="jcal-dot" style="background:${colorOf(dom)}"></i>` : ''}
      ${moods.length > 1 ? `<em class="jcal-count">${moods.length}</em>` : ''}
    </div>`;
  }
  $('jCalBody').innerHTML = html;
}

// ---------- Insight AI ----------
async function loadCachedInsight() {
  const cache = await Meta.get('insightCache', null);
  if (cache?.data) renderInsight(cache.data, cache.generatedDay);
}

function renderInsight(data, day) {
  $('jInsight').className = '';
  $('jInsight').innerHTML = `
    <div class="jinsight">
      <h3>${escapeHtml(data.judul)}</h3>
      <p>${escapeHtml(data.insight)}</p>
      <p class="jinsight-saran">🌱 ${escapeHtml(data.saran)}</p>
      <div class="card doa-card">
        <div class="label">🤲 Doa</div>
        <div class="arabic">${escapeHtml(data.doa_arabic)}</div>
        <div class="translation">${escapeHtml(data.doa_translation)}</div>
      </div>
      ${day ? `<small class="jinsight-day">Dibuat: ${escapeHtml(day)}</small>` : ''}
    </div>`;
}

async function generateInsight() {
  const last7 = state.entries.filter((e) => Date.now() - e.ts < 8 * 86400000);
  if (last7.length < 2) return toast('Catat minimal 2 mood dulu untuk membuat insight');

  const btn = $('jInsightBtn');
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = '⏳ Membuat…';
  try {
    const profile = (await Meta.get('profile', {})) || {};
    const data = await postInsight({
      moods: last7.map((e) => ({ day: e.day, mood: e.mood })),
      profile,
    });
    renderInsight(data, dayKey(Date.now()));
    await Meta.set('insightCache', { generatedDay: dayKey(Date.now()), data });
  } catch (err) {
    const msg = !navigator.onLine || err?.status === 0
      ? 'Kamu sedang offline. Coba lagi nanti.'
      : err?.status === 429
        ? 'Terlalu banyak permintaan. Coba lagi sebentar.'
        : 'Gagal membuat insight. Coba lagi.';
    toast(msg);
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

// ---------- Refresh ----------
async function refresh() {
  state.entries = (await Journal.all()) || [];
  renderStats();
  renderCalendar();
}

async function init() {
  initTheme($('themeBtn'));
  buildMoodSelector();
  $('jSave').addEventListener('click', saveEntry);
  $('jInsightBtn').addEventListener('click', generateInsight);
  $('jPrev').addEventListener('click', () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1); renderCalendar(); });
  $('jNext').addEventListener('click', () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1); renderCalendar(); });
  await refresh();
  await loadCachedInsight();
}

init();

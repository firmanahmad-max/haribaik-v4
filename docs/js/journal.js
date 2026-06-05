// journal.js — halaman Jurnal & Statistik (Fase 2 + perbaikan).

import { MOODS, MOOD_META } from './config.js';
import { Journal, Meta, Messages, Favorites, dayKey } from './db.js';
import { postInsight } from './api.js';
import { initTheme } from './theme.js';
import { shareCard } from './share.js';
import { speak, stopSpeak, ttsSupported } from './tts.js';
import { trapFocus } from './a11y.js';
import { t, getLang, applyI18n, locale, weekdaysShort } from './i18n.js';
import { initCloudSync } from './cloud.js';

const $ = (id) => document.getElementById(id);
const colorOf = (m) => MOOD_META[m]?.color || '#8a9a92';
const emojiOf = (m) => MOOD_META[m]?.emoji || '🙂';
const scoreOf = (m) => MOOD_META[m]?.score ?? 3;

const state = { selectedMood: null, calMonth: startOfMonth(new Date()), entries: [], period: 'week', lastInsight: null };

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
function fmtTime(ts) {
  try { return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); } catch { return ''; }
}

// ---------- Mood logger ----------
function buildMoodSelector() {
  const wrap = $('jMoodSelector');
  MOODS.forEach((mood) => {
    const b = document.createElement('button');
    b.className = 'mood-pill';
    b.textContent = `${emojiOf(mood)} ${t('mood_' + mood, mood)}`;
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
  if (!state.selectedMood) return toast(t('pick_mood'));
  await Journal.add({ mood: state.selectedMood, note: $('jNote').value.trim().slice(0, 300) });
  $('jNote').value = '';
  state.selectedMood = null;
  document.querySelectorAll('#jMoodSelector .mood-pill').forEach((p) => p.classList.remove('selected'));
  toast(t('saved_journal'));
  await refresh();
}

// ---------- Statistik ----------
function inPeriod(e) {
  if (state.period === 'all') return true;
  if (state.period === 'week') return Date.now() - e.ts < 7 * 86400000;
  const d = new Date(e.ts);
  const n = new Date();
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}
function computeStreak(daySet) {
  let s = 0;
  const d = new Date();
  for (;;) { if (daySet.has(dayKey(d.getTime()))) { s++; d.setDate(d.getDate() - 1); } else break; }
  return s;
}
function longestStreak(daySet) {
  const days = [...daySet].sort();
  let best = 0, run = 0, prev = null;
  for (const k of days) {
    const cur = new Date(k + 'T00:00:00').getTime();
    if (prev !== null && cur - prev === 86400000) run++; else run = 1;
    best = Math.max(best, run);
    prev = cur;
  }
  return best;
}
function dominantOf(moods) {
  if (!moods.length) return null;
  const c = {};
  moods.forEach((m) => { c[m] = (c[m] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

function renderStats() {
  const all = state.entries;
  if (!all.length) {
    $('jStatsTop').innerHTML = `<div class="jempty">${t('j_empty_start')}</div>`;
    $('jDist').innerHTML = '';
    $('jTrend').innerHTML = '';
    $('jMonthTrend').innerHTML = '';
    $('jLegend').innerHTML = '';
    return;
  }
  const daySet = new Set(all.map((e) => e.day));
  const filtered = all.filter(inPeriod);
  const counts = {};
  filtered.forEach((e) => { counts[e.mood] = (counts[e.mood] || 0) + 1; });
  const total = filtered.length;
  const daysInPeriod = new Set(filtered.map((e) => e.day)).size;
  const streak = computeStreak(daySet);
  const best = longestStreak(daySet);
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];

  $('jStatsTop').innerHTML = `
    <div class="jstat"><b>${total}</b><span>${t('st_notes')}</span></div>
    <div class="jstat"><b>${daysInPeriod}</b><span>${t('st_days')}</span></div>
    <div class="jstat"><b>🔥 ${streak}</b><span>${t('st_streak')} · ${t('st_record')} ${best}</span></div>
    <div class="jstat"><b>${dominant ? emojiOf(dominant) : '–'}</b><span>${dominant ? t('mood_' + dominant, dominant) : t('st_none')}</span></div>`;

  // Sebaran mood
  if (!total) {
    $('jDist').innerHTML = `<div class="jempty">${t('j_empty_period')}</div>`;
  } else {
    const max = Math.max(1, ...Object.values(counts));
    $('jDist').innerHTML = MOODS.map((m) => {
      const n = counts[m] || 0;
      const pct = Math.round((n / max) * 100);
      return `<div class="jdist-row">
        <span class="jdist-label">${emojiOf(m)} ${t('mood_' + m, m)}</span>
        <div class="jdist-bar"><i style="width:${pct}%;background:${colorOf(m)}"></i></div>
        <span class="jdist-n">${n}</span>
      </div>`;
    }).join('');
  }

  renderCompare(all);

  // Legenda
  $('jLegend').innerHTML = MOODS.map((m) => `<span class="jleg"><i style="background:${colorOf(m)}"></i>${t('mood_' + m, m)}</span>`).join('');

  // 7 hari terakhir
  const wd = weekdaysShort();
  const byDay = {};
  all.forEach((e) => { (byDay[e.day] ||= []).push(e.mood); });
  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d.getTime());
    const dom = dominantOf(byDay[k] || []);
    const label = wd[d.getDay()];
    cells.push(`<div class="jtrend-cell" title="${k}${dom ? ': ' + dom : ''}">
      <i style="background:${dom ? colorOf(dom) : 'transparent'};border:${dom ? 'none' : '1px dashed var(--border)'}"></i>
      <span>${label}</span></div>`);
  }
  $('jTrend').innerHTML = cells.join('');

  renderMonthTrend(byDay);
}

// Perbandingan minggu ini vs minggu lalu (tanpa AI).
function renderCompare(all) {
  const el = $('jCompare');
  const now = Date.now();
  const thisWeek = all.filter((e) => now - e.ts < 7 * 86400000);
  const lastWeek = all.filter((e) => now - e.ts >= 7 * 86400000 && now - e.ts < 14 * 86400000);
  const avg = (arr) => (arr.length ? arr.reduce((a, e) => a + scoreOf(e.mood), 0) / arr.length : null);
  const a1 = avg(thisWeek);
  const a0 = avg(lastWeek);
  if (a1 == null) { el.innerHTML = ''; return; }

  let mood;
  if (a0 == null) {
    mood = t('cmp_first');
  } else {
    const d = a1 - a0;
    mood = Math.abs(d) < 0.3 ? t('cmp_similar') : d > 0 ? t('cmp_brighter') : t('cmp_heavier');
  }
  const dCount = thisWeek.length - (lastWeek.length || 0);
  const countTxt = a0 == null
    ? t('cmp_count').replace('{n}', thisWeek.length)
    : t('cmp_count_delta').replace('{n}', thisWeek.length).replace('{d}', `${dCount >= 0 ? '+' : ''}${dCount}`);
  el.innerHTML = `<span class="jcompare-icon">📈</span><span>${mood} <b>${countTxt}</b></span>`;
}

function renderMonthTrend(byDay) {
  const y = state.calMonth.getFullYear();
  const m = state.calMonth.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const W = 300, H = 60, padX = 6, padY = 6;
  const pts = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const moods = byDay[k];
    if (!moods || !moods.length) { pts.push(null); continue; }
    const avg = moods.reduce((a, b) => a + scoreOf(b), 0) / moods.length;
    const x = padX + ((d - 1) / Math.max(1, daysInMonth - 1)) * (W - 2 * padX);
    const yy = H - padY - ((avg - 1) / 4) * (H - 2 * padY);
    pts.push({ x, y: yy });
  }
  const real = pts.filter(Boolean);
  if (real.length < 2) {
    $('jMonthTrend').innerHTML = `<div class="jempty">${t('j_trend_nodata')}</div>`;
    return;
  }
  // garis menyambung titik yang ada (lewati hari kosong)
  let path = '';
  let started = false;
  pts.forEach((p) => {
    if (!p) return;
    path += `${started ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `;
    started = true;
  });
  const dots = real.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="var(--accent-gold)"/>`).join('');
  $('jMonthTrend').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Tren suasana hati bulan ini">
    <path d="${path}" fill="none" stroke="var(--accent-teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

// ---------- Kalender ----------
function renderCalendar() {
  const month = state.calMonth;
  const y = month.getFullYear();
  const m = month.getMonth();
  $('jMonthLabel').textContent = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(month);
  $('jCalHead').innerHTML = weekdaysShort().map((d) => `<div class="jcal-cell jcal-dow">${d}</div>`).join('');

  const byDay = {};
  state.entries.forEach((e) => { (byDay[e.day] ||= []).push(e.mood); });

  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayKey = dayKey(Date.now());
  const monthName = new Intl.DateTimeFormat(locale(), { month: 'long' }).format(month);
  let html = '';
  for (let i = 0; i < firstDow; i++) html += '<div class="jcal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const moods = byDay[k] || [];
    const dom = dominantOf(moods);
    const isToday = k === todayKey;
    const aria = `${d} ${monthName}${moods.length ? `, ${moods.length} catatan` : ', tidak ada catatan'}`;
    html += `<button class="jcal-cell${isToday ? ' today' : ''}${moods.length ? ' has' : ''}" data-day="${k}" aria-label="${aria}">
      <span class="jcal-num">${d}</span>
      ${dom ? `<i class="jcal-dot" style="background:${colorOf(dom)}"></i>` : ''}
      ${moods.length > 1 ? `<em class="jcal-count">${moods.length}</em>` : ''}
    </button>`;
  }
  $('jCalBody').innerHTML = html;

  // Nonaktifkan tombol bulan berikutnya bila sudah di bulan berjalan.
  $('jNext').disabled = startOfMonth(month).getTime() >= startOfMonth(new Date()).getTime();
}

// ---------- Detail hari (lihat & hapus entri) ----------
function openDayDetail(k) {
  const entries = state.entries.filter((e) => e.day === k).sort((a, b) => a.ts - b.ts);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const dateLabel = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(k + 'T00:00:00'));
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${dateLabel}">
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">${dateLabel}</h2>
      <div id="jDayList"></div>
      <div class="sheet-actions"><span class="spacer"></span><button class="chip-btn" id="jDayClose">${t('close')}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const close = () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 250); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  trapFocus(overlay, overlay.querySelector('.sheet'), { onEscape: close });
  overlay.querySelector('#jDayClose').addEventListener('click', close);
  overlay.querySelector('#jDayClose').focus();

  const list = overlay.querySelector('#jDayList');
  const draw = (items) => {
    if (!items.length) { list.innerHTML = `<div class="jempty">${t('day_empty')}</div>`; return; }
    list.innerHTML = items.map((e) => `
      <div class="jday-entry">
        <span class="jday-mood">${emojiOf(e.mood)} ${t('mood_' + e.mood, e.mood)}</span>
        <span class="jday-time">${fmtTime(e.ts)}${e.source === 'chat' ? ' · ' + t('from_chat') : ''}</span>
        ${e.note ? `<p class="jday-note">${escapeHtml(e.note)}</p>` : ''}
        <button class="mini-btn danger jday-del" data-id="${e.id}">${t('del')}</button>
      </div>`).join('');
    list.querySelectorAll('.jday-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await Journal.remove(Number(btn.dataset.id));
        await refresh();
        const left = state.entries.filter((x) => x.day === k).sort((a, b) => a.ts - b.ts);
        draw(left);
        toast(t('entry_deleted'));
      });
    });
  };
  draw(entries);
}

// ---------- Insight AI ----------
async function loadCachedInsight() {
  const cache = await Meta.get('insightCache', null);
  if (cache?.data) renderInsight(cache.data, cache.generatedDay);
  await renderInsightHistory();
}

// Riwayat refleksi mingguan (klik untuk menampilkan kembali).
async function renderInsightHistory() {
  const hist = (await Meta.get('insightHistory', [])) || [];
  const el = $('jInsightHistory');
  if (hist.length < 2) { el.innerHTML = ''; return; }
  const items = hist.slice(-12).reverse();
  el.innerHTML =
    `<h3 class="jsub">${t('j_history')}</h3><div class="jhist-list">` +
    items.map((h, i) => `<button class="jhist-item" data-i="${i}">${escapeHtml(h.data.judul)}<small>${escapeHtml(h.day)}</small></button>`).join('') +
    '</div>';
  el.querySelectorAll('.jhist-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const h = items[Number(btn.dataset.i)];
      renderInsight(h.data, h.day);
      $('jInsight').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

function renderInsight(data, day) {
  state.lastInsight = data;
  const el = $('jInsight');
  el.className = '';
  el.innerHTML = `
    <div class="jinsight">
      <h3>${escapeHtml(data.judul)}</h3>
      <p>${escapeHtml(data.insight)}</p>
      <p class="jinsight-saran">🌱 ${escapeHtml(data.saran)}</p>
      <div class="card doa-card">
        <div class="label">${t('doa_label')}</div>
        <div class="arabic">${escapeHtml(data.doa_arabic)}</div>
        <div class="translation">${escapeHtml(data.doa_translation)}</div>
      </div>
      <div class="card-actions">
        <button class="mini-btn" id="iRefresh">${t('i_refresh')}</button>
        <button class="mini-btn" id="iTts">🔊 ${t('btn_listen')}</button>
        <button class="mini-btn" id="iShare">📤 ${t('btn_share')}</button>
        <button class="mini-btn" id="iCopy">📋 ${t('btn_copy')}</button>
        <button class="mini-btn" id="iSave">${t('i_save_doa')}</button>
      </div>
      ${day ? `<small class="jinsight-day">${t('created')}: ${escapeHtml(day)}</small>` : ''}
    </div>`;

  $('iRefresh').addEventListener('click', () => generateInsight(true));

  const lng = getLang() === 'en' ? 'en-US' : 'id-ID';
  const ttsBtn = $('iTts');
  if (!ttsSupported()) ttsBtn.style.display = 'none';
  else ttsBtn.addEventListener('click', () => {
    if (ttsBtn.classList.contains('active')) { stopSpeak(); ttsBtn.classList.remove('active'); ttsBtn.innerHTML = `🔊 ${t('btn_listen')}`; return; }
    speak([
      { text: data.insight, lang: lng },
      { text: data.saran, lang: lng },
      { text: data.doa_translation, lang: lng },
    ], (sp) => { ttsBtn.classList.toggle('active', sp); ttsBtn.innerHTML = sp ? '⏹ Stop' : `🔊 ${t('btn_listen')}`; });
  });

  // Bagikan: pakai doa (ringkas) agar muat di kartu — insight panjang dipakai untuk Salin/Dengar.
  $('iShare').addEventListener('click', () => shareCard({ arabic: data.doa_arabic, translation: data.doa_translation, source: data.judul }, toast));

  $('iCopy').addEventListener('click', async () => {
    const txt = `${data.judul}\n\n${data.insight}\n\n🌱 ${data.saran}\n\n${data.doa_arabic}\n${data.doa_translation}\n\nvia HariBaik`;
    try { await navigator.clipboard.writeText(txt); toast(t('insight_copied')); } catch { toast(t('copy_fail')); }
  });

  const saveBtn = $('iSave');
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return;
    await Favorites.add({ arabic: data.doa_arabic, translation: data.doa_translation, source: data.judul, source_type: 'doa' });
    saveBtn.disabled = true;
    saveBtn.innerHTML = `✓ ${t('saved_done')}`;
    toast(t('saved_doa'));
  });
}

async function gatherTopics() {
  const msgs = (await Messages.all()) || [];
  return msgs
    .filter((m) => m.role === 'user' && Date.now() - m.ts < 8 * 86400000)
    .slice(-8)
    .map((m) => String(m.content || '').replace(/^\[[^\]]+\]\s*/, '').slice(0, 120))
    .filter(Boolean);
}

async function generateInsight(force = false) {
  const last7 = state.entries.filter((e) => Date.now() - e.ts < 8 * 86400000);
  if (last7.length < 2) return toast(t('insight_min2'));

  if (!force) {
    const cache = await Meta.get('insightCache', null);
    if (cache?.generatedDay === dayKey(Date.now()) && cache.data) { renderInsight(cache.data, cache.generatedDay); return; }
  }

  const btn = $('jInsightBtn');
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = '⏳ Membuat…';
  try {
    const profile = (await Meta.get('profile', {})) || {};
    const data = await postInsight({
      moods: last7.map((e) => ({ day: e.day, mood: e.mood })),
      profile,
      topics: await gatherTopics(),
      lang: getLang(),
    });
    renderInsight(data, dayKey(Date.now()));
    await Meta.set('insightCache', { generatedDay: dayKey(Date.now()), data });
    const hist = (await Meta.get('insightHistory', [])) || [];
    hist.push({ day: dayKey(Date.now()), data });
    await Meta.set('insightHistory', hist.slice(-12));
    await renderInsightHistory();
  } catch (err) {
    const msg = !navigator.onLine || err?.status === 0 ? t('err_offline') : err?.status === 429 ? t('err_429') : t('insight_fail');
    toast(msg);
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

// ---------- Export / Import jurnal ----------
function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function initBackup() {
  $('jExport').addEventListener('click', async () => {
    const items = (await Journal.all()) || [];
    if (!items.length) return toast(t('jx_none'));
    const clean = items.map(({ mood, note, ts }) => ({ mood, note, ts }));
    download('haribaik-jurnal.json', JSON.stringify(clean, null, 2));
    toast(t('jx_done').replace('{n}', clean.length));
  });
  const file = $('jFile');
  $('jImport').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const arr = JSON.parse(await f.text());
      if (!Array.isArray(arr)) throw new Error('format');
      const existing = (await Journal.all()) || [];
      const seen = new Set(existing.map((e) => `${e.ts}|${e.mood}`));
      let added = 0;
      for (const it of arr) {
        const key = `${it?.ts}|${it?.mood}`;
        if (it && it.mood && it.ts && !seen.has(key)) {
          await Journal.add({ mood: String(it.mood).slice(0, 20), note: String(it.note || '').slice(0, 300), ts: Number(it.ts) });
          seen.add(key);
          added++;
        }
      }
      toast(added ? t('jx_imported').replace('{n}', added) : t('jx_nonew'));
      await refresh();
    } catch {
      toast(t('invalid_file'));
    } finally {
      file.value = '';
    }
  });
}

// ---------- Refresh ----------
async function refresh() {
  state.entries = (await Journal.all()) || [];
  renderStats();
  renderCalendar();
}

async function init() {
  applyI18n();
  initTheme($('themeBtn'));
  buildMoodSelector();
  $('jSave').addEventListener('click', saveEntry);
  $('jInsightBtn').addEventListener('click', () => generateInsight(false));
  $('jPrev').addEventListener('click', () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1); renderStats(); renderCalendar(); });
  $('jNext').addEventListener('click', () => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1); renderStats(); renderCalendar(); });
  $('jCalBody').addEventListener('click', (e) => {
    const cell = e.target.closest('.jcal-cell[data-day]');
    if (cell) openDayDetail(cell.dataset.day);
  });
  $('jPeriod').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-period]');
    if (!b) return;
    state.period = b.dataset.period;
    $('jPeriod').querySelectorAll('button').forEach((x) => x.classList.toggle('selected', x === b));
    renderStats();
  });
  initBackup();
  await refresh();
  await loadCachedInsight();
  initCloudSync(() => refresh());
}

init();

import('./presence.js').then((m) => m.initPresence(document.getElementById('presenceN')));

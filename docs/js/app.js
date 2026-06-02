// app.js — bootstrap & orkestrasi HariBaik V4.

import { MOODS } from './config.js';
import { postChat } from './api.js';
import { Messages, Meta, nextRequestCount } from './db.js';
import { buildTemporal, touchStreak } from './context.js';
import { initTheme } from './theme.js';
import { initVoice } from './voice.js';
import { initNotify } from './notify.js';
import { renderUser, renderAI, renderError, showTyping, hideTyping } from './chat.js';

const $ = (id) => document.getElementById(id);

const state = {
  history: [], // {role, content} untuk konteks API
  selectedMood: null,
  profile: { nama: '', goal: '' },
  busy: false,
};

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- Context bar ----------
async function refreshContextBar() {
  const t = buildTemporal();
  $('ctxWaktu').textContent = `${t.icon} ${t.waktu}`;
  $('ctxHijri').textContent = `🌙 ${t.hijri}`;
  const streak = await touchStreak();
  $('ctxStreak').textContent = `🔥 ${streak} hari`;
}

// ---------- Mood selector ----------
function buildMoodSelector() {
  const wrap = $('moodSelector');
  MOODS.forEach((mood) => {
    const b = document.createElement('button');
    b.className = 'mood-pill';
    b.textContent = mood;
    b.addEventListener('click', () => {
      const wasSelected = b.classList.contains('selected');
      wrap.querySelectorAll('.mood-pill').forEach((p) => p.classList.remove('selected'));
      if (wasSelected) {
        state.selectedMood = null;
      } else {
        b.classList.add('selected');
        state.selectedMood = mood;
      }
    });
    wrap.appendChild(b);
  });
}

// ---------- Recent moods (untuk personalisasi) ----------
async function recentMoods() {
  const list = (await Meta.get('moodLog', [])) || [];
  return list.slice(-7).map((m) => m.mood);
}
async function logMood(mood) {
  if (!mood) return;
  const list = (await Meta.get('moodLog', [])) || [];
  list.push({ mood, ts: Date.now() });
  await Meta.set('moodLog', list.slice(-30));
}

// ---------- Kirim pesan ----------
async function send(text) {
  if (state.busy) return;
  const message = (text ?? $('input').value).trim();
  const mood = state.selectedMood;
  if (!message && !mood) return;

  state.busy = true;
  $('sendBtn').disabled = true;

  const displayText = message || `Hari ini aku merasa ${mood}.`;
  renderUser(mood && message ? `[${mood}] ${message}` : displayText);
  $('input').value = '';
  autoGrow();

  // simpan turn user
  state.history.push({ role: 'user', content: displayText });
  await Messages.add({ role: 'user', content: displayText, mood });
  await logMood(mood);

  showTyping();

  try {
    const requestCount = await nextRequestCount();
    const t = buildTemporal();
    const r = await postChat({
      message,
      mood,
      history: state.history.slice(0, -1), // konteks sebelum pesan terbaru
      profile: state.profile,
      temporal: { waktu: t.waktu, hari: t.hari, hijri: t.hijri },
      requestCount,
      recentMoods: await recentMoods(),
    });

    hideTyping();
    renderAI(r, (reply) => send(reply), toast);

    // simpan turn AI sebagai konteks ringkas
    const aiSummary = `${r.empati} (${r.source}: ${r.translation})`;
    state.history.push({ role: 'assistant', content: aiSummary });
    await Messages.add({ role: 'assistant', content: aiSummary, payload: r });
  } catch (err) {
    hideTyping();
    renderError(err.message || 'Gagal terhubung ke server. Coba lagi.');
  } finally {
    state.busy = false;
    $('sendBtn').disabled = false;
    // reset mood setelah dipakai
    state.selectedMood = null;
    document.querySelectorAll('.mood-pill').forEach((p) => p.classList.remove('selected'));
  }
}

// ---------- Textarea auto-grow ----------
function autoGrow() {
  const ta = $('input');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

// ---------- Greeting ----------
function greeting() {
  const t = buildTemporal();
  const nama = state.profile.nama || 'Sahabat';
  renderAI(
    {
      empati: `Assalamu'alaikum, ${nama}. Selamat ${t.waktu.toLowerCase()} 🌿 Apa yang sedang kamu rasakan hari ini? Ceritakan, atau pilih mood di bawah.`,
      source_type: 'quran',
      arabic: 'وَبَشِّرِ ٱلصَّـٰبِرِينَ',
      translation: 'Dan sampaikanlah kabar gembira kepada orang-orang yang sabar.',
      source: 'Al-Baqarah:155',
      aksi: 'Tarik napas perlahan tiga kali, lalu sebut satu hal yang kamu syukuri pagi ini.',
      doa_arabic: 'اللَّهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا',
      doa_translation: 'Ya Allah, dengan rahmat-Mu kami memasuki pagi dan petang.',
    },
    (reply) => send(reply),
    toast
  );
}

// ---------- Init ----------
async function init() {
  initTheme($('themeBtn'));
  buildMoodSelector();
  initVoice($('voiceBtn'), $('input'), toast);
  await initNotify($('notifyBtn'), toast);
  await refreshContextBar();

  // muat profil tersimpan
  state.profile = (await Meta.get('profile', { nama: '', goal: '' })) || { nama: '', goal: '' };

  greeting();

  $('sendBtn').addEventListener('click', () => send());
  $('input').addEventListener('input', autoGrow);
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // Service worker (PWA + notifikasi)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();

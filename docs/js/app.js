// app.js — bootstrap & orkestrasi HariBaik V4.

import { MOODS } from './config.js';
import { postChat } from './api.js';
import { Messages, Meta, nextRequestCount } from './db.js';
import { buildTemporal, gregorianDate, touchStreak } from './context.js';
import { initTheme } from './theme.js';
import { initVoice } from './voice.js';
import { initNotify } from './notify.js';
import { initSettings, openSettings, maybeOnboard } from './settings.js';
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

// ---------- Context bar (+ toggle tanggal Masehi) ----------
async function refreshContextBar() {
  const t = buildTemporal();
  $('ctxWaktu').textContent = `${t.icon} ${t.waktu}`;
  const hijriEl = $('ctxHijri');
  hijriEl.dataset.hijri = `🌙 ${t.hijri}`;
  hijriEl.dataset.greg = `📅 ${gregorianDate()}`;
  hijriEl.textContent = hijriEl.dataset.hijri;
  hijriEl.title = 'Ketuk untuk lihat tanggal Masehi';
  hijriEl.style.cursor = 'pointer';
  hijriEl.onclick = () => {
    const showingHijri = hijriEl.textContent === hijriEl.dataset.hijri;
    hijriEl.textContent = showingHijri ? hijriEl.dataset.greg : hijriEl.dataset.hijri;
  };
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
        if (navigator.vibrate) navigator.vibrate(8); // haptic halus
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

// ---------- Loading state ----------
function setLoading(on) {
  state.busy = on;
  $('input').disabled = on;
  const btn = $('sendBtn');
  btn.disabled = on;
  btn.classList.toggle('loading', on);
  btn.innerHTML = on ? '<span class="spinner"></span>' : '➤';
}

// ---------- Kirim pesan ----------
async function send(text) {
  if (state.busy) return;
  const message = (text ?? $('input').value).trim();
  const mood = state.selectedMood;
  if (!message && !mood) return;

  const displayText = message || `Hari ini aku merasa ${mood}.`;
  renderUser(mood && message ? `[${mood}] ${message}` : displayText);
  $('input').value = '';
  autoGrow();

  // simpan turn user
  state.history.push({ role: 'user', content: displayText });
  await Messages.add({ role: 'user', content: displayText, mood });
  await logMood(mood);

  // reset mood setelah dipakai
  state.selectedMood = null;
  document.querySelectorAll('.mood-pill').forEach((p) => p.classList.remove('selected'));

  await requestAi(message, mood);
}

// Bagian pemanggilan AI dipisah agar bisa dipakai ulang oleh tombol "Coba lagi".
async function requestAi(message, mood) {
  setLoading(true);
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

    const aiSummary = `${r.empati} (${r.source}: ${r.translation})`;
    state.history.push({ role: 'assistant', content: aiSummary });
    await Messages.add({ role: 'assistant', content: aiSummary, payload: r });
  } catch (err) {
    hideTyping();
    renderError(err.message || 'Gagal terhubung ke server.', () => requestAi(message, mood));
  } finally {
    setLoading(false);
  }
}

// ---------- Textarea auto-grow ----------
function autoGrow() {
  const ta = $('input');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

// ---------- Greeting (bervariasi) ----------
const SALAM = { Pagi: 'Selamat pagi', Siang: 'Selamat siang', Sore: 'Selamat sore', Malam: 'Selamat malam' };
const GREET_AYAT = [
  { arabic: 'وَبَشِّرِ ٱلصَّـٰبِرِينَ', translation: 'Dan sampaikanlah kabar gembira kepada orang-orang yang sabar.', source: 'Al-Baqarah:155' },
  { arabic: 'فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا', translation: 'Maka sesungguhnya bersama kesulitan ada kemudahan.', source: 'Asy-Syarh:5' },
  { arabic: 'وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ', translation: 'Dan Dia bersamamu di mana pun kamu berada.', source: 'Al-Hadid:4' },
  { arabic: 'أَلَا بِذِكْرِ ٱللَّهِ تَطْمَئِنُّ ٱلْقُلُوبُ', translation: 'Ingatlah, hanya dengan mengingat Allah hati menjadi tenang.', source: "Ar-Ra'd:28" },
];
const GREET_DOA = [
  { doa_arabic: 'اللَّهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا', doa_translation: 'Ya Allah, dengan rahmat-Mu kami memasuki pagi dan petang.' },
  { doa_arabic: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي', doa_translation: 'Ya Tuhanku, lapangkanlah dadaku dan mudahkanlah urusanku.' },
];
const GREET_AKSI = [
  'Tarik napas perlahan tiga kali, lalu sebut satu hal yang kamu syukuri.',
  'Tuliskan satu niat baik kecil untuk hari ini.',
  'Kirim pesan baik ke satu orang yang kamu sayangi.',
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function greeting() {
  const t = buildTemporal();
  const nama = state.profile.nama || 'Sahabat';
  const ayat = pick(GREET_AYAT);
  const doa = pick(GREET_DOA);
  renderAI(
    {
      empati: `Assalamu'alaikum, ${nama}. ${SALAM[t.waktu]} 🌿 Apa yang sedang kamu rasakan hari ini? Ceritakan, atau pilih mood di bawah.`,
      source_type: 'quran',
      ...ayat,
      aksi: pick(GREET_AKSI),
      ...doa,
    },
    (reply) => send(reply),
    toast
  );
}

// ---------- Pulihkan percakapan dari IndexedDB ----------
async function restoreConversation() {
  const msgs = (await Messages.all()) || [];
  if (!msgs.length) return false;
  for (const m of msgs.slice(-40)) {
    if (m.role === 'user') {
      renderUser(m.content, m.ts);
      state.history.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant' && m.payload) {
      renderAI(m.payload, (reply) => send(reply), toast, m.ts);
      state.history.push({ role: 'assistant', content: m.content });
    }
  }
  return true;
}

// ---------- Init ----------
async function init() {
  initTheme($('themeBtn'));
  buildMoodSelector();
  initVoice($('voiceBtn'), $('input'), toast);
  initSettings((profile) => {
    state.profile = profile;
    toast('Pengaturan tersimpan');
  });
  await refreshContextBar();

  // muat profil tersimpan
  state.profile = (await Meta.get('profile', { nama: '', goal: '' })) || { nama: '', goal: '' };

  const restored = await restoreConversation();
  if (!restored) greeting();

  $('settingsBtn').addEventListener('click', () => openSettings());
  $('sendBtn').addEventListener('click', () => send());
  $('input').addEventListener('input', autoGrow);
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  await initNotify();

  // Service worker (PWA + notifikasi)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Onboarding bila belum ada nama (setelah UI siap).
  await maybeOnboard();
}

init();

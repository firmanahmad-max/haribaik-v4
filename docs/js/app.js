// app.js — bootstrap & orkestrasi HariBaik V4.

import { MOODS, MOOD_META } from './config.js';
import { postChat } from './api.js';
import { Messages, Meta, Journal, nextRequestCount } from './db.js';
import { buildTemporal, gregorianDate, touchStreak } from './context.js';
import { initTheme } from './theme.js';
import { initVoice } from './voice.js';
import { initNotify } from './notify.js';
import { initSettings, openSettings, maybeOnboard } from './settings.js';
import { renderUser, renderAI, renderError, showTyping, hideTyping, setUserAvatar, renderSupportCard } from './chat.js';
import { t as tr, getLang, applyI18n, composerPlaceholders } from './i18n.js';
import { initCloudSync } from './cloud.js';

// Avatar pengguna berdasarkan jenis kelamin.
function avatarFor(gender) {
  if (gender === 'Perempuan') return '🧕';
  if (gender === 'Laki-laki') return '🧔';
  return '🧑';
}

const $ = (id) => document.getElementById(id);

const state = {
  history: [], // {role, content} untuk konteks API
  selectedMood: null,
  profile: { nama: '', goal: '' },
  busy: false,
  sessionAiTurns: 0, // hitung respons AI BARU di sesi ini (tidak termasuk restore)
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
  const tm = buildTemporal();
  $('ctxWaktu').textContent = `${tm.icon} ${tr('time_' + tm.waktu, tm.waktu)}`;
  const hijriEl = $('ctxHijri');
  hijriEl.dataset.hijri = `🌙 ${tm.hijri}`;
  hijriEl.dataset.greg = `📅 ${gregorianDate()}`;
  hijriEl.textContent = hijriEl.dataset.hijri;
  hijriEl.title = 'Ketuk untuk lihat tanggal Masehi';
  hijriEl.style.cursor = 'pointer';
  hijriEl.onclick = () => {
    const showingHijri = hijriEl.textContent === hijriEl.dataset.hijri;
    hijriEl.textContent = showingHijri ? hijriEl.dataset.greg : hijriEl.dataset.hijri;
  };
  const streak = await touchStreak();
  const streakEl = $('ctxStreak');
  streakEl.textContent = `🔥 ${streak} ${tr('days')}`;
  streakEl.title = tr('streak_title');
}

// ---------- Mood selector ----------
function buildMoodSelector() {
  const wrap = $('moodSelector');
  MOODS.forEach((mood) => {
    const b = document.createElement('button');
    b.className = 'mood-pill';
    b.textContent = `${MOOD_META[mood]?.emoji || ''} ${tr('mood_' + mood, mood)}`.trim();
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
// Sumber tunggal: store Jurnal (mood dari chat & jurnal sudah tergabung di sana).
async function recentMoods() {
  const entries = (await Journal.all()) || [];
  return entries
    .sort((a, b) => a.ts - b.ts)
    .slice(-7)
    .map((e) => e.mood);
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
  // Satukan dengan Jurnal: mood dari Chat ikut tercatat (tanpa menyimpan isi pesan demi privasi).
  if (mood) await Journal.add({ mood, source: 'chat' });

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
      lang: getLang(),
    });

    hideTyping();
    renderAI(r, (reply) => send(reply), toast);

    // Ringkasan untuk konteks AI berikutnya (mode-aware).
    const base = r.mode === 'conversational' ? (r.reply || '') : (r.empati || '');
    const quote = r.source && r.translation ? ` (${r.source}: ${r.translation})` : '';
    const aiSummary = (base + quote).trim() || '(respons)';
    state.history.push({ role: 'assistant', content: aiSummary });
    await Messages.add({ role: 'assistant', content: aiSummary, payload: r });
    state.sessionAiTurns++;

    await maybeShowSupport();
  } catch (err) {
    hideTyping();
    renderError(friendlyError(err), () => requestAi(message, mood));
  } finally {
    setLoading(false);
  }
}

// Ajakan halus melihat Tentang & berdonasi — sesekali (maks 1×/hari, setelah
// beberapa interaksi agar tidak mengganggu).
async function maybeShowSupport() {
  const today = new Date().toDateString();
  if ((await Meta.get('supportShownDay', null)) === today) return;
  // Hitung HANYA respons AI baru di sesi ini, agar tidak langsung muncul
  // tepat setelah reload (restore mengisi history dengan respons lama).
  if (state.sessionAiTurns < 2) return;
  await Meta.set('supportShownDay', today);
  setTimeout(() => {
    renderSupportCard(
      () => { location.href = 'tentang.html'; },
      () => { location.href = 'tentang.html#dukungan'; }
    );
  }, 900);
}

// Pesan error yang ramah & spesifik berdasarkan jenis kegagalan.
function friendlyError(err) {
  if (!navigator.onLine || err?.status === 0) return tr('err_offline');
  if (err?.status === 429) return tr('err_429');
  if (err?.status >= 500) return tr('err_5xx');
  return tr('err_generic');
}

// ---------- Placeholder kolom chat: bergulir, santai & dekat ----------
function initComposerPlaceholder() {
  const input = $('input');
  const list = composerPlaceholders();
  if (!input || !list.length) return;
  let i = Math.floor(Math.random() * list.length);
  const apply = () => { input.placeholder = list[i % list.length]; };
  apply();
  setInterval(() => {
    // Jangan ganggu saat pengguna sedang mengetik/fokus.
    if (document.activeElement === input || input.value.trim()) return;
    input.classList.add('ph-fade');
    setTimeout(() => { i++; apply(); input.classList.remove('ph-fade'); }, 320);
  }, 5000);
}

// ---------- Textarea auto-grow ----------
function autoGrow() {
  const ta = $('input');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

// ---------- Greeting (bervariasi, dwibahasa) ----------
const SALAM_KEY = { Pagi: 'greet_morning', Siang: 'greet_noon', Sore: 'greet_afternoon', Malam: 'greet_evening' };
const GREET_AYAT = [
  { arabic: 'وَبَشِّرِ ٱلصَّـٰبِرِينَ', source: 'Al-Baqarah:155', id: 'Dan sampaikanlah kabar gembira kepada orang-orang yang sabar.', en: 'And give good tidings to the patient.' },
  { arabic: 'فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا', source: 'Asy-Syarh:5', id: 'Maka sesungguhnya bersama kesulitan ada kemudahan.', en: 'For indeed, with hardship comes ease.' },
  { arabic: 'وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ', source: 'Al-Hadid:4', id: 'Dan Dia bersamamu di mana pun kamu berada.', en: 'And He is with you wherever you are.' },
  { arabic: 'أَلَا بِذِكْرِ ٱللَّهِ تَطْمَئِنُّ ٱلْقُلُوبُ', source: "Ar-Ra'd:28", id: 'Ingatlah, hanya dengan mengingat Allah hati menjadi tenang.', en: 'Indeed, in the remembrance of Allah hearts find rest.' },
];
const GREET_DOA = [
  { doa_arabic: 'اللَّهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا', id: 'Ya Allah, dengan rahmat-Mu kami memasuki pagi dan petang.', en: 'O Allah, by Your grace we enter the morning and the evening.' },
  { doa_arabic: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي', id: 'Ya Tuhanku, lapangkanlah dadaku dan mudahkanlah urusanku.', en: 'My Lord, expand my chest and ease my affair.' },
];
const GREET_AKSI = [
  { id: 'Tarik napas perlahan tiga kali, lalu sebut satu hal yang kamu syukuri.', en: 'Take three slow breaths, then name one thing you’re grateful for.' },
  { id: 'Tuliskan satu niat baik kecil untuk hari ini.', en: 'Write down one small good intention for today.' },
  { id: 'Kirim pesan baik ke satu orang yang kamu sayangi.', en: 'Send a kind message to someone you love.' },
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function greeting() {
  const tm = buildTemporal();
  const lng = getLang();
  const nama = state.profile.nama || tr('sahabat');
  const ayat = pick(GREET_AYAT);
  const doa = pick(GREET_DOA);
  const aksi = pick(GREET_AKSI);
  renderAI(
    {
      empati: tr('greet').replace('{name}', nama).replace('{time}', tr(SALAM_KEY[tm.waktu])),
      source_type: 'quran',
      arabic: ayat.arabic,
      translation: ayat[lng] || ayat.id,
      source: ayat.source,
      aksi: aksi[lng] || aksi.id,
      doa_arabic: doa.doa_arabic,
      doa_translation: doa[lng] || doa.id,
    },
    (reply) => send(reply),
    toast
  );
}

// ---------- Disclaimer keaslian konten (sekali per versi, bisa ditutup) ----------
// Naikkan versi bila teks disclaimer diperbarui agar tampil sekali lagi untuk semua.
const DISCLAIMER_VERSION = 2;
async function maybeShowDisclaimer() {
  if (Number(await Meta.get('disclaimerSeen', 0)) >= DISCLAIMER_VERSION) return;
  const bar = document.createElement('div');
  bar.className = 'disclaimer';
  bar.innerHTML =
    `<span>ℹ️ ${tr('disclaimer')}</span>` +
    `<button class="mini-btn js-ok">${tr('understood')}</button>`;
  bar.querySelector('.js-ok').addEventListener('click', async () => {
    bar.remove();
    await Meta.set('disclaimerSeen', DISCLAIMER_VERSION);
  });
  const chat = $('chat');
  chat.insertBefore(bar, chat.firstChild);
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
  applyI18n();
  initTheme($('themeBtn'));
  buildMoodSelector();
  initVoice($('voiceBtn'), $('input'), toast);
  initSettings((profile) => {
    state.profile = profile;
    setUserAvatar(avatarFor(profile.gender));
    toast(tr('saved_settings'));
  });
  await refreshContextBar();

  // muat profil tersimpan
  state.profile = (await Meta.get('profile', { nama: '', goal: '' })) || { nama: '', goal: '' };
  setUserAvatar(avatarFor(state.profile.gender));

  const restored = await restoreConversation();
  if (!restored) greeting();
  await maybeShowDisclaimer();

  window.addEventListener('offline', () => toast('Kamu sedang offline 📴'));
  window.addEventListener('online', () => toast('Kembali online ✅'));

  $('settingsBtn').addEventListener('click', () => openSettings());
  $('sendBtn').addEventListener('click', () => send());
  initComposerPlaceholder();
  $('input').addEventListener('input', autoGrow);
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  await initNotify();

  // Hapus splash dari DOM setelah animasi keluar selesai (~3.3s).
  setTimeout(() => document.getElementById('splash')?.remove(), 3400);

  // Service worker (PWA + notifikasi)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Cloud sync (jika login) — sinkron latar + indikator; muat ulang saat sign-in baru.
  initCloudSync(() => refreshContextBar());

  // Onboarding bila belum ada nama (setelah UI siap).
  await maybeOnboard();
}

init();

// Indikator pengguna online (Realtime Presence).
import('./presence.js').then((m) => m.initPresence(document.getElementById('presenceN')));

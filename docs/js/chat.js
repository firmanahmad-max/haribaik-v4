// chat.js — render bubble chat + kartu terstruktur (ayat/aksi/doa) + quick replies.

import { Favorites, Reports } from './db.js';
import { shareCard } from './share.js';
import { speak, stopSpeak, ttsSupported, arabicVoiceAvailable } from './tts.js';
import { badgeFor } from './config.js';
import { t, getLang } from './i18n.js';

const QUICK_REPLY_KEYS = ['qr_more', 'qr_doa', 'qr_how', 'qr_thanks'];

const chatEl = () => document.getElementById('chat');

function scrollDown() {
  const el = chatEl();
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// Jam:menit untuk timestamp pesan.
function fmtTime(ts = Date.now()) {
  try {
    return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  } catch {
    return '';
  }
}

// Label kartu dirotasi bergantian agar tidak membosankan (dwibahasa).
const ROT = {
  kutipan: {
    id: ['Kutipan', 'Untuk direnungkan', 'Penguat hati', 'Pesan untukmu', 'Renungan', 'Cahaya hari ini'],
    en: ['Quote', 'To reflect on', 'Strength for the heart', 'A message for you', 'A reflection', 'Today’s light'],
  },
  aksi: {
    id: ['🌱 Langkah kecil hari ini', '🌱 Coba lakukan ini', '🌱 Satu langkah untukmu', '🌱 Pelan-pelan, coba ini', '🌱 Yang bisa kamu coba hari ini', '🌱 Mulai dari sini'],
    en: ['🌱 A small step today', '🌱 Try this', '🌱 One step for you', '🌱 Slowly, try this', '🌱 Something to try today', '🌱 Start here'],
  },
  doa: {
    id: ['🤲 Doa', '🤲 Doa untukmu', '🤲 Doa hari ini', '🤲 Panjatkan ini', '🤲 Lirih doa', '🤲 Doa kecil'],
    en: ['🤲 Prayer', '🤲 A prayer for you', '🤲 Today’s prayer', '🤲 Offer this', '🤲 A quiet prayer', '🤲 A little prayer'],
  },
};
function makeRotator(name) {
  const labels = ROT[name][getLang()] || ROT[name].id;
  let idx = Math.floor(Math.random() * labels.length);
  return () => labels[idx++ % labels.length];
}
const nextKutipanLabel = makeRotator('kutipan');
const nextAksiLabel = makeRotator('aksi');
const nextDoaLabel = makeRotator('doa');

// Avatar pengguna — disesuaikan dengan jenis kelamin lewat setUserAvatar().
let userAvatar = '🧑';
export function setUserAvatar(emoji) {
  if (emoji) userAvatar = emoji;
}

export function renderUser(text, ts = Date.now()) {
  const wrap = document.createElement('div');
  wrap.className = 'msg user';
  wrap.innerHTML = `<div class="avatar">${userAvatar}</div><div class="col"><div class="bubble">${escapeHtml(text)}</div><time class="msg-time">${fmtTime(ts)}</time></div>`;
  chatEl().appendChild(wrap);
  scrollDown();
}

let typingEl = null;
export function showTyping() {
  typingEl = document.createElement('div');
  typingEl.className = 'msg ai';
  typingEl.innerHTML =
    '<div class="avatar">H</div><div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>';
  chatEl().appendChild(typingEl);
  scrollDown();
}
export function hideTyping() {
  typingEl?.remove();
  typingEl = null;
}

// ---- Builder kartu (dipakai ulang oleh mode struktural & percakapan) ----
function ayatCardHtml(r) {
  const { cls: badgeClass } = badgeFor(r.source_type);
  const badgeLabel = t('label_' + badgeClass);
  return `
      <div class="card ayat-card">
        <div class="label"><span>${nextKutipanLabel()}</span><span class="badge ${badgeClass}">${badgeLabel}</span></div>
        <div class="arabic">${escapeHtml(r.arabic)}</div>
        <div class="translation">"${escapeHtml(r.translation)}"</div>
        <div class="source">— ${escapeHtml(r.source)}</div>
        <div class="card-actions">
          <button class="mini-btn js-fav">🔖 ${t('btn_save')}</button>
          <button class="mini-btn js-copy">📋 ${t('btn_copy')}</button>
          <button class="mini-btn js-share">📤 ${t('btn_share')}</button>
          <button class="mini-btn js-tts">🔊 ${t('btn_listen')}</button>
          <button class="mini-btn js-report">🚩 ${t('btn_report')}</button>
        </div>
      </div>`;
}
function aksiCardHtml(r) {
  return `
      <div class="card aksi-card">
        <div class="label">${nextAksiLabel()}</div>
        <div class="body">${escapeHtml(r.aksi)}</div>
      </div>`;
}
function doaCardHtml(r) {
  return `
      <div class="card doa-card">
        <div class="label">${nextDoaLabel()}</div>
        ${r.doa_arabic ? `<div class="arabic">${escapeHtml(r.doa_arabic)}</div>` : ''}
        ${r.doa_translation ? `<div class="translation">${escapeHtml(r.doa_translation)}</div>` : ''}
      </div>`;
}

// Pasang aksi tombol kartu ayat (favorit/salin/bagikan/dengar/laporkan).
function wireAyatCard(wrap, r, toast) {
  const favBtn = wrap.querySelector('.js-fav');
  favBtn?.addEventListener('click', async () => {
    if (favBtn.classList.contains('active')) return;
    await Favorites.add({
      arabic: r.arabic,
      translation: r.translation,
      source: r.source,
      source_type: (r.source_type || '').toLowerCase(),
    });
    favBtn.classList.add('active', 'pop');
    favBtn.innerHTML = `✓ ${t('saved_done')}`;
    if (navigator.vibrate) navigator.vibrate(12);
    toast?.(t('saved_fav'));
  });

  wrap.querySelector('.js-copy')?.addEventListener('click', async () => {
    const txt = `${r.arabic}\n\n"${r.translation}"\n— ${r.source}\n\nvia HariBaik`;
    try { await navigator.clipboard.writeText(txt); toast?.(t('copied')); }
    catch { toast?.(t('copy_fail')); }
  });

  wrap.querySelector('.js-share')?.addEventListener('click', () => shareCard(r, toast));

  const ttsBtn = wrap.querySelector('.js-tts');
  if (ttsBtn && !ttsSupported()) {
    ttsBtn.style.display = 'none';
  } else if (ttsBtn) {
    ttsBtn.addEventListener('click', () => {
      if (ttsBtn.classList.contains('active')) {
        stopSpeak();
        ttsBtn.classList.remove('active');
        ttsBtn.innerHTML = `🔊 ${t('btn_listen')}`;
        return;
      }
      // Rangkai bagian yang tersedia saja (di mode percakapan, aksi/doa bisa kosong).
      const arVoice = arabicVoiceAvailable();
      const seq = [];
      if (arVoice && r.arabic) seq.push({ text: r.arabic, lang: 'ar-SA' });
      if (r.translation) seq.push({ text: r.translation, lang: 'id-ID' });
      if (r.aksi) seq.push({ text: r.aksi, lang: 'id-ID' });
      if (arVoice && r.doa_arabic) seq.push({ text: r.doa_arabic, lang: 'ar-SA' });
      if (r.doa_translation) seq.push({ text: r.doa_translation, lang: 'id-ID' });
      const ok = speak(seq, (speaking) => {
        ttsBtn.classList.toggle('active', speaking);
        ttsBtn.innerHTML = speaking ? '⏹ Stop' : `🔊 ${t('btn_listen')}`;
      });
      if (!ok) toast?.('Suara tidak didukung di perangkat ini');
    });
  }

  const reportBtn = wrap.querySelector('.js-report');
  reportBtn?.addEventListener('click', async () => {
    if (reportBtn.disabled) return;
    await Reports.add({ source: r.source, source_type: (r.source_type || '').toLowerCase(), translation: r.translation });
    reportBtn.classList.add('active');
    reportBtn.innerHTML = `✓ ${t('reported')}`;
    reportBtn.disabled = true;
    toast?.(t('report_thanks'));
  });
}

/**
 * Render respons AI. Dua mode:
 *  - struktural (giliran pertama / sapaan): empati + ayat + aksi + doa + quick replies.
 *  - percakapan (giliran lanjutan): balasan natural + (ayat/aksi/doa bila ada) +
 *    tawaran + chip untuk meminta ayat/saran/doa yang relevan.
 * @param {object} r respons backend
 * @param {(reply:string)=>void} onQuickReply
 * @param {(msg:string)=>void} toast
 */
export function renderAI(r, onQuickReply, toast, ts = Date.now()) {
  const conversational = r.mode === 'conversational';
  const hasAyat = !!(r.arabic && r.translation);
  const hasAksi = !!r.aksi;
  const hasDoa = !!(r.doa_arabic || r.doa_translation);
  const bubbleText = conversational ? (r.reply || r.empati || '') : r.empati;

  const wrap = document.createElement('div');
  wrap.className = 'msg ai';

  let inner = `<div class="avatar">H</div><div class="stack">`;
  if (bubbleText) inner += `<div class="bubble">${escapeHtml(bubbleText)}</div>`;
  if (hasAyat) inner += ayatCardHtml(r);
  if (hasAksi) inner += aksiCardHtml(r);
  if (hasDoa) inner += doaCardHtml(r);
  if (conversational && r.offer) inner += `<div class="offer">${escapeHtml(r.offer)}</div>`;
  inner += `<time class="msg-time">${fmtTime(ts)}</time><div class="quick-replies"></div></div>`;
  wrap.innerHTML = inner;

  if (hasAyat) wireAyatCard(wrap, r, toast);

  // Chip: mode percakapan menawarkan bagian yang BELUM muncul; mode struktural pakai quick-reply standar.
  const qr = wrap.querySelector('.quick-replies');
  let chipTexts;
  if (conversational) {
    chipTexts = [];
    if (!hasAyat) chipTexts.push(t('offer_ayat'));
    if (!hasAksi) chipTexts.push(t('offer_aksi'));
    if (!hasDoa) chipTexts.push(t('offer_doa'));
    chipTexts.push(t('qr_more'));
  } else {
    chipTexts = QUICK_REPLY_KEYS.map((k) => t(k));
  }
  chipTexts.forEach((text) => {
    const b = document.createElement('button');
    b.className = 'chip-btn';
    b.textContent = text;
    b.addEventListener('click', () => onQuickReply(text));
    qr.appendChild(b);
  });

  chatEl().appendChild(wrap);
  scrollDown();
}

// Kutipan TERKURASI (sahih) tentang keutamaan sedekah/infaq — dipakai kartu dukungan.
const SUPPORT_ITEMS = [
  {
    source_type: 'quran', source: 'Al-Baqarah:261',
    arabic: 'مَّثَلُ ٱلَّذِينَ يُنفِقُونَ أَمْوَٰلَهُمْ فِى سَبِيلِ ٱللَّهِ كَمَثَلِ حَبَّةٍ أَنۢبَتَتْ سَبْعَ سَنَابِلَ فِى كُلِّ سُنۢبُلَةٍ مِّا۟ئَةُ حَبَّةٍ',
    id: 'Perumpamaan orang yang menginfakkan hartanya di jalan Allah seperti sebutir biji yang menumbuhkan tujuh tangkai, pada tiap tangkai seratus biji. Allah melipatgandakan bagi siapa yang Dia kehendaki.',
    en: 'The example of those who spend their wealth in the way of Allah is like a seed that grows seven spikes; in each spike a hundred grains. And Allah multiplies for whom He wills.',
  },
  {
    source_type: 'quran', source: "Saba':39",
    arabic: 'وَمَآ أَنفَقْتُم مِّن شَىْءٍ فَهُوَ يُخْلِفُهُۥ ۖ وَهُوَ خَيْرُ ٱلرَّٰزِقِينَ',
    id: 'Dan apa saja yang kamu infakkan, Allah pasti menggantinya. Dialah sebaik-baik pemberi rezeki.',
    en: 'And whatever you spend, He will replace it; and He is the best of providers.',
  },
  {
    source_type: 'hadits', source: 'HR. Muslim:1631',
    arabic: 'إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلَّا مِنْ ثَلَاثَةٍ: صَدَقَةٍ جَارِيَةٍ، أَوْ عِلْمٍ يُنْتَفَعُ بِهِ، أَوْ وَلَدٍ صَالِحٍ يَدْعُو لَهُ',
    id: 'Apabila manusia meninggal, terputuslah amalnya kecuali tiga: sedekah jariyah, ilmu yang bermanfaat, atau anak saleh yang mendoakannya.',
    en: 'When a person dies, their deeds end except three: ongoing charity, beneficial knowledge, or a righteous child who prays for them.',
  },
  {
    source_type: 'hadits', source: 'HR. Muslim:2588',
    arabic: 'مَا نَقَصَتْ صَدَقَةٌ مِّنْ مَالٍ',
    id: 'Sedekah tidak akan mengurangi harta.',
    en: 'Charity does not decrease wealth.',
  },
];

/**
 * Kartu ajakan halus: keutamaan sedekah + tautan ke Tentang & cara berdonasi.
 * @param {()=>void} onAbout  buka halaman Tentang
 * @param {()=>void} onDonate buka bagian donasi
 */
export function renderSupportCard(onAbout, onDonate, ts = Date.now()) {
  const lng = getLang();
  const item = SUPPORT_ITEMS[Math.floor(Math.random() * SUPPORT_ITEMS.length)];
  const { cls: badgeClass } = badgeFor(item.source_type);
  const badgeLabel = t('label_' + badgeClass);

  const wrap = document.createElement('div');
  wrap.className = 'msg ai';
  wrap.innerHTML = `
    <div class="avatar">H</div>
    <div class="stack">
      <div class="bubble">${escapeHtml(t('sup_intro'))}</div>
      <div class="card support-card">
        <div class="label"><span>💝 ${t('sup_title')}</span><span class="badge ${badgeClass}">${badgeLabel}</span></div>
        <div class="arabic">${escapeHtml(item.arabic)}</div>
        <div class="translation">"${escapeHtml(item[lng] || item.id)}"</div>
        <div class="source">— ${escapeHtml(item.source)}</div>
        <p class="support-msg">${escapeHtml(t('sup_msg'))}</p>
        <div class="card-actions">
          <button class="mini-btn js-about">📖 ${t('sup_about')}</button>
          <button class="mini-btn js-donate">${t('sup_donate')}</button>
        </div>
      </div>
      <time class="msg-time">${fmtTime(ts)}</time>
    </div>`;
  wrap.querySelector('.js-about').addEventListener('click', onAbout);
  wrap.querySelector('.js-donate').addEventListener('click', onDonate);
  chatEl().appendChild(wrap);
  scrollDown();
}

export function renderError(msg, onRetry) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ai';
  wrap.innerHTML = `
    <div class="avatar">H</div>
    <div class="stack">
      <div class="bubble">⚠️ ${escapeHtml(msg)}</div>
      <div class="quick-replies"></div>
    </div>`;
  if (typeof onRetry === 'function') {
    const b = document.createElement('button');
    b.className = 'chip-btn';
    b.textContent = `🔄 ${t('retry')}`;
    b.addEventListener('click', () => {
      wrap.remove();
      onRetry();
    });
    wrap.querySelector('.quick-replies').appendChild(b);
  }
  chatEl().appendChild(wrap);
  scrollDown();
}

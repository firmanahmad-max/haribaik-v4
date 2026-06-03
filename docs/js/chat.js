// chat.js — render bubble chat + kartu terstruktur (ayat/aksi/doa) + quick replies.

import { Favorites } from './db.js';
import { shareCard } from './share.js';
import { QUICK_REPLIES } from './config.js';

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

// Label kartu dirotasi bergantian agar tidak membosankan.
// Tiap rotator mulai dari indeks acak supaya urutannya tidak selalu sama tiap sesi.
function makeRotator(labels) {
  let idx = Math.floor(Math.random() * labels.length);
  return () => labels[idx++ % labels.length];
}

const nextKutipanLabel = makeRotator([
  'Kutipan', 'Untuk direnungkan', 'Penguat hati', 'Pesan untukmu', 'Renungan', 'Cahaya hari ini',
]);
const nextAksiLabel = makeRotator([
  '🌱 Langkah kecil hari ini', '🌱 Coba lakukan ini', '🌱 Satu langkah untukmu',
  '🌱 Pelan-pelan, coba ini', '🌱 Yang bisa kamu coba hari ini', '🌱 Mulai dari sini',
]);
const nextDoaLabel = makeRotator([
  '🤲 Doa', '🤲 Doa untukmu', '🤲 Doa hari ini', '🤲 Panjatkan ini', '🤲 Lirih doa', '🤲 Doa kecil',
]);

export function renderUser(text, ts = Date.now()) {
  const wrap = document.createElement('div');
  wrap.className = 'msg user';
  wrap.innerHTML = `<div class="avatar">🧕</div><div class="col"><div class="bubble">${escapeHtml(text)}</div><time class="msg-time">${fmtTime(ts)}</time></div>`;
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

/**
 * Render respons AI terstruktur.
 * @param {object} r respons backend
 * @param {(reply:string)=>void} onQuickReply
 * @param {(msg:string)=>void} toast
 */
export function renderAI(r, onQuickReply, toast, ts = Date.now()) {
  const isQuran = (r.source_type || '').toLowerCase() === 'quran';
  const badgeClass = isQuran ? 'quran' : 'hadits';
  const badgeLabel = isQuran ? 'Al-Quran' : 'Hadits';

  const wrap = document.createElement('div');
  wrap.className = 'msg ai';
  wrap.innerHTML = `
    <div class="avatar">H</div>
    <div class="stack">
      <div class="bubble">${escapeHtml(r.empati)}</div>

      <div class="card ayat-card">
        <div class="label"><span>${nextKutipanLabel()}</span><span class="badge ${badgeClass}">${badgeLabel}</span></div>
        <div class="arabic">${escapeHtml(r.arabic)}</div>
        <div class="translation">"${escapeHtml(r.translation)}"</div>
        <div class="source">— ${escapeHtml(r.source)}</div>
        <div class="card-actions">
          <button class="mini-btn js-fav" title="Simpan ke favorit">🔖 Simpan</button>
          <button class="mini-btn js-copy" title="Salin teks">📋 Salin</button>
          <button class="mini-btn js-share" title="Bagikan">📤 Bagikan</button>
        </div>
      </div>

      <div class="card aksi-card">
        <div class="label">${nextAksiLabel()}</div>
        <div class="body">${escapeHtml(r.aksi)}</div>
      </div>

      <div class="card doa-card">
        <div class="label">${nextDoaLabel()}</div>
        <div class="arabic">${escapeHtml(r.doa_arabic)}</div>
        <div class="translation">${escapeHtml(r.doa_translation)}</div>
      </div>

      <time class="msg-time">${fmtTime(ts)}</time>
      <div class="quick-replies"></div>
    </div>`;

  // Quick replies
  const qr = wrap.querySelector('.quick-replies');
  QUICK_REPLIES.forEach((text) => {
    const b = document.createElement('button');
    b.className = 'chip-btn';
    b.textContent = text;
    b.addEventListener('click', () => onQuickReply(text));
    qr.appendChild(b);
  });

  // Favorit (+ animasi & haptic)
  const favBtn = wrap.querySelector('.js-fav');
  favBtn.addEventListener('click', async () => {
    if (favBtn.classList.contains('active')) return;
    await Favorites.add({
      arabic: r.arabic,
      translation: r.translation,
      source: r.source,
      source_type: (r.source_type || '').toLowerCase(),
    });
    favBtn.classList.add('active', 'pop');
    favBtn.innerHTML = '✓ Tersimpan';
    if (navigator.vibrate) navigator.vibrate(12);
    toast?.('Disimpan ke favorit');
  });

  // Salin
  wrap.querySelector('.js-copy').addEventListener('click', async () => {
    const txt = `${r.arabic}\n\n"${r.translation}"\n— ${r.source}\n\nvia HariBaik`;
    try {
      await navigator.clipboard.writeText(txt);
      toast?.('Teks disalin');
    } catch {
      toast?.('Gagal menyalin');
    }
  });

  // Share
  wrap.querySelector('.js-share').addEventListener('click', () => shareCard(r, toast));

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
    b.textContent = '🔄 Coba lagi';
    b.addEventListener('click', () => {
      wrap.remove();
      onRetry();
    });
    wrap.querySelector('.quick-replies').appendChild(b);
  }
  chatEl().appendChild(wrap);
  scrollDown();
}

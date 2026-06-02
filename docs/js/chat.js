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

export function renderUser(text) {
  const wrap = document.createElement('div');
  wrap.className = 'msg user';
  wrap.innerHTML = `<div class="avatar">🧕</div><div class="bubble">${escapeHtml(text)}</div>`;
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
export function renderAI(r, onQuickReply, toast) {
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
        <div class="label"><span>Kutipan</span><span class="badge ${badgeClass}">${badgeLabel}</span></div>
        <div class="arabic">${escapeHtml(r.arabic)}</div>
        <div class="translation">"${escapeHtml(r.translation)}"</div>
        <div class="source">— ${escapeHtml(r.source)}</div>
        <div class="card-actions">
          <button class="mini-btn js-fav" title="Simpan ke favorit">🔖 Simpan</button>
          <button class="mini-btn js-share" title="Bagikan">📤 Bagikan</button>
        </div>
      </div>

      <div class="card aksi-card">
        <div class="label">🌱 Langkah kecil hari ini</div>
        <div class="body">${escapeHtml(r.aksi)}</div>
      </div>

      <div class="card doa-card">
        <div class="label">🤲 Doa</div>
        <div class="arabic">${escapeHtml(r.doa_arabic)}</div>
        <div class="translation">${escapeHtml(r.doa_translation)}</div>
      </div>

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

  // Favorit
  const favBtn = wrap.querySelector('.js-fav');
  favBtn.addEventListener('click', async () => {
    await Favorites.add({
      arabic: r.arabic,
      translation: r.translation,
      source: r.source,
      source_type: (r.source_type || '').toLowerCase(),
    });
    favBtn.classList.add('active');
    favBtn.innerHTML = '✓ Tersimpan';
    toast?.('Disimpan ke favorit');
  });

  // Share
  wrap.querySelector('.js-share').addEventListener('click', () => shareCard(r, toast));

  chatEl().appendChild(wrap);
  scrollDown();
}

export function renderError(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ai';
  wrap.innerHTML = `<div class="avatar">H</div><div class="bubble">⚠️ ${escapeHtml(msg)}</div>`;
  chatEl().appendChild(wrap);
  scrollDown();
}

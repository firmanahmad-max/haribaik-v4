// favorites.js — halaman favorit: tampilkan, filter (Quran/Hadits), hapus, bagikan.

import { Favorites } from './db.js';
import { initTheme } from './theme.js';
import { shareCard } from './share.js';

const $ = (id) => document.getElementById(id);
let currentFilter = 'all';

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

async function render() {
  const grid = $('favGrid');
  let items = await Favorites.all();
  items = items.sort((a, b) => b.ts - a.ts);
  if (currentFilter !== 'all') items = items.filter((i) => i.source_type === currentFilter);

  if (!items.length) {
    grid.innerHTML = '<div class="empty-state">Belum ada favorit. Simpan kutipan dari halaman Chat dengan tombol 🔖.</div>';
    return;
  }

  grid.innerHTML = '';
  items.forEach((item) => {
    const isQuran = item.source_type === 'quran';
    const card = document.createElement('div');
    card.className = 'card ayat-card';
    card.innerHTML = `
      <div class="label"><span>Kutipan</span><span class="badge ${isQuran ? 'quran' : 'hadits'}">${isQuran ? 'Al-Quran' : 'Hadits'}</span></div>
      <div class="arabic">${escapeHtml(item.arabic)}</div>
      <div class="translation">"${escapeHtml(item.translation)}"</div>
      <div class="source">— ${escapeHtml(item.source)}</div>
      <div class="card-actions">
        <button class="mini-btn js-share">📤 Bagikan</button>
        <button class="mini-btn js-del">🗑️ Hapus</button>
      </div>`;
    card.querySelector('.js-share').addEventListener('click', () => shareCard(item, toast));
    card.querySelector('.js-del').addEventListener('click', async () => {
      await Favorites.remove(item.id);
      toast('Dihapus');
      render();
    });
    grid.appendChild(card);
  });
}

function initFilters() {
  document.querySelectorAll('.fav-filters .chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fav-filters .chip-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentFilter = btn.dataset.filter;
      render();
    });
  });
}

initTheme($('themeBtn'));
initFilters();
render();

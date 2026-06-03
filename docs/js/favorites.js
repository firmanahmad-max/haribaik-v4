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
  const total = items.length;
  items = items.sort((a, b) => b.ts - a.ts);
  if (currentFilter !== 'all') items = items.filter((i) => i.source_type === currentFilter);

  const tagline = $('favTagline');
  if (tagline) tagline.textContent = total ? `${total} kutipan tersimpan` : 'Kutipan yang kamu simpan';

  if (!items.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">🔖</div>
        <h3>${total ? 'Tidak ada di filter ini' : 'Belum ada favorit'}</h3>
        <p>${total ? 'Coba pilih filter lain di atas.' : 'Simpan kutipan yang menyentuh hatimu dari halaman Chat dengan tombol 🔖 Simpan.'}</p>
        <a class="chip-btn" href="index.html">← Ke halaman Chat</a>
      </div>`;
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

function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function initToolbar() {
  $('favExport').addEventListener('click', async () => {
    const items = await Favorites.all();
    if (!items.length) return toast('Belum ada favorit untuk diekspor');
    const clean = items.map(({ arabic, translation, source, source_type, ts }) => ({ arabic, translation, source, source_type, ts }));
    download('haribaik-favorit.json', JSON.stringify(clean, null, 2));
    toast(`${clean.length} favorit diekspor`);
  });

  const file = $('favFile');
  $('favImport').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const arr = JSON.parse(await f.text());
      if (!Array.isArray(arr)) throw new Error('format');
      const existing = await Favorites.all();
      const seen = new Set(existing.map((e) => `${e.source}|${e.translation}`));
      let added = 0;
      for (const it of arr) {
        const key = `${it?.source || ''}|${it?.translation || ''}`;
        if (it && it.arabic && it.translation && it.source && !seen.has(key)) {
          await Favorites.add({
            arabic: it.arabic,
            translation: it.translation,
            source: it.source,
            source_type: (it.source_type || '').toLowerCase(),
          });
          seen.add(key);
          added++;
        }
      }
      toast(added ? `${added} favorit diimpor` : 'Tidak ada favorit baru untuk diimpor');
      render();
    } catch {
      toast('File tidak valid');
    } finally {
      file.value = '';
    }
  });
}

initTheme($('themeBtn'));
initFilters();
initToolbar();
render();

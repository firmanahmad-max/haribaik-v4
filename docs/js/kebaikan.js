// kebaikan.js — bagian "Kebaikan Bersama" dari hub Komunitas.
// Penghitung amal kolektif SEPEKAN (dzikir, doa, syukur, sedekah) — memotivasi
// tanpa memeringkat individu (menghindari riya'). Update langsung via realtime.
// Doa & syukur bertambah otomatis dari postingan; dzikir & sedekah via tombol niat.

import { t, locale } from './i18n.js';
import { getKebaikan, bumpKebaikan, subscribeKebaikan } from './cloud.js';
import { Meta } from './db.js';
import { toast } from './social-util.js';

const KINDS = [
  { key: 'dzikir', emoji: '📿' },
  { key: 'doa', emoji: '🤲' },
  { key: 'syukur', emoji: '🌾' },
  { key: 'sedekah', emoji: '💝' },
];

let unsub = null;
let counts = {};

function today() { return new Date().toISOString().slice(0, 10); }
async function markedToday() {
  const m = await Meta.get('kebaikanMark', {});
  return (m && m.day === today()) ? new Set(m.kinds || []) : new Set();
}
async function setMarked(kind) {
  const m = await Meta.get('kebaikanMark', {});
  const kinds = (m && m.day === today()) ? (m.kinds || []) : [];
  if (!kinds.includes(kind)) kinds.push(kind);
  await Meta.set('kebaikanMark', { day: today(), kinds });
}

function fmtNum(n) {
  try { return new Intl.NumberFormat(locale()).format(n || 0); } catch { return String(n || 0); }
}

function total() { return KINDS.reduce((s, k) => s + (counts[k.key] || 0), 0); }

function paint(root) {
  const done = root._done || new Set();
  const tiles = KINDS.map((k) => `
    <div class="keb-tile">
      <span class="keb-emoji">${k.emoji}</span>
      <b class="keb-n" data-k="${k.key}">${fmtNum(counts[k.key])}</b>
      <span class="keb-label">${t('keb_' + k.key)}</span>
    </div>`).join('');
  root.innerHTML = `
    <section class="card jcard keb-hero">
      <div class="keb-total-wrap">
        <div class="keb-total" id="kebTotal">${fmtNum(total())}</div>
        <div class="keb-total-label">${t('keb_total')}</div>
      </div>
      <p class="keb-verse">“…وَتَعَاوَنُوا عَلَى الْبِرِّ وَالتَّقْوَىٰ…”<br><span>${t('keb_verse')}</span></p>
    </section>
    <section class="card jcard">
      <h2 class="jtitle keb-week">${t('keb_week')}</h2>
      <div class="keb-grid">${tiles}</div>
    </section>
    <section class="card jcard">
      <p class="keb-cta-hint">${t('keb_cta_hint')}</p>
      <div class="keb-actions">
        <button class="mini-btn js-keb" data-k="dzikir"${done.has('dzikir') ? ' disabled' : ''}>📿 ${t(done.has('dzikir') ? 'keb_done_dzikir' : 'keb_do_dzikir')}</button>
        <button class="mini-btn js-keb" data-k="sedekah"${done.has('sedekah') ? ' disabled' : ''}>💝 ${t(done.has('sedekah') ? 'keb_done_sedekah' : 'keb_do_sedekah')}</button>
      </div>
    </section>`;
  root.querySelectorAll('.js-keb').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const kind = btn.dataset.k;
      btn.disabled = true;
      try {
        const n = await bumpKebaikan(kind);
        if (typeof n === 'number') { counts[kind] = n; updateNumbers(root); }
        else { counts[kind] = (counts[kind] || 0) + 1; updateNumbers(root); }
        await setMarked(kind);
        root._done = await markedToday();
        btn.textContent = kind === 'dzikir' ? `📿 ${t('keb_done_dzikir')}` : `💝 ${t('keb_done_sedekah')}`;
        toast(t('keb_thanks'));
        if (navigator.vibrate) navigator.vibrate(10);
      } catch (e) {
        btn.disabled = false;
        toast(/rate_limit/i.test(e.message) ? t('doa_rate') : t('cloud_err'));
      }
    });
  });
}

function updateNumbers(root) {
  root.querySelectorAll('.keb-n').forEach((el) => { el.textContent = fmtNum(counts[el.dataset.k]); });
  const tot = root.querySelector('#kebTotal');
  if (tot) tot.textContent = fmtNum(total());
}

export async function mountKebaikan(root, _user) {
  root._done = await markedToday();
  paint(root); // render kerangka dulu (angka 0/cache) agar tampil instan
  try { counts = await getKebaikan(); updateNumbers(root); }
  catch { /* biarkan angka default; jaringan mungkin belum siap */ }
  if (unsub) unsub();
  unsub = await subscribeKebaikan(async () => {
    try { counts = await getKebaikan(); updateNumbers(root); } catch { /* abaikan */ }
  });
  return () => { if (unsub) { unsub(); unsub = null; } };
}

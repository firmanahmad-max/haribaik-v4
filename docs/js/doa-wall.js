// doa-wall.js — bagian "Dinding Doa" dari hub Komunitas.
// Kirim permohonan doa, aamiin, BALAS dengan dukungan, laporan, realtime.
// Diekspor sebagai mountDoa(root, me) → mengembalikan fungsi cleanup (unsub).

import { t } from './i18n.js';
import {
  listDoa, myAamiins, postDoa, aamiin, deleteDoa, reportDoa, subscribeDoa,
  listReplies, postReply, deleteReply, reportReply,
} from './cloud.js';
import { escapeHtml, fmtTime, skeletonHtml, toast, localSet, feedCache, hasProfanity } from './social-util.js';

let me = null;
let aaminSet = new Set();
let localAamin = null;
const cache = feedCache('doaFeedCache');
let unsub = null;

function doaCard(d) {
  const mine = me && d.user_id === me.id;
  const done = aaminSet.has(d.id);
  return `<section class="card jcard doa-item" data-id="${escapeHtml(d.id)}">
    <p class="doa-content">${escapeHtml(d.content)}</p>
    <div class="doa-meta"><span>🤲 ${escapeHtml(d.display_name || t('anon'))}</span><span>${fmtTime(d.created_at)}</span></div>
    <div class="card-actions">
      <button class="mini-btn js-aamiin${done ? ' active' : ''}"${done ? ' disabled' : ''}>🤍 ${t('doa_aamiin')} · <b class="aamiin-n">${d.aamiin_count || 0}</b></button>
      <button class="mini-btn js-reply-toggle" aria-expanded="false">💬 ${t('reply')}</button>
      ${mine
        ? `<button class="mini-btn danger js-del">${t('del')}</button>`
        : `<button class="mini-btn js-report" title="${t('doa_report')}" aria-label="${t('doa_report')}">⚑</button>`}
    </div>
    <div class="doa-replies" hidden></div>
  </section>`;
}

function replyItem(r) {
  const mine = me && r.user_id === me.id;
  return `<div class="reply-item" data-rid="${escapeHtml(r.id)}">
    <p class="reply-content">${escapeHtml(r.content)}</p>
    <div class="reply-meta"><span>${escapeHtml(r.display_name || t('anon'))} · ${fmtTime(r.created_at)}</span>
      ${mine
        ? `<button class="reply-x js-rdel" title="${t('del')}" aria-label="${t('del')}">✕</button>`
        : `<button class="reply-x js-rreport" title="${t('doa_report')}" aria-label="${t('doa_report')}">⚑</button>`}
    </div>
  </div>`;
}

// Segarkan label hitungan pada tombol "💬 Balas · N" sesuai jumlah item saat ini.
function refreshReplyCount(box) {
  const card = box.closest('.doa-item');
  const list = box.querySelector('.reply-list');
  const cnt = list ? list.querySelectorAll('.reply-item').length : 0;
  const toggle = card?.querySelector('.js-reply-toggle');
  if (toggle) toggle.innerHTML = `💬 ${t('reply')}${cnt ? ' · ' + cnt : ''}`;
  if (list && !cnt && !list.querySelector('.reply-empty')) list.innerHTML = `<p class="reply-empty">${t('reply_empty')}</p>`;
}

function wireReply(box, node) {
  const id = node.dataset.rid;
  node.querySelector('.js-rdel')?.addEventListener('click', async () => {
    try { await deleteReply(id); node.remove(); refreshReplyCount(box); } catch { toast(t('cloud_err')); }
  });
  node.querySelector('.js-rreport')?.addEventListener('click', async () => {
    if (!confirm(t('reply_report_confirm'))) return;
    try { await reportReply(id); node.remove(); refreshReplyCount(box); toast(t('doa_reported')); } catch { toast(t('cloud_err')); }
  });
}

async function openReplies(card) {
  const box = card.querySelector('.doa-replies');
  const toggle = card.querySelector('.js-reply-toggle');
  const isOpen = !box.hidden;
  if (isOpen) { box.hidden = true; toggle.setAttribute('aria-expanded', 'false'); return; }
  box.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  if (box.dataset.loaded) return;
  box.dataset.loaded = '1';
  box.innerHTML = `<div class="reply-list"></div>
    <div class="reply-compose">
      <input class="ch-input js-rinput" maxlength="200" placeholder="${t('reply_ph')}" />
      <button class="mini-btn js-rsend">${t('reply_send')}</button>
    </div>`;
  const list = box.querySelector('.reply-list');
  const input = box.querySelector('.js-rinput');
  const send = box.querySelector('.js-rsend');
  try {
    const rows = await listReplies(card.dataset.id);
    for (const r of rows) { const w = document.createElement('div'); w.innerHTML = replyItem(r); const n = w.firstElementChild; list.appendChild(n); wireReply(box, n); }
    if (!rows.length) list.innerHTML = `<p class="reply-empty">${t('reply_empty')}</p>`;
    toggle.innerHTML = `💬 ${t('reply')}${rows.length ? ' · ' + rows.length : ''}`;
  } catch { list.innerHTML = `<p class="reply-empty">${t('cloud_err')}</p>`; }

  const doSend = async () => {
    const text = input.value.trim();
    if (!text) return;
    if (hasProfanity(text)) return toast(t('doa_profanity'));
    send.disabled = true;
    try {
      const row = await postReply(card.dataset.id, text);
      list.querySelector('.reply-empty')?.remove(); // buang hint kosong bila ada
      const w = document.createElement('div'); w.innerHTML = replyItem(row); const n = w.firstElementChild;
      list.appendChild(n); wireReply(box, n);
      input.value = '';
      const cnt = list.querySelectorAll('.reply-item').length;
      toggle.innerHTML = `💬 ${t('reply')} · ${cnt}`;
    } catch (e) {
      toast(/rate_limit/i.test(e.message) ? t('doa_rate') : t('cloud_err'));
    } finally { send.disabled = false; }
  };
  send.addEventListener('click', doSend);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });
}

function wireCard(card) {
  const id = card.dataset.id;
  card.querySelector('.js-aamiin')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const n = await aamiin(id);
      card.querySelector('.aamiin-n').textContent = n;
      btn.classList.add('active');
      aaminSet.add(id);
      localAamin.add(id);
      if (navigator.vibrate) navigator.vibrate(8);
    } catch { btn.disabled = false; toast(t('cloud_err')); }
  });
  card.querySelector('.js-reply-toggle')?.addEventListener('click', () => openReplies(card));
  card.querySelector('.js-del')?.addEventListener('click', async () => {
    try { await deleteDoa(id); card.remove(); toast(t('doa_deleted')); } catch { toast(t('cloud_err')); }
  });
  card.querySelector('.js-report')?.addEventListener('click', async (e) => {
    if (!confirm(t('doa_report_confirm'))) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try { await reportDoa(id); card.remove(); toast(t('doa_reported')); }
    catch { btn.disabled = false; toast(t('cloud_err')); }
  });
}

function prependDoa(row) {
  const feed = document.getElementById('doaFeed');
  if (!feed || feed.querySelector(`[data-id="${row.id}"]`)) return;
  const empty = feed.querySelector('.jempty');
  if (empty) feed.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.innerHTML = doaCard(row);
  const node = wrap.firstElementChild;
  node.classList.add('ib-enter'); // animasi masuk halus (realtime & kiriman sendiri)
  feed.prepend(node);
  wireCard(node);
}

async function loadFeed() {
  const feed = document.getElementById('doaFeed');
  aaminSet = localAamin.get();
  const cached = cache.get();
  if (cached.length) {
    feed.innerHTML = cached.map(doaCard).join('');
    feed.querySelectorAll('.doa-item').forEach(wireCard);
  } else {
    feed.innerHTML = skeletonHtml();
  }
  try {
    const [items, mine] = await Promise.all([listDoa(50), myAamiins()]);
    aaminSet = new Set([...mine, ...localAamin.get()]);
    cache.set(items);
    if (!items.length) { feed.innerHTML = `<section class="card jcard"><p class="jempty">${t('doa_empty')}</p></section>`; return; }
    feed.innerHTML = items.map(doaCard).join('');
    feed.querySelectorAll('.doa-item').forEach(wireCard);
  } catch (e) {
    if (!cached.length) feed.innerHTML = `<section class="card jcard"><p class="jempty">${escapeHtml(e.message)}</p></section>`;
  }
}

async function sendDoa() {
  const text = document.getElementById('doaText').value.trim();
  if (!text) return toast(t('doa_min'));
  if (hasProfanity(text)) return toast(t('doa_profanity'));
  const name = document.getElementById('doaName').value.trim();
  const btn = document.getElementById('doaSend');
  btn.disabled = true;
  try {
    const row = await postDoa(text, name);
    document.getElementById('doaText').value = '';
    toast(t('doa_sent'));
    prependDoa(row);
  } catch (e) {
    toast(/rate_limit/i.test(e.message) ? t('doa_rate') : `${t('cloud_err')}: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

export async function mountDoa(root, user) {
  me = user;
  localAamin = localSet('doaAamiin', me && me.id);
  root.innerHTML = `
    <section class="card jcard">
      <textarea id="doaText" rows="3" maxlength="300" placeholder="${t('doa_ph')}"></textarea>
      <input id="doaName" class="ch-input" maxlength="40" placeholder="${t('doa_name_ph')}" style="margin:8px 0" />
      <button class="primary-btn" id="doaSend">${t('doa_send')}</button>
    </section>
    <div id="doaFeed"></div>`;
  document.getElementById('doaSend').addEventListener('click', sendDoa);
  await loadFeed();
  if (unsub) unsub();
  unsub = await subscribeDoa(
    (row) => { if (!row.hidden) prependDoa(row); },
    (row) => {
      const feed = document.getElementById('doaFeed');
      const card = feed?.querySelector(`[data-id="${row.id}"]`);
      if (!card) return;
      if (row.hidden) { card.remove(); return; }
      const n = card.querySelector('.aamiin-n');
      if (n) n.textContent = row.aamiin_count || 0;
    }
  );
  return () => { if (unsub) { unsub(); unsub = null; } };
}

// syukur.js — bagian "Papan Syukur" dari hub Komunitas.
// Berbagi rasa syukur singkat; orang lain memberi 🤲 (peluk syukur). Realtime.
// Diekspor sebagai mountSyukur(root, me) → mengembalikan fungsi cleanup (unsub).

import { t } from './i18n.js';
import { listSyukur, myHugs, postSyukur, hugSyukur, deleteSyukur, reportSyukur, subscribeSyukur } from './cloud.js';
import { escapeHtml, fmtTime, skeletonHtml, toast, localSet, feedCache, hasProfanity } from './social-util.js';

let me = null;
let hugSet = new Set();
let localHug = null;
const cache = feedCache('syukurFeedCache');
let unsub = null;

function card(d) {
  const mine = me && d.user_id === me.id;
  const done = hugSet.has(d.id);
  return `<section class="card jcard doa-item syukur-item" data-id="${escapeHtml(d.id)}">
    <p class="doa-content">🌾 ${escapeHtml(d.content)}</p>
    <div class="doa-meta"><span>${escapeHtml(d.display_name || t('anon'))}</span><span>${fmtTime(d.created_at)}</span></div>
    <div class="card-actions">
      <button class="mini-btn js-hug${done ? ' active' : ''}"${done ? ' disabled' : ''}>🤲 ${t('syukur_hug')} · <b class="hug-n">${d.hug_count || 0}</b></button>
      ${mine
        ? `<button class="mini-btn danger js-del">${t('del')}</button>`
        : `<button class="mini-btn js-report" title="${t('doa_report')}" aria-label="${t('doa_report')}">⚑</button>`}
    </div>
  </section>`;
}

function wire(node) {
  const id = node.dataset.id;
  node.querySelector('.js-hug')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const n = await hugSyukur(id);
      node.querySelector('.hug-n').textContent = n;
      btn.classList.add('active');
      hugSet.add(id);
      localHug.add(id);
      if (navigator.vibrate) navigator.vibrate(8);
    } catch { btn.disabled = false; toast(t('cloud_err')); }
  });
  node.querySelector('.js-del')?.addEventListener('click', async () => {
    try { await deleteSyukur(id); node.remove(); toast(t('syukur_deleted')); } catch { toast(t('cloud_err')); }
  });
  node.querySelector('.js-report')?.addEventListener('click', async (e) => {
    if (!confirm(t('doa_report_confirm'))) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try { await reportSyukur(id); node.remove(); toast(t('doa_reported')); }
    catch { btn.disabled = false; toast(t('cloud_err')); }
  });
}

function prepend(row) {
  const feed = document.getElementById('syukurFeed');
  if (!feed || feed.querySelector(`[data-id="${row.id}"]`)) return;
  const empty = feed.querySelector('.jempty');
  if (empty) feed.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.innerHTML = card(row);
  const node = wrap.firstElementChild;
  feed.prepend(node);
  wire(node);
}

async function loadFeed() {
  const feed = document.getElementById('syukurFeed');
  hugSet = localHug.get();
  const cached = cache.get();
  if (cached.length) {
    feed.innerHTML = cached.map(card).join('');
    feed.querySelectorAll('.doa-item').forEach(wire);
  } else {
    feed.innerHTML = skeletonHtml();
  }
  try {
    const [items, mine] = await Promise.all([listSyukur(50), myHugs()]);
    hugSet = new Set([...mine, ...localHug.get()]);
    cache.set(items);
    if (!items.length) { feed.innerHTML = `<section class="card jcard"><p class="jempty">${t('syukur_empty')}</p></section>`; return; }
    feed.innerHTML = items.map(card).join('');
    feed.querySelectorAll('.doa-item').forEach(wire);
  } catch (e) {
    if (!cached.length) feed.innerHTML = `<section class="card jcard"><p class="jempty">${escapeHtml(e.message)}</p></section>`;
  }
}

async function send() {
  const ta = document.getElementById('syukurText');
  const text = ta.value.trim();
  if (!text) return toast(t('syukur_min'));
  if (hasProfanity(text)) return toast(t('doa_profanity'));
  const name = document.getElementById('syukurName').value.trim();
  const btn = document.getElementById('syukurSend');
  btn.disabled = true;
  try {
    const row = await postSyukur(text, name);
    ta.value = '';
    toast(t('syukur_sent'));
    prepend(row);
  } catch (e) {
    toast(/rate_limit/i.test(e.message) ? t('doa_rate') : `${t('cloud_err')}: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

export async function mountSyukur(root, user) {
  me = user;
  localHug = localSet('syukurHug', me && me.id);
  root.innerHTML = `
    <section class="card jcard">
      <textarea id="syukurText" rows="3" maxlength="300" placeholder="${t('syukur_ph')}"></textarea>
      <input id="syukurName" class="ch-input" maxlength="40" placeholder="${t('doa_name_ph')}" style="margin:8px 0" />
      <button class="primary-btn" id="syukurSend">${t('syukur_send')}</button>
    </section>
    <div id="syukurFeed"></div>`;
  document.getElementById('syukurSend').addEventListener('click', send);
  await loadFeed();
  if (unsub) unsub();
  unsub = await subscribeSyukur(
    (row) => { if (!row.hidden) prepend(row); },
    (row) => {
      const feed = document.getElementById('syukurFeed');
      const node = feed?.querySelector(`[data-id="${row.id}"]`);
      if (!node) return;
      if (row.hidden) { node.remove(); return; }
      const n = node.querySelector('.hug-n');
      if (n) n.textContent = row.hug_count || 0;
    }
  );
  return () => { if (unsub) { unsub(); unsub = null; } };
}

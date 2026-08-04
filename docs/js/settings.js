// settings.js — bottom-sheet pengaturan + onboarding pertama kali.
// Menggantikan window.prompt untuk waktu pengingat, dan menampung nama/goal pengguna.

import { Meta, Messages, Favorites, Journal, Deeds, resetAll } from './db.js';
import { trapFocus } from './a11y.js';
import { t, getLang, setLang } from './i18n.js';
import { cloudEnabled, getUser, signInEmail, signInAnon, signOut, syncNow, linkEmail } from './cloud.js';
import { canInstall, promptInstall } from './install.js';
import { pushSupported, pushConfigured, enablePush, disablePush, sendTestPush, isPushSubscribed, syncPushPrefs } from './push.js';
import { getMemory, removeMemory, clearMemory } from './memory.js';

let onSaveCb = null;

/** @param {(profile:{nama:string,goal:string})=>void} onSave */
export function initSettings(onSave) {
  onSaveCb = onSave;
}

function escAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export async function openSettings({ welcome = false } = {}) {
  const profile = (await Meta.get('profile', {})) || {};
  const gender = profile.gender || '';
  const sel = (v) => (gender === v ? ' selected' : '');
  const reminderTime = (await Meta.get('reminderTime', '05:30')) || '05:30';
  const reminderEnabled = !!(await Meta.get('reminderEnabled', false));

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${t('set_title')}">
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">${welcome ? t('welcome_title') : t('set_title')}</h2>
      ${welcome ? `<p class="sheet-sub">${t('welcome_sub')}</p>` : ''}

      ${cloudEnabled() ? `
      <div class="cloud-box">
        <b>${t('cloud_account')}</b>
        <div class="cloud-status" id="cloudStatus">${t('cloud_checking')}</div>
        <div id="cloudOut" hidden>
          <input id="cloudEmail" class="ch-input" type="email" placeholder="${t('cloud_email_ph')}" style="margin:8px 0" />
          <div class="fav-toolbar"><button class="mini-btn" id="cloudSignin" type="button">${t('cloud_signin')}</button><button class="mini-btn" id="cloudAnon" type="button">${t('cloud_anon')}</button></div>
        </div>
        <div id="cloudIn" hidden>
          <div id="cloudUpgrade" hidden>
            <small class="field-hint">${t('cloud_upgrade_hint')}</small>
            <input id="cloudUpEmail" class="ch-input" type="email" placeholder="${t('cloud_email_ph')}" style="margin:8px 0" />
            <button class="mini-btn" id="cloudUpBtn" type="button">${t('cloud_upgrade_btn')}</button>
          </div>
          <div class="fav-toolbar"><button class="mini-btn" id="cloudSync" type="button">${t('cloud_sync')}</button><button class="mini-btn danger" id="cloudSignout" type="button">${t('cloud_signout')}</button></div>
        </div>
      </div>` : ''}

      <label class="field"><span>${t('f_name')}</span>
        <input id="setNama" type="text" maxlength="30" placeholder="${t('ph_name')}" value="${escAttr(profile.nama)}" />
      </label>

      <label class="field"><span>${t('f_goal')} <em>${t('f_optional')}</em></span>
        <input id="setGoal" type="text" maxlength="80" placeholder="${t('ph_goal')}" value="${escAttr(profile.goal)}" />
      </label>

      <label class="field"><span>${t('f_age')} <em>${t('f_optional')}</em></span>
        <input id="setUsia" type="number" min="5" max="120" inputmode="numeric" placeholder="${t('ph_age')}" value="${escAttr(profile.usia)}" />
      </label>

      <label class="field"><span>${t('f_gender')}</span>
        <select id="setGender">
          <option value=""${sel('')}>${t('gender_pick')}</option>
          <option value="Perempuan"${sel('Perempuan')}>${t('gender_f')}</option>
          <option value="Laki-laki"${sel('Laki-laki')}>${t('gender_m')}</option>
        </select>
      </label>

      <label class="field"><span>${t('f_language')}</span>
        <select id="setLang">
          <option value="id"${getLang() === 'id' ? ' selected' : ''}>Bahasa Indonesia</option>
          <option value="en"${getLang() === 'en' ? ' selected' : ''}>English</option>
        </select>
      </label>

      <label class="field"><span>${t('f_role')} <em>${t('f_optional')}</em></span>
        <input id="setPeran" type="text" maxlength="40" list="peranList" placeholder="${t('ph_role')}" value="${escAttr(profile.peran)}" />
        <datalist id="peranList">
          <option value="Pelajar / Mahasiswa"></option>
          <option value="Karyawan"></option>
          <option value="Wiraswasta"></option>
          <option value="Ibu rumah tangga"></option>
          <option value="Guru"></option>
          <option value="PNS / ASN"></option>
          <option value="Tenaga kesehatan"></option>
        </datalist>
      </label>

      <div class="field">
        <label class="row-between" for="setReminderOn"><span>${t('f_reminder')}</span>
          <input id="setReminderOn" type="checkbox" ${reminderEnabled ? 'checked' : ''} />
        </label>
        <input id="setReminderTime" type="time" value="${reminderTime}" />
        <small class="field-hint">${t('reminder_hint')}</small>
      </div>

      ${pushSupported() && pushConfigured() ? `
      <div class="field" id="pushField">
        <div class="row-between"><span>${t('f_push')}</span><span class="cloud-status" id="pushStatus">…</span></div>
        <div class="fav-toolbar">
          <button class="mini-btn" id="pushTest" type="button">${t('push_test')}</button>
          <button class="mini-btn danger" id="pushOff" type="button" hidden>${t('push_off')}</button>
        </div>
        <small class="field-hint">${t('push_hint')}</small>
      </div>` : ''}

      <div class="mem-box">
        <div class="row-between"><b>${t('mem_title')}</b><button class="mini-btn danger" id="memClear" type="button" hidden>${t('mem_clear')}</button></div>
        <small class="field-hint">${t('mem_hint')}</small>
        <div id="memList" class="mem-list"></div>
      </div>

      <button class="primary-btn" id="setInstall" type="button" ${canInstall() ? '' : 'hidden'} style="width:100%;margin-bottom:10px">${t('inst_btn')}</button>

      <a class="ghost-btn" id="setAbout" href="tentang.html" style="display:block;text-align:center;text-decoration:none;margin-bottom:10px">${t('about_link')}</a>

      <button class="ghost-btn" id="setNewChat" type="button">${t('new_chat')}</button>

      <div class="fav-toolbar">
        <button class="mini-btn" id="setBackup" type="button">${t('backup')}</button>
        <button class="mini-btn" id="setRestore" type="button">${t('restore')}</button>
        <input type="file" id="setBackupFile" accept="application/json" hidden />
      </div>

      <div class="sheet-actions">
        <button class="mini-btn danger" id="setReset">${t('reset')}</button>
        <span class="spacer"></span>
        ${welcome ? '' : `<button class="chip-btn" id="setClose">${t('close')}</button>`}
        <button class="primary-btn" id="setSave">${t('save')}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  overlay.querySelector('#setNama')?.focus();

  const close = () => {
    overlay.dispatchEvent(new Event('hb:closed'));
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 250);
  };

  // Klik di luar sheet menutup (kecuali mode welcome agar pengguna mengisi dulu).
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !welcome) close();
  });
  overlay.querySelector('#setClose')?.addEventListener('click', close);

  // Aksesibilitas: Escape menutup (kecuali onboarding), Tab terkurung di dalam sheet.
  trapFocus(overlay, overlay.querySelector('.sheet'), { onEscape: welcome ? undefined : close });

  // ---- Akun & Sinkron Cloud ----
  if (cloudEnabled()) {
    const renderCloud = async () => {
      const u = await getUser();
      const anon = !!(u && u.is_anonymous);
      overlay.querySelector('#cloudOut').hidden = !!u;
      overlay.querySelector('#cloudIn').hidden = !u;
      overlay.querySelector('#cloudUpgrade').hidden = !anon;
      overlay.querySelector('#cloudStatus').textContent = u
        ? (u.email ? t('cloud_in_as').replace('{x}', u.email) : t('cloud_in_anon'))
        : t('cloud_signedout');
    };
    renderCloud();
    overlay.querySelector('#cloudSignin')?.addEventListener('click', async () => {
      const email = overlay.querySelector('#cloudEmail').value.trim();
      if (!email) return;
      try { const { error } = await signInEmail(email); if (error) throw error; alert(t('cloud_link_sent')); }
      catch (e) { alert(`${t('cloud_err')}: ${e.message}`); }
    });
    // Upgrade akun anonim → email (data tetap tersimpan, akun jadi permanen).
    overlay.querySelector('#cloudUpBtn')?.addEventListener('click', async () => {
      const email = overlay.querySelector('#cloudUpEmail').value.trim();
      if (!email) return;
      try { const { error } = await linkEmail(email); if (error) throw error; alert(t('cloud_link_upgrade')); }
      catch (e) { alert(`${t('cloud_err')}: ${e.message}`); }
    });
    overlay.querySelector('#cloudAnon')?.addEventListener('click', async () => {
      try {
        const { error } = await signInAnon();
        if (error) throw error;
        const u = await getUser();
        if (u) await syncNow(u);
        await renderCloud();
        location.reload();
      } catch { alert(t('cloud_anon_off')); }
    });
    overlay.querySelector('#cloudSync')?.addEventListener('click', async (e) => {
      const u = await getUser();
      if (!u) return;
      const btn = e.target; btn.disabled = true; const prev = btn.textContent; btn.textContent = '⏳…';
      try { await syncNow(u); alert(t('cloud_synced')); location.reload(); }
      catch (err) { alert(`${t('cloud_err')}: ${err.message}`); }
      finally { btn.disabled = false; btn.textContent = prev; }
    });
    overlay.querySelector('#cloudSignout')?.addEventListener('click', async () => { await signOut(); await renderCloud(); });
  }

  // ---- Notifikasi latar (Web Push) ----
  if (pushSupported() && pushConfigured()) {
    const statusEl = overlay.querySelector('#pushStatus');
    const offBtn = overlay.querySelector('#pushOff');
    const renderPush = async () => {
      const on = await isPushSubscribed();
      if (statusEl) statusEl.textContent = on ? t('push_on_s') : t('push_off_s');
      if (offBtn) offBtn.hidden = !on;
    };
    renderPush();
    overlay.querySelector('#pushTest')?.addEventListener('click', async (e) => {
      const b = e.target; b.disabled = true; const prev = b.textContent; b.textContent = '⏳…';
      try { await sendTestPush(); await renderPush(); alert(t('push_test_ok')); }
      catch (err) {
        const map = { denied: t('notif_denied'), unsupported: t('notif_unsupported') };
        alert(map[err.message] || `${t('push_test_fail')}${err.message ? ` (${err.message})` : ''}`);
      } finally { b.disabled = false; b.textContent = prev; }
    });
    offBtn?.addEventListener('click', async () => { await disablePush(); await renderPush(); });
  }

  overlay.querySelector('#setSave').addEventListener('click', async () => {
    const nama = overlay.querySelector('#setNama').value.trim();
    const goal = overlay.querySelector('#setGoal').value.trim();
    const genderVal = overlay.querySelector('#setGender').value;
    const usia = overlay.querySelector('#setUsia').value.trim();
    const peran = overlay.querySelector('#setPeran').value.trim();
    const on = overlay.querySelector('#setReminderOn').checked;
    const time = overlay.querySelector('#setReminderTime').value || '05:30';

    const profileOut = { nama, goal, gender: genderVal, usia, peran };
    await Meta.set('profile', profileOut);
    await Meta.set('reminderTime', time);
    await Meta.set('reminderEnabled', on);

    if (on && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* abaikan */ }
    }

    // Notifikasi latar: bila pengingat diaktifkan, langganan push (best-effort)
    // lalu sinkronkan preferensi (waktu/aktif) ke server.
    if (pushSupported() && pushConfigured()) {
      if (on) { try { await enablePush(); } catch { /* izin ditolak → tetap pakai pengingat saat app terbuka */ } }
      try { await syncPushPrefs(); } catch { /* abaikan */ }
    }

    // Ganti bahasa → muat ulang agar seluruh UI ikut berubah.
    const newLang = overlay.querySelector('#setLang').value;
    if (newLang !== getLang()) {
      setLang(newLang);
      location.reload();
      return;
    }
    close();
    onSaveCb?.(profileOut);
  });

  // Pasang aplikasi (PWA install) — tampil hanya saat installable.
  const installBtn = overlay.querySelector('#setInstall');
  installBtn?.addEventListener('click', () => promptInstall());
  const onInstallChange = () => { if (installBtn) installBtn.hidden = !canInstall(); };
  document.addEventListener('haribaik:installchange', onInstallChange);
  overlay.addEventListener('hb:closed', () => document.removeEventListener('haribaik:installchange', onInstallChange));

  // Memori AI — tampilkan daftar fakta yang diingat, dengan hapus per-item & semua.
  const memList = overlay.querySelector('#memList');
  const memClearBtn = overlay.querySelector('#memClear');
  const escMem = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function renderMem() {
    const list = await getMemory();
    memClearBtn.hidden = list.length === 0;
    memList.innerHTML = list.length
      ? list.slice().reverse().map((m) => `<div class="mem-item"><span>${escMem(m.text)}</span><button class="mem-x" data-ts="${m.ts}" aria-label="${t('mem_forget')}" title="${t('mem_forget')}">✕</button></div>`).join('')
      : `<p class="jempty" style="text-align:left;font-size:12.5px">${t('mem_empty')}</p>`;
    memList.querySelectorAll('.mem-x').forEach((b) => b.addEventListener('click', async () => {
      await removeMemory(Number(b.dataset.ts));
      renderMem();
    }));
  }
  memClearBtn.addEventListener('click', async () => {
    if (!confirm(t('cf_mem_clear'))) return;
    await clearMemory();
    renderMem();
  });
  renderMem();

  overlay.querySelector('#setNewChat').addEventListener('click', async () => {
    if (!confirm(t('cf_newchat'))) return;
    await Messages.clear();
    location.reload();
  });

  // Backup menyeluruh: favorit + jurnal + meta (profil/pengaturan).
  overlay.querySelector('#setBackup').addEventListener('click', async () => {
    const [favorites, journal, deeds, meta] = await Promise.all([Favorites.all(), Journal.all(), Deeds.all(), Meta.all()]);
    const data = { app: 'HariBaik', version: 2, exportedAt: Date.now(), favorites, journal, deeds, meta };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'haribaik-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  const bfile = overlay.querySelector('#setBackupFile');
  overlay.querySelector('#setRestore').addEventListener('click', () => bfile.click());
  bfile.addEventListener('change', async () => {
    const f = bfile.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.app !== 'HariBaik') throw new Error('format');
      if (!confirm(t('cf_restore'))) {
        bfile.value = '';
        return;
      }
      const existFav = await Favorites.all();
      const seenF = new Set(existFav.map((e) => `${e.source}|${e.translation}`));
      for (const it of data.favorites || []) {
        if (it?.translation && it?.source && !seenF.has(`${it.source}|${it.translation}`)) {
          await Favorites.add({ arabic: it.arabic, translation: it.translation, source: it.source, source_type: (it.source_type || '').toLowerCase() });
          seenF.add(`${it.source}|${it.translation}`);
        }
      }
      const existJ = await Journal.all();
      const seenJ = new Set(existJ.map((e) => `${e.ts}|${e.mood}`));
      for (const it of data.journal || []) {
        if (it?.mood && it?.ts && !seenJ.has(`${it.ts}|${it.mood}`)) {
          await Journal.add({ mood: it.mood, note: it.note || '', ts: Number(it.ts) });
          seenJ.add(`${it.ts}|${it.mood}`);
        }
      }
      const existD = await Deeds.all();
      const seenD = new Set(existD.map((e) => e.day));
      for (const it of data.deeds || []) {
        if (it?.day && !seenD.has(it.day)) {
          await Deeds.set(it.day, it);
          seenD.add(it.day);
        }
      }
      for (const m of data.meta || []) if (m?.key) await Meta.set(m.key, m.value);
      alert(t('al_restored'));
      location.reload();
    } catch {
      alert(t('al_badbackup'));
    } finally {
      bfile.value = '';
    }
  });

  overlay.querySelector('#setReset').addEventListener('click', async () => {
    if (!confirm(t('cf_reset'))) return;
    await resetAll();
    location.reload();
  });
}

// Tampilkan onboarding bila pengguna belum mengisi nama. Mengembalikan true bila ditampilkan.
export async function maybeOnboard() {
  const profile = await Meta.get('profile', null);
  if (!profile || !profile.nama) {
    await openSettings({ welcome: true });
    return true;
  }
  return false;
}

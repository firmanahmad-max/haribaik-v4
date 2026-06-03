// settings.js — bottom-sheet pengaturan + onboarding pertama kali.
// Menggantikan window.prompt untuk waktu pengingat, dan menampung nama/goal pengguna.

import { Meta, Messages, Favorites, Journal, Deeds, resetAll } from './db.js';
import { trapFocus } from './a11y.js';
import { t, getLang, setLang } from './i18n.js';

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

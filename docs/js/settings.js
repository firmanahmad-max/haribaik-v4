// settings.js — bottom-sheet pengaturan + onboarding pertama kali.
// Menggantikan window.prompt untuk waktu pengingat, dan menampung nama/goal pengguna.

import { Meta, resetAll } from './db.js';

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
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Pengaturan">
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">${welcome ? "Assalamu'alaikum 🌿" : 'Pengaturan'}</h2>
      ${welcome ? '<p class="sheet-sub">Kenalan dulu yuk, biar HariBaik bisa menyapamu lebih hangat.</p>' : ''}

      <label class="field"><span>Nama panggilan</span>
        <input id="setNama" type="text" maxlength="30" placeholder="mis. Firman" value="${escAttr(profile.nama)}" />
      </label>

      <label class="field"><span>Apa yang sedang kamu usahakan? <em>(opsional)</em></span>
        <input id="setGoal" type="text" maxlength="80" placeholder="mis. lebih konsisten ibadah" value="${escAttr(profile.goal)}" />
      </label>

      <label class="field"><span>Usia <em>(opsional)</em></span>
        <input id="setUsia" type="number" min="5" max="120" inputmode="numeric" placeholder="mis. 21" value="${escAttr(profile.usia)}" />
      </label>

      <label class="field"><span>Jenis kelamin</span>
        <select id="setGender">
          <option value=""${sel('')}>— Pilih —</option>
          <option value="Perempuan"${sel('Perempuan')}>Perempuan</option>
          <option value="Laki-laki"${sel('Laki-laki')}>Laki-laki</option>
        </select>
      </label>

      <label class="field"><span>Profesi / peran <em>(opsional)</em></span>
        <input id="setPeran" type="text" maxlength="40" list="peranList" placeholder="mis. pelajar, karyawan, ibu rumah tangga" value="${escAttr(profile.peran)}" />
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
        <label class="row-between" for="setReminderOn"><span>Pengingat harian</span>
          <input id="setReminderOn" type="checkbox" ${reminderEnabled ? 'checked' : ''} />
        </label>
        <input id="setReminderTime" type="time" value="${reminderTime}" />
        <small class="field-hint">Pengingat muncul saat kamu membuka aplikasi setelah jam ini.</small>
      </div>

      <div class="sheet-actions">
        <button class="mini-btn danger" id="setReset">🗑️ Reset data</button>
        <span class="spacer"></span>
        ${welcome ? '' : '<button class="chip-btn" id="setClose">Tutup</button>'}
        <button class="primary-btn" id="setSave">Simpan</button>
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
    close();
    onSaveCb?.(profileOut);
  });

  overlay.querySelector('#setReset').addEventListener('click', async () => {
    if (!confirm('Hapus semua data (riwayat, favorit, pengaturan)? Tindakan ini tidak bisa dibatalkan.')) return;
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

// install.js — ajakan pasang PWA. Android/Chrome: tangkap `beforeinstallprompt`
// lalu tampilkan banner "Pasang". iOS Safari (tak punya event itu): tampilkan
// petunjuk manual "Bagikan → Tambah ke Layar Utama". Self-contained: bikin DOM sendiri.

import { t } from './i18n.js';

let deferredPrompt = null;
const DISMISS_KEY = 'installDismissed';
const DISMISS_DAYS = 7;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function dismissedRecently() {
  const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return ts > 0 && Date.now() - ts < DISMISS_DAYS * 864e5;
}
function remember() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* abaikan */ }
}

export function canInstall() {
  return !!deferredPrompt;
}
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  let accepted = false;
  try { const { outcome } = await deferredPrompt.userChoice; accepted = outcome === 'accepted'; } catch { /* abaikan */ }
  deferredPrompt = null;
  hideBanner();
  document.dispatchEvent(new Event('haribaik:installchange'));
  return accepted;
}

function hideBanner() {
  document.getElementById('installBanner')?.remove();
}

function showBanner(kind) {
  if (isStandalone() || dismissedRecently() || document.getElementById('installBanner')) return;
  const el = document.createElement('div');
  el.id = 'installBanner';
  el.className = 'install-banner';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t('inst_title'));
  const msg = kind === 'ios' ? t('inst_ios') : t('inst_body');
  el.innerHTML = `
    <div class="ib-text"><b>${t('inst_title')}</b><span>${msg}</span></div>
    <div class="ib-actions">
      ${kind === 'ios' ? '' : `<button class="primary-btn ib-yes" type="button">${t('inst_yes')}</button>`}
      <button class="chip-btn ib-no" type="button">${kind === 'ios' ? t('inst_ok') : t('inst_later')}</button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  el.querySelector('.ib-yes')?.addEventListener('click', () => promptInstall());
  el.querySelector('.ib-no')?.addEventListener('click', () => { remember(); hideBanner(); });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.dispatchEvent(new Event('haribaik:installchange'));
  showBanner('android');
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  remember();
  hideBanner();
  document.dispatchEvent(new Event('haribaik:installchange'));
});

// iOS: tak ada beforeinstallprompt → tampilkan petunjuk manual setelah jeda singkat.
if (isIOS() && !isStandalone() && !dismissedRecently()) {
  setTimeout(() => showBanner('ios'), 3500);
}

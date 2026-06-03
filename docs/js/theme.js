// theme.js — dark/light toggle, disimpan di localStorage. Default: dark (brand).

const KEY = 'haribaik-theme';
const RAMADAN_KEY = 'haribaik-ramadan';

export function initTheme(btn) {
  applyRamadan();
  const saved = localStorage.getItem(KEY) || 'dark';
  apply(saved);
  if (btn) {
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(next);
      localStorage.setItem(KEY, next);
    });
  }
}

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0c1a13' : '#f3f1e7');
}

// ---------- Mode Ramadan ----------
export function isRamadan() {
  return localStorage.getItem(RAMADAN_KEY) === '1';
}
export function applyRamadan() {
  document.documentElement.setAttribute('data-ramadan', isRamadan() ? 'on' : 'off');
  return isRamadan();
}
export function setRamadan(on) {
  localStorage.setItem(RAMADAN_KEY, on ? '1' : '0');
  applyRamadan();
}

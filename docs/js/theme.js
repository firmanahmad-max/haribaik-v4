// theme.js — dark/light toggle, disimpan di localStorage. Default: dark (brand).

const KEY = 'haribaik-theme';

export function initTheme(btn) {
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

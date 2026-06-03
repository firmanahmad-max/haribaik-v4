// a11y.js — utilitas aksesibilitas: focus trap + Escape untuk modal/sheet.

/**
 * Kurung fokus keyboard di dalam elemen sheet, dan dukung Escape untuk menutup.
 * @param {HTMLElement} overlay elemen pembungkus (menerima keydown)
 * @param {HTMLElement} sheet elemen yang fokusnya dikurung
 * @param {{onEscape?: ()=>void}} [opts]
 */
export function trapFocus(overlay, sheet, { onEscape } = {}) {
  const SEL = 'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = [...sheet.querySelectorAll(SEL)].filter((el) => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

// tentang.js — halaman Tentang & Disclaimer (statis): init tema + terjemahan UI chrome.
import { initTheme } from './theme.js';
import { applyI18n } from './i18n.js';

applyI18n();
initTheme(document.getElementById('themeBtn'));

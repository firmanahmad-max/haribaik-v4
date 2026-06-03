// i18n.js — terjemahan ringan (ID/EN). String UI dipusatkan di sini.
// HTML memakai atribut data-i18n / data-i18n-ph; JS memakai t('kunci').

const KEY = 'haribaik-lang';

const DICT = {
  id: {
    // Nav & umum
    nav_chat: 'Chat', nav_journal: 'Jurnal', nav_deeds: 'Amalan', nav_favorites: 'Favorit',
    tagline_app: 'Mulai harimu dengan kebaikan',
    tagline_journal: 'Pantau perjalanan hatimu',
    tagline_deeds: 'Istiqomah dalam kebaikan',
    tagline_favorites: 'Kutipan yang kamu simpan',
    powered: 'Powered by Max Computer - Arta Ecosystem',
    close: 'Tutup', save: 'Simpan', cancel: 'Batalkan',
    // Chat
    composer_ph: 'Ceritakan apa yang kamu rasakan…',
    disclaimer: 'Kutipan ayat, hadits dan doa bisa terjadi kekeliruan. Mohon bantu verifikasi sumber sebelum diamalkan dan dibagikan.',
    understood: 'Mengerti',
    btn_save: 'Simpan', btn_copy: 'Salin', btn_share: 'Bagikan', btn_listen: 'Dengar', btn_report: 'Laporkan',
    saved_fav: 'Disimpan ke favorit', saved_done: 'Tersimpan', copied: 'Teks disalin', copy_fail: 'Gagal menyalin',
    report_thanks: 'Terima kasih, laporan tercatat 🙏 Kami akan tinjau.',
    retry: 'Coba lagi',
    qr_more: 'Ceritakan lebih banyak', qr_doa: 'Beri aku doa lagi', qr_how: 'Bagaimana caranya?', qr_thanks: 'Terima kasih 🙏',
    mood_Senang: 'Senang', mood_Sedih: 'Sedih', mood_Cemas: 'Cemas', mood_Kesal: 'Kesal', mood_Bersyukur: 'Bersyukur', mood_Lelah: 'Lelah',
    label_quran: 'Al-Quran', label_hadits: 'Hadits', label_doa: 'Doa',
    err_offline: 'Kamu sedang offline. Periksa koneksi internet, lalu coba lagi.',
    err_429: 'Sebentar ya — terlalu banyak permintaan dalam waktu singkat. Coba lagi beberapa saat.',
    err_5xx: 'AI sedang sibuk atau bermasalah sesaat. Coba lagi sebentar.',
    err_generic: 'Gagal terhubung ke server. Coba lagi.',
    // Settings
    set_title: 'Pengaturan', welcome_title: "Assalamu'alaikum 🌿",
    welcome_sub: 'Kenalan dulu yuk, biar HariBaik bisa menyapamu lebih hangat.',
    f_name: 'Nama panggilan', f_goal: 'Apa yang sedang kamu usahakan?', f_optional: '(opsional)',
    f_age: 'Usia', f_gender: 'Jenis kelamin', f_role: 'Profesi / peran',
    gender_pick: '— Pilih —', gender_f: 'Perempuan', gender_m: 'Laki-laki',
    f_reminder: 'Pengingat harian', reminder_hint: 'Pengingat muncul saat kamu membuka aplikasi setelah jam ini.',
    f_language: 'Bahasa',
    new_chat: '🧹 Mulai percakapan baru', backup: '⬇️ Backup semua data', restore: '⬆️ Restore', reset: '🗑️ Reset data',
    saved_settings: 'Pengaturan tersimpan',
    // Journal
    j_how: 'Bagaimana perasaanmu?', j_note_ph: 'Tulis catatan singkat (opsional)…', j_save: 'Simpan ke jurnal',
    j_insight: 'Insight mingguan', j_make_insight: '✨ Buat insight',
    j_stats: 'Statistik', j_period_week: 'Minggu ini', j_period_month: 'Bulan ini', j_period_all: 'Semua',
    j_month_trend: 'Tren bulan ini', j_dist: 'Sebaran mood', j_last7: '7 hari terakhir',
    j_cal_hint: 'Ketuk tanggal untuk melihat catatanmu.',
    j_export: '⬇️ Export jurnal', j_import: '⬆️ Import jurnal',
    // Deeds
    d_ramadan: '🌙 Mode Ramadan',
    d_today: 'Amalan hari ini', d_consistency: 'Konsistensi', d_last7: '7 hari terakhir',
    d_challenge: 'Istiqomah Challenge 30 Hari',
    jadwal: '🕌 Jadwal Sholat', jadwal_loc_unset: 'Belum diatur', use_location: '📍 Lokasi saya', pick_city: 'atau pilih kota…',
    jadwal_pick_hint: 'Ketuk salah satu waktu untuk memilih hitung mundur · ketuk lagi untuk otomatis.',
    adzan: '🔔 Notifikasi adzan', adzan_hint: 'Pengingat muncul saat aplikasi terbuka pada waktu sholat.',
    qibla: '🧭 Arah Kiblat', qibla_enable: '🧭 Aktifkan kompas', qibla_set_loc: 'Atur lokasi di Jadwal Sholat untuk menghitung arah kiblat.',
    // Favorites
    fav_all: 'Semua', fav_export: '⬇️ Export', fav_import: '⬆️ Import',
  },
  en: {
    nav_chat: 'Chat', nav_journal: 'Journal', nav_deeds: 'Deeds', nav_favorites: 'Favorites',
    tagline_app: 'Start your day with kindness',
    tagline_journal: 'Track your heart’s journey',
    tagline_deeds: 'Stay steadfast in goodness',
    tagline_favorites: 'Quotes you saved',
    powered: 'Powered by Max Computer - Arta Ecosystem',
    close: 'Close', save: 'Save', cancel: 'Cancel',
    composer_ph: 'Tell me how you feel…',
    disclaimer: 'AI-selected verses, hadith and prayers may contain mistakes. Please verify the source before practicing or sharing.',
    understood: 'Got it',
    btn_save: 'Save', btn_copy: 'Copy', btn_share: 'Share', btn_listen: 'Listen', btn_report: 'Report',
    saved_fav: 'Saved to favorites', saved_done: 'Saved', copied: 'Text copied', copy_fail: 'Failed to copy',
    report_thanks: 'Thank you, your report was logged 🙏 We’ll review it.',
    retry: 'Try again',
    qr_more: 'Tell me more', qr_doa: 'Give me another prayer', qr_how: 'How do I do that?', qr_thanks: 'Thank you 🙏',
    mood_Senang: 'Happy', mood_Sedih: 'Sad', mood_Cemas: 'Anxious', mood_Kesal: 'Annoyed', mood_Bersyukur: 'Grateful', mood_Lelah: 'Tired',
    label_quran: 'Quran', label_hadits: 'Hadith', label_doa: 'Prayer',
    err_offline: 'You are offline. Check your connection and try again.',
    err_429: 'Just a moment — too many requests in a short time. Please try again shortly.',
    err_5xx: 'The AI is busy or having a hiccup. Please try again shortly.',
    err_generic: 'Failed to reach the server. Please try again.',
    set_title: 'Settings', welcome_title: 'Assalamu’alaikum 🌿',
    welcome_sub: 'Let’s get acquainted so HariBaik can greet you more warmly.',
    f_name: 'Nickname', f_goal: 'What are you working on?', f_optional: '(optional)',
    f_age: 'Age', f_gender: 'Gender', f_role: 'Profession / role',
    gender_pick: '— Choose —', gender_f: 'Female', gender_m: 'Male',
    f_reminder: 'Daily reminder', reminder_hint: 'The reminder shows when you open the app after this time.',
    f_language: 'Language',
    new_chat: '🧹 Start a new conversation', backup: '⬇️ Back up all data', restore: '⬆️ Restore', reset: '🗑️ Reset data',
    saved_settings: 'Settings saved',
    j_how: 'How are you feeling?', j_note_ph: 'Write a short note (optional)…', j_save: 'Save to journal',
    j_insight: 'Weekly insight', j_make_insight: '✨ Generate insight',
    j_stats: 'Statistics', j_period_week: 'This week', j_period_month: 'This month', j_period_all: 'All',
    j_month_trend: 'This month’s trend', j_dist: 'Mood distribution', j_last7: 'Last 7 days',
    j_cal_hint: 'Tap a date to view your notes.',
    j_export: '⬇️ Export journal', j_import: '⬆️ Import journal',
    d_ramadan: '🌙 Ramadan Mode',
    d_today: 'Today’s deeds', d_consistency: 'Consistency', d_last7: 'Last 7 days',
    d_challenge: '30-Day Istiqomah Challenge',
    jadwal: '🕌 Prayer Times', jadwal_loc_unset: 'Not set', use_location: '📍 My location', pick_city: 'or pick a city…',
    jadwal_pick_hint: 'Tap a time to choose the countdown · tap again for automatic.',
    adzan: '🔔 Adhan notifications', adzan_hint: 'Reminders appear while the app is open at prayer times.',
    qibla: '🧭 Qibla Direction', qibla_enable: '🧭 Enable compass', qibla_set_loc: 'Set your location in Prayer Times to compute the Qibla direction.',
    fav_all: 'All', fav_export: '⬇️ Export', fav_import: '⬆️ Import',
  },
};

let lang = localStorage.getItem(KEY) || 'id';

export function getLang() { return lang; }
export function setLang(l) {
  lang = DICT[l] ? l : 'id';
  localStorage.setItem(KEY, lang);
  document.documentElement.lang = lang;
}
export function t(key, fallback) {
  return DICT[lang]?.[key] ?? DICT.id?.[key] ?? fallback ?? key;
}
export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.dataset.i18nPh)); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}

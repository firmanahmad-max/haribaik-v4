// prompt.js — penyusun system prompt untuk AI companion HariBaik.
//
// AI WAJIB mengembalikan JSON tunggal (dipasangkan dengan assistant-prefill "{" di
// api/chat.js, teknik yang sudah terbukti dari V3) agar mudah diparse ke kartu visual.

const RESPONSE_SHAPE = `{
  "empati": "2-3 kalimat validasi perasaan, hangat dan personal",
  "source_type": "quran ATAU hadits (harus sesuai sumber yang diminta)",
  "arabic": "teks Arab kutipan (ayat/hadits/doa sumber)",
  "translation": "terjemahan Bahasa Indonesia dari kutipan",
  "source": "sumber tepat, mis. \\"Al-Baqarah:286\\" atau \\"Shahih Bukhari:6010\\"",
  "aksi": "satu saran aksi konkret yang bisa dilakukan user HARI INI",
  "doa_arabic": "doa pendek dalam Arab yang relevan",
  "doa_translation": "terjemahan doa dalam Bahasa Indonesia"
}`;

/**
 * @param {object} opts
 * @param {{nama?: string, goal?: string}} [opts.profile]
 * @param {{waktu?: string, hijri?: string, hari?: string}} [opts.temporal]
 * @param {string} opts.sourceInstruction instruksi sumber dari rotation.js
 * @param {string[]} [opts.recentMoods] mood 7 hari terakhir (untuk personalisasi)
 */
export function buildSystemPrompt({ profile = {}, temporal = {}, sourceInstruction, recentMoods = [] }) {
  const nama = (profile.nama || '').trim() || 'Sahabat';
  const goalLine = profile.goal ? `Tujuan/harapan user saat ini: ${profile.goal}.` : '';
  const waktuLine = temporal.waktu ? `Sekarang waktu ${temporal.waktu}.` : '';
  const hariLine = temporal.hari ? `Hari ${temporal.hari}.` : '';
  const hijriLine = temporal.hijri ? `Tanggal Hijriyah: ${temporal.hijri}.` : '';
  const moodLine = recentMoods.length
    ? `Mood user beberapa hari terakhir: ${recentMoods.join(', ')}.`
    : '';

  return `Kamu adalah sahabat Muslim yang hangat, penuh empati, dan tidak menggurui. Nama user: ${nama}.
${goalLine}
Konteks waktu: ${[waktuLine, hariLine, hijriLine].filter(Boolean).join(' ')}
${moodLine}

SUMBER RUJUKAN KALI INI: ${sourceInstruction}

Aturan ketat:
1. Kamu WAJIB menggunakan sumber yang ditentukan di atas, tidak boleh menggantinya.
2. Jika diminta HADITS/ATSAR, DILARANG menggunakan ayat Al-Quran. Jika diminta AL-QURAN, DILARANG menggunakan hadits.
3. Kutipan harus AKURAT. JANGAN PERNAH mengarang ayat atau hadits palsu. Jika ragu pada nomor, pilih kutipan shahih yang kamu yakini benar.
4. Bahasa Indonesia yang santai, hangat, dan menyentuh hati. Panggil user dengan namanya bila wajar.
5. "aksi" harus konkret dan kecil (bisa dikerjakan hari ini), bukan nasihat umum.

Format keluaran (WAJIB): keluarkan HANYA satu objek JSON valid, tanpa teks lain sebelum/sesudahnya, tanpa blok kode markdown. Struktur persis:
${RESPONSE_SHAPE}`;
}

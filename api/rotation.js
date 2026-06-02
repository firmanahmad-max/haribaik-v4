// rotation.js — Quran/Hadits balancing (perbaikan utama dari V3).
//
// Masalah V3: ~99% respons selalu Al-Quran karena prompt ambigu ("ayat atau hadits")
// dan tidak ada mekanisme rotasi. V4 memakai 3 lapis solusi:
//   Lapis 1 — getSourceInstruction(): instruksi eksplisit WAJIB/DILARANG.
//   Lapis 2 — ROTATION_PATTERN: rotasi kaya (sub-jenis hadits + atsar) berdasarkan counter.
//   Lapis 3 — validasi tag sumber + retry (ditangani di api/chat.js).

// Lapis 2: pola rotasi. Indeks dipilih dengan requestCount % panjang pola.
export const ROTATION_PATTERN = [
  'QURAN',
  'HADITS_BUKHARI',
  'QURAN',
  'HADITS_MUSLIM',
  'QURAN',
  'HADITS_TIRMIDZI',
  'ATSAR_SAHABAT',
  'HADITS_QUDSI',
];

// Metadata tiap jenis sumber: family menentukan source_type yang divalidasi,
// detail dipakai untuk menyusun instruksi yang spesifik.
const SOURCE_META = {
  QURAN: {
    family: 'quran',
    instruction:
      'Gunakan satu AYAT AL-QURAN yang relevan. Sebutkan nama surat dan nomor ayat dengan tepat ' +
      '(contoh sumber: "Al-Baqarah:286"). DILARANG menggunakan hadits kali ini.',
  },
  HADITS_BUKHARI: {
    family: 'hadits',
    instruction:
      'WAJIB gunakan satu HADITS SHAHIH riwayat Imam Bukhari (Shahih Bukhari). ' +
      'Sebutkan kitab dan nomor hadits (contoh sumber: "Shahih Bukhari:6010"). ' +
      'DILARANG menggunakan ayat Al-Quran kali ini.',
  },
  HADITS_MUSLIM: {
    family: 'hadits',
    instruction:
      'WAJIB gunakan satu HADITS SHAHIH riwayat Imam Muslim (Shahih Muslim). ' +
      'Sebutkan kitab dan nomor hadits (contoh sumber: "Shahih Muslim:2699"). ' +
      'DILARANG menggunakan ayat Al-Quran kali ini.',
  },
  HADITS_TIRMIDZI: {
    family: 'hadits',
    instruction:
      'WAJIB gunakan satu HADITS riwayat Imam Tirmidzi (Sunan Tirmidzi) yang shahih atau hasan. ' +
      'Sebutkan kitab dan nomor hadits (contoh sumber: "Sunan Tirmidzi:2516"). ' +
      'DILARANG menggunakan ayat Al-Quran kali ini.',
  },
  ATSAR_SAHABAT: {
    family: 'hadits',
    instruction:
      'WAJIB gunakan satu ATSAR (perkataan/nasihat) dari sahabat Nabi (misalnya Abu Bakar, Umar, ' +
      'Ali, atau Ibnu Mas’ud) yang diriwayatkan dengan sanad terpercaya. Sebutkan nama sahabat ' +
      'dan sumber riwayatnya pada field sumber. Tetap gunakan source_type "hadits". ' +
      'DILARANG menggunakan ayat Al-Quran kali ini.',
  },
  HADITS_QUDSI: {
    family: 'hadits',
    instruction:
      'WAJIB gunakan satu HADITS QUDSI yang shahih. Sebutkan kitab/perawi sumbernya ' +
      '(contoh sumber: "Hadits Qudsi - Shahih Muslim:2675"). Gunakan source_type "hadits". ' +
      'DILARANG menggunakan ayat Al-Quran kali ini.',
  },
};

/**
 * Lapis 1 + 2 digabung: tentukan sumber untuk request ke-N.
 * @param {number} requestCount counter persisten dari klien (mulai 0).
 * @returns {{ key: string, family: 'quran'|'hadits', instruction: string }}
 */
export function getSourceInstruction(requestCount) {
  const n = Number.isFinite(requestCount) && requestCount >= 0 ? Math.floor(requestCount) : 0;
  const key = ROTATION_PATTERN[n % ROTATION_PATTERN.length];
  const meta = SOURCE_META[key];
  return { key, family: meta.family, instruction: meta.instruction };
}

/**
 * Instruksi yang dikeraskan untuk percobaan ulang (Lapis 3) ketika AI mengembalikan
 * family yang salah pada percobaan pertama.
 * @param {{ key: string, family: string, instruction: string }} source
 */
export function getRetryInstruction(source) {
  const familyLabel = source.family === 'hadits' ? 'HADITS / ATSAR' : 'AYAT AL-QURAN';
  return (
    `PENTING: Pada percobaan sebelumnya kamu salah memilih sumber. ` +
    `Sekarang kamu HARUS memakai ${familyLabel} dan mengisi "source_type" persis "${source.family}". ` +
    source.instruction
  );
}

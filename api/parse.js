// parse.js — ekstraksi & validasi JSON dari respons AI.
// extractFirstJsonObject diadaptasi dari V3: menemukan objek JSON berimbang pertama,
// menangani string literal dan escape sequence agar tidak salah hitung kurung.

/**
 * Cari objek JSON valid pertama di dalam teks dan parse.
 * @param {string} text
 * @returns {object}
 * @throws {Error} jika tidak ada objek JSON yang bisa diparse.
 */
export function extractFirstJsonObject(text) {
  if (typeof text !== 'string') throw new Error('Input bukan string');

  const start = text.indexOf('{');
  if (start === -1) throw new Error('Tidak ada objek JSON di respons AI');

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        return JSON.parse(candidate);
      }
    }
  }

  throw new Error('Objek JSON tidak lengkap (kurung tidak berimbang)');
}

const REQUIRED_FIELDS = [
  'empati',
  'source_type',
  'arabic',
  'translation',
  'source',
  'aksi',
  'doa_arabic',
  'doa_translation',
];

/**
 * Normalisasi + validasi struktur respons AI.
 * @param {object} obj
 * @returns {{ ok: boolean, data?: object, missing?: string[] }}
 */
export function validateResponse(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, missing: ['(bukan objek)'] };

  const missing = REQUIRED_FIELDS.filter(
    (f) => obj[f] === undefined || obj[f] === null || String(obj[f]).trim() === ''
  );
  if (missing.length) return { ok: false, missing };

  const data = { ...obj };
  data.source_type = String(obj.source_type).toLowerCase().trim();
  if (data.source_type !== 'quran' && data.source_type !== 'hadits') {
    return { ok: false, missing: ['source_type (nilai tidak valid)'] };
  }
  return { ok: true, data };
}

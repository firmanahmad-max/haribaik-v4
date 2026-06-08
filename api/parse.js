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
 * @param {'structured'|'conversational'} [mode] 'structured' = giliran pertama (wajib
 *        lengkap); 'conversational' = giliran lanjutan (hanya "reply" yang wajib,
 *        ayat/saran/doa opsional).
 * @returns {{ ok: boolean, data?: object, missing?: string[] }}
 */
export function validateResponse(obj, mode = 'structured') {
  if (!obj || typeof obj !== 'object') return { ok: false, missing: ['(bukan objek)'] };

  if (mode === 'conversational') return validateConversational(obj);

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

const isFilled = (v) => v !== undefined && v !== null && String(v).trim() !== '';

/** Validasi longgar untuk giliran lanjutan (percakapan). */
function validateConversational(obj) {
  const reply = isFilled(obj.reply) ? String(obj.reply).trim() : (isFilled(obj.empati) ? String(obj.empati).trim() : '');
  if (!reply) return { ok: false, missing: ['reply'] };

  const data = { ...obj, mode: 'conversational', reply };
  data.offer = isFilled(obj.offer) ? String(obj.offer).trim() : null;

  const hasAyat = isFilled(obj.arabic) && isFilled(obj.translation);
  if (hasAyat) {
    const st = String(obj.source_type || '').toLowerCase().trim();
    data.source_type = (st === 'quran' || st === 'hadits') ? st : null; // diisi family yang diminta di handler bila null
  } else {
    // Bersihkan field kutipan agar tidak setengah-setengah.
    data.source_type = null;
    data.arabic = null;
    data.translation = null;
    data.source = null;
  }
  if (!isFilled(obj.aksi)) data.aksi = null;
  if (!(isFilled(obj.doa_arabic) || isFilled(obj.doa_translation))) {
    data.doa_arabic = null;
    data.doa_translation = null;
  }
  return { ok: true, data };
}

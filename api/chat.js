// chat.js — handler utama POST /api/chat.
// Merakit konteks, menerapkan rotasi sumber, memanggil Sumopod (Claude Haiku),
// memvalidasi family sumber, dan retry sekali bila salah (Lapis 3).

import { getSourceInstruction, getRetryInstruction } from './rotation.js';
import { buildSystemPrompt } from './prompt.js';
import { extractFirstJsonObject, validateResponse } from './parse.js';

const SUMOPOD_URL = 'https://ai.sumopod.com/v1/messages';
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 800;
const HISTORY_WINDOW = 6; // sliding window pesan terakhir

/**
 * Panggil Sumopod sekali dengan assistant-prefill "{" untuk memaksa keluaran JSON.
 * Mengembalikan objek JSON ter-parse.
 */
async function callSumopod({ system, window, message, mockFamily }) {
  // Mode mock untuk menguji rotasi tanpa API key.
  if (process.env.MOCK_AI === '1' || !process.env.SUMOPOD_API_KEY) {
    return mockResponse({ message, family: mockFamily });
  }

  // Sumopod mengabaikan field `system` (memakai persona default-nya), jadi instruksi
  // ditaruh di dalam pesan user terakhir — pendekatan yang terbukti dari V3.
  const userContent = `${system}\n\n=== PESAN USER ===\n${message}`;
  const messages = [
    ...window.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent },
    { role: 'assistant', content: '{' },
  ];

  const res = await fetch(SUMOPOD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.SUMOPOD_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Sumopod ${res.status}: ${detail.slice(0, 300)}`);
  }

  const result = await res.json();
  const text = (result?.content?.[0]?.text ?? '').trim();
  return parseAiText(text);
}

/**
 * Parsing tahan-banting terhadap beragam format keluaran Sumopod:
 *  - model mengikuti prefill "{" → teks adalah lanjutan tanpa "{" di depan
 *  - model mengembalikan JSON utuh (mengabaikan prefill), bisa terbungkus ```json
 *  - keduanya gagal → lempar error berisi cuplikan mentah untuk diagnosis
 */
function parseAiText(text) {
  // 1) Coba langsung (menangani JSON utuh / berpagar ```).
  try {
    return extractFirstJsonObject(text);
  } catch {
    /* lanjut */
  }
  // 2) Anggap teks adalah lanjutan dari prefill "{".
  try {
    return extractFirstJsonObject('{' + text);
  } catch {
    /* lanjut */
  }
  // Cuplikan mentah hanya ditampilkan saat DEBUG agar tidak membocorkan isi prompt di produksi.
  if (process.env.DEBUG === '1') {
    const snippet = text.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`Format respons AI tak dikenali. Cuplikan: ${snippet}`);
  }
  throw new Error('Format respons AI tak dikenali');
}

/**
 * Respons tiruan deterministik untuk mode mock — menghormati family sumber yang
 * diminta agar logika rotasi & validasi tetap bisa diuji offline.
 */
function mockResponse({ message, family }) {
  if (family === 'hadits') {
    return {
      empati: `Aku mendengarmu. Tidak apa-apa merasa seperti itu — kamu sudah berusaha. (mock untuk: "${String(message).slice(0, 40)}")`,
      source_type: 'hadits',
      arabic: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
      translation: 'Sesungguhnya amal itu tergantung pada niatnya.',
      source: 'Shahih Bukhari:1',
      aksi: 'Tuliskan satu niat baik kecil untuk hari ini sebelum memulai aktivitas.',
      doa_arabic: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ',
      doa_translation: 'Ya Allah, tolonglah aku untuk mengingat-Mu, bersyukur kepada-Mu, dan beribadah dengan baik kepada-Mu.',
    };
  }
  return {
    empati: `Aku mengerti perasaanmu, dan itu valid. (mock untuk: "${String(message).slice(0, 40)}")`,
    source_type: 'quran',
    arabic: 'لَا يُكَلِّفُ ٱللَّهُ نَفْسًا إِلَّا وُسْعَهَا',
    translation: 'Allah tidak membebani seseorang melainkan sesuai kesanggupannya.',
    source: 'Al-Baqarah:286',
    aksi: 'Pilih satu hal terkecil dari bebanmu hari ini, dan selesaikan hanya itu.',
    doa_arabic: 'رَبَّنَا لَا تُؤَاخِذْنَا إِن نَّسِينَا أَوْ أَخْطَأْنَا',
    doa_translation: 'Ya Tuhan kami, janganlah Engkau hukum kami jika kami lupa atau bersalah.',
  };
}

/**
 * Handler inti. Bersifat agnostik framework: terima objek body, kembalikan { status, body }.
 * @param {object} body request body (lihat plan untuk bentuknya)
 */
export async function handleChat(body = {}) {
  const {
    message,
    mood = null,
    history = [],
    profile = {},
    temporal = {},
    requestCount = 0,
    recentMoods = [],
    lang = 'id',
  } = body;
  const safeLang = lang === 'en' ? 'en' : 'id';

  // Batasi panjang input untuk mencegah penyalahgunaan & boros token.
  const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '');
  const safeMessage = clip(message, 2000);
  const safeMood = mood ? clip(mood, 20) : null;
  const safeProfile = {
    nama: clip(profile.nama, 40),
    goal: clip(profile.goal, 120),
    gender: clip(profile.gender, 20),
    usia: clip(profile.usia, 10),
    peran: clip(profile.peran, 60),
  };
  const safeMoods = Array.isArray(recentMoods) ? recentMoods.slice(-7).map((m) => clip(m, 20)) : [];

  const userText = buildUserText(safeMessage, safeMood);
  if (!userText) {
    return { status: 400, body: { error: 'message atau mood wajib diisi' } };
  }

  const window = Array.isArray(history)
    ? history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
        .slice(-HISTORY_WINDOW)
        .map((m) => ({ role: m.role, content: clip(m.content, 1000) }))
    : [];

  const source = getSourceInstruction(requestCount);

  // Percobaan 1.
  let system = buildSystemPrompt({
    profile: safeProfile,
    temporal,
    recentMoods: safeMoods,
    sourceInstruction: source.instruction,
    lang: safeLang,
  });

  let parsed;
  try {
    parsed = await callSumopod({ system, window, message: userText, mockFamily: source.family });
  } catch (err) {
    return { status: 502, body: { error: 'Gagal memanggil AI', detail: err.message } };
  }

  let valid = validateResponse(parsed);

  // Lapis 3: bila family salah atau struktur invalid, retry sekali dengan instruksi keras.
  const familyMismatch = valid.ok && valid.data.source_type !== source.family;
  if (!valid.ok || familyMismatch) {
    system = buildSystemPrompt({
      profile: safeProfile,
      temporal,
      recentMoods: safeMoods,
      sourceInstruction: getRetryInstruction(source),
      lang: safeLang,
    });
    try {
      parsed = await callSumopod({ system, window, message: userText, mockFamily: source.family });
      valid = validateResponse(parsed);
    } catch (err) {
      // Pertahankan hasil pertama jika retry gagal total.
      if (!valid.ok) return { status: 502, body: { error: 'Gagal memanggil AI', detail: err.message } };
    }
  }

  if (!valid.ok) {
    return { status: 502, body: { error: 'Respons AI tidak valid', missing: valid.missing } };
  }

  return {
    status: 200,
    body: {
      ...valid.data,
      meta: {
        requested_source: source.key,
        requested_family: source.family,
        family_matched: valid.data.source_type === source.family,
        request_count: requestCount,
      },
    },
  };
}

function buildUserText(message, mood) {
  const m = typeof message === 'string' ? message.trim() : '';
  if (m && mood) return `[Mood: ${mood}] ${m}`;
  if (m) return m;
  if (mood) return `Hari ini aku merasa ${mood}.`;
  return '';
}

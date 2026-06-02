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

  const messages = [
    ...window.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
    { role: 'assistant', content: '{' },
  ];

  const res = await fetch(SUMOPOD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.SUMOPOD_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Sumopod ${res.status}: ${detail.slice(0, 300)}`);
  }

  const result = await res.json();
  const text = result?.content?.[0]?.text ?? '';
  // Karena turn assistant di-prefill dengan "{", tambahkan kembali di depan.
  return extractFirstJsonObject('{' + text);
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
  } = body;

  const userText = buildUserText(message, mood);
  if (!userText) {
    return { status: 400, body: { error: 'message atau mood wajib diisi' } };
  }

  const window = Array.isArray(history)
    ? history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
        .slice(-HISTORY_WINDOW)
    : [];

  const source = getSourceInstruction(requestCount);

  // Percobaan 1.
  let system = buildSystemPrompt({
    profile,
    temporal,
    recentMoods,
    sourceInstruction: source.instruction,
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
      profile,
      temporal,
      recentMoods,
      sourceInstruction: getRetryInstruction(source),
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

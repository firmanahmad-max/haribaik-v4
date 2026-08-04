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
async function callSumopod({ system, window, message, mockFamily, turn = 'first' }) {
  // Mode mock untuk menguji rotasi tanpa API key.
  if (process.env.MOCK_AI === '1' || !process.env.SUMOPOD_API_KEY) {
    return mockResponse({ message, family: mockFamily, turn });
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
// Ekstraksi fakta durable tiruan (mock) — deteksi kalimat "aku sedang/ingin/…".
function mockRemember(msg) {
  const m = /\b(aku|saya)\s+(sedang|lagi|ingin|mau|akan|baru saja|habis)\s+([^.,!?\n]{4,80})/i.exec(msg);
  if (m) return `${m[2].charAt(0).toUpperCase()}${m[2].slice(1)} ${m[3].trim()}`.slice(0, 120);
  return null;
}

function mockResponse({ message, family, turn = 'first' }) {
  if (turn === 'followup') {
    const msg = String(message).toLowerCase();
    const wantAyat = /(ayat|hadits|hadis|qur|firman)/.test(msg);
    const wantDoa = /\bdoa\b|berdoa|doakan/.test(msg);
    const wantAksi = /(saran|aksi|langkah|tips|nasihat|nasehat|lakukan)/.test(msg);
    // Pertanyaan ringan/santai → balasan jenaka halus (sesekali, untuk cairkan suasana).
    const isCasual = /(halo|hai|haii|hei|kabar|gimana kabar|kamu siapa|kamu apa|lagi ngapain|sedang apa|jokes?|lucu|hobimu|main|ngopi)/.test(msg);
    const heavy = /(sedih|cemas|takut|marah|lelah|capek|kesal|patah hati|gagal|sakit|kehilangan|stres|stress)/.test(msg);
    const r = {
      mode: 'conversational',
      reply: (isCasual && !heavy)
        ? `Halo! Aku Haribaik, sahabat digitalmu. Status hari ini: belum tidur, tidak butuh kopi, dan masih semangat menemani 😄`
        : `Aku di sini menemanimu, dan aku dengar ceritamu. (mock untuk: "${msg.slice(0, 40)}")`,
      offer: null,
      source_type: null, arabic: null, translation: null, source: null,
      aksi: null, doa_arabic: null, doa_translation: null,
    };
    if (wantAyat) {
      r.source_type = 'quran';
      r.arabic = 'فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا';
      r.translation = 'Sesungguhnya bersama kesulitan ada kemudahan.';
      r.source = 'Asy-Syarh:5';
    }
    if (wantAksi) r.aksi = 'Coba tuliskan satu hal kecil yang bisa kamu syukuri sekarang.';
    if (wantDoa) {
      r.doa_arabic = 'رَبِّ اشْرَحْ لِي صَدْرِي';
      r.doa_translation = 'Ya Tuhanku, lapangkanlah dadaku.';
    }
    if (!wantAyat && !wantAksi && !wantDoa) {
      r.offer = 'Kalau kamu mau, aku bisa temani dengan ayat, satu saran kecil, atau doa yang pas — sebut saja ya.';
    }
    r.remember = mockRemember(message);
    return r;
  }
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
      remember: mockRemember(message),
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
    remember: mockRemember(message),
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
    memory = [],
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
  const safeMemory = Array.isArray(memory) ? memory.map((m) => clip(String(m), 200)).filter(Boolean).slice(-20) : [];

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

  // Giliran pertama (belum ada respons AI di konteks) → struktural penuh.
  // Giliran lanjutan → percakapan natural (ayat/saran/doa hanya bila diminta).
  const turn = window.some((m) => m.role === 'assistant') ? 'followup' : 'first';
  const vmode = turn === 'first' ? 'structured' : 'conversational';

  const source = getSourceInstruction(requestCount);

  // Percobaan 1.
  let system = buildSystemPrompt({
    profile: safeProfile,
    temporal,
    recentMoods: safeMoods,
    sourceInstruction: source.instruction,
    lang: safeLang,
    turn,
    memory: safeMemory,
  });

  let parsed;
  try {
    parsed = await callSumopod({ system, window, message: userText, mockFamily: source.family, turn });
  } catch (err) {
    return { status: 502, body: { error: 'Gagal memanggil AI', detail: err.message } };
  }

  let valid = validateResponse(parsed, vmode);

  if (turn === 'first') {
    // Lapis 3: bila family salah atau struktur invalid, retry sekali dengan instruksi keras.
    const familyMismatch = valid.ok && valid.data.source_type !== source.family;
    if (!valid.ok || familyMismatch) {
      system = buildSystemPrompt({
        profile: safeProfile, temporal, recentMoods: safeMoods,
        sourceInstruction: getRetryInstruction(source), lang: safeLang, turn, memory: safeMemory,
      });
      try {
        parsed = await callSumopod({ system, window, message: userText, mockFamily: source.family, turn });
        valid = validateResponse(parsed, vmode);
      } catch (err) {
        if (!valid.ok) return { status: 502, body: { error: 'Gagal memanggil AI', detail: err.message } };
      }
    }
    if (!valid.ok) {
      return { status: 502, body: { error: 'Respons AI tidak valid', missing: valid.missing } };
    }
  } else {
    // Percakapan: bila tak valid (mis. "reply" kosong), retry sekali; lalu fallback halus.
    if (!valid.ok) {
      try {
        parsed = await callSumopod({ system, window, message: userText, mockFamily: source.family, turn });
        valid = validateResponse(parsed, vmode);
      } catch { /* abaikan, pakai fallback */ }
    }
    if (!valid.ok) {
      return {
        status: 200,
        body: {
          mode: 'conversational',
          reply: safeLang === 'en'
            ? "I'm here with you. Tell me more whenever you're ready."
            : 'Aku di sini menemanimu. Ceritakan lagi kapan pun kamu siap, ya.',
          offer: safeLang === 'en'
            ? 'If you like, I can share a relevant verse, a small tip, or a prayer — just say the word.'
            : 'Kalau mau, aku bisa temani dengan ayat, satu saran kecil, atau doa yang relevan — sebut saja.',
          meta: { turn, request_count: requestCount },
        },
      };
    }
    // Bila ada kutipan tapi family tak terbaca, pakai family yang diminta rotasi.
    if (valid.data.arabic && valid.data.source_type !== 'quran' && valid.data.source_type !== 'hadits') {
      valid.data.source_type = source.family;
    }
  }

  return {
    status: 200,
    body: {
      ...valid.data,
      meta: {
        turn,
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

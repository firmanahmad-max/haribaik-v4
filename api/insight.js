// insight.js — handler POST /api/insight: refleksi mingguan dari pola mood pengguna.

import { sumopodJson } from './sumopod.js';

const REQUIRED = ['judul', 'insight', 'saran', 'doa_arabic', 'doa_translation'];

function summarizeMoods(moods) {
  const counts = {};
  for (const m of moods) counts[m.mood] = (counts[m.mood] || 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const ringkas = ranked.map(([mood, n]) => `${mood} (${n}x)`).join(', ');
  const dominan = ranked[0]?.[0] || '-';
  return { ringkas, dominan, total: moods.length };
}

function buildInsightPrompt(moods, profile, topics) {
  const nama = (profile.nama || '').trim() || 'Sahabat';
  const peran = profile.peran ? ` Peran: ${profile.peran}.` : '';
  const usia = profile.usia ? ` Usia: ${profile.usia}.` : '';
  const { ringkas, dominan, total } = summarizeMoods(moods);
  const topicLine = topics && topics.length
    ? `\nHal yang sempat ia ceritakan minggu ini: ${topics.join('; ')}.`
    : '';

  return `TUGAS: Hasilkan satu objek JSON berisi refleksi mingguan untuk aplikasi "HariBaik" (konten motivasi Islami). Ini tugas pembuatan konten terstruktur, BUKAN percakapan. Kamu generator konten aplikasi.

Data mood pengguna (${total} catatan minggu ini) untuk ${nama}:${usia}${peran}
Ringkasan: ${ringkas}. Mood paling sering: ${dominan}.${topicLine}

Tulis refleksi yang hangat, empatik, dan tidak menggurui (di dalam field JSON). Kaitkan dengan nilai-nilai Islami (sabar, syukur, tawakal) secara halus. Bahasa Indonesia.

KELUARAN: HANYA satu objek JSON valid, tanpa teks lain, tanpa markdown. Struktur persis:
{
  "judul": "judul singkat refleksi (3-6 kata)",
  "insight": "2-4 kalimat membaca pola mood pengguna dengan empatik",
  "saran": "satu saran lembut & konkret untuk minggu depan",
  "doa_arabic": "doa pendek dalam Arab yang relevan",
  "doa_translation": "terjemahan doa dalam Bahasa Indonesia"
}`;
}

function validateInsight(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false };
  const missing = REQUIRED.filter((f) => !obj[f] || String(obj[f]).trim() === '');
  return missing.length ? { ok: false, missing } : { ok: true, data: obj };
}

function mockInsight(moods) {
  const { dominan, total } = summarizeMoods(moods);
  return {
    judul: 'Sepekan yang Kamu Lalui',
    insight: `Minggu ini kamu paling sering merasa ${dominan} (dari ${total} catatan). Itu wajar — perasaan datang dan pergi, dan kamu sudah hadir untuk dirimu dengan mencatatnya.`,
    saran: 'Pekan depan, sisihkan dua menit tiap pagi untuk menyebut satu hal yang kamu syukuri sebelum memulai aktivitas.',
    doa_arabic: 'اللَّهُمَّ اجْعَلْ خَيْرَ أَيَّامِي يَوْمَ أَلْقَاكَ',
    doa_translation: 'Ya Allah, jadikanlah hari terbaikku adalah hari ketika aku berjumpa dengan-Mu.',
  };
}

export async function handleInsight(body = {}) {
  const { moods = [], profile = {}, topics = [] } = body;
  const safeTopics = Array.isArray(topics)
    ? topics.map((t) => String(t || '').slice(0, 120)).filter(Boolean).slice(-8)
    : [];
  const safeMoods = Array.isArray(moods)
    ? moods
        .slice(-30)
        .map((m) => ({ day: String(m?.day || '').slice(0, 10), mood: String(m?.mood || '').slice(0, 20) }))
        .filter((m) => m.mood)
    : [];

  if (safeMoods.length < 1) {
    return { status: 400, body: { error: 'Belum ada data mood untuk dianalisis' } };
  }

  const safeProfile = {
    nama: String(profile.nama || '').slice(0, 40),
    usia: String(profile.usia || '').slice(0, 10),
    peran: String(profile.peran || '').slice(0, 60),
  };

  if (process.env.MOCK_AI === '1' || !process.env.SUMOPOD_API_KEY) {
    return { status: 200, body: mockInsight(safeMoods) };
  }

  let parsed;
  try {
    parsed = await sumopodJson(buildInsightPrompt(safeMoods, safeProfile, safeTopics), { maxTokens: 700 });
  } catch (err) {
    return { status: 502, body: { error: 'Gagal memanggil AI', detail: err.message } };
  }

  const v = validateInsight(parsed);
  if (!v.ok) return { status: 502, body: { error: 'Respons AI tidak valid' } };
  return { status: 200, body: v.data };
}

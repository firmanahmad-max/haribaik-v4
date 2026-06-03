// report.js — handler POST /api/report: laporan spiritual mingguan yang menyeluruh
// (menggabungkan pola mood + konsistensi ibadah + topik) menjadi refleksi terstruktur.

import { sumopodJson } from './sumopod.js';

const REQUIRED = ['judul', 'ringkasan', 'mood', 'ibadah', 'fokus', 'doa_arabic', 'doa_translation'];

function buildPrompt(data, lang) {
  const nama = (data.profile?.nama || '').trim() || 'Sahabat';
  const peran = data.profile?.peran ? ` Peran: ${data.profile.peran}.` : '';
  const langLine = lang === 'en'
    ? 'Tulis SEMUA field teks (judul, ringkasan, mood, ibadah, fokus, doa_translation) dalam Bahasa Inggris yang hangat. Pertahankan "doa_arabic" dalam huruf Arab.'
    : 'Tulis dalam Bahasa Indonesia yang hangat.';

  const moodStr = (data.moods || []).length
    ? Object.entries((data.moods || []).reduce((a, m) => { a[m] = (a[m] || 0) + 1; return a; }, {}))
        .sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} (${n}x)`).join(', ')
    : 'belum ada catatan mood';

  const d = data.deeds || {};
  const ibadahStr = `sholat: ${d.salatStreak || 0} hari beruntun (${d.salatDone || 0}/35 dari sepekan), tilawah: ${d.tilawahStreak || 0} hari beruntun (${d.tilawahDays || 0} hari), hari sempurna: ${d.perfectDays || 0}${d.puasaDays ? `, puasa: ${d.puasaDays} hari` : ''}`;

  const topics = (data.topics || []).length ? `\nHal yang sempat ia ceritakan: ${(data.topics || []).join('; ')}.` : '';
  const favLine = data.favCount ? `\nKutipan favorit tersimpan: ${data.favCount}.` : '';

  return `TUGAS: Hasilkan satu objek JSON berisi LAPORAN SPIRITUAL MINGGUAN untuk aplikasi "HariBaik" (aplikasi keislaman). Ini tugas pembuatan konten terstruktur, BUKAN percakapan. Kamu generator konten aplikasi.

Data sepekan terakhir untuk ${nama}.${peran}
- Mood: ${moodStr}
- Ibadah: ${ibadahStr}${favLine}${topics}

Buat laporan yang hangat, jujur, apresiatif terhadap usaha kecil, dan memotivasi tanpa menggurui. Kaitkan dengan nilai Islami (istiqomah, sabar, syukur, tawakal) secara halus. ${langLine}

KELUARAN: HANYA satu objek JSON valid, tanpa teks lain, tanpa markdown. Struktur persis:
{
  "judul": "judul singkat laporan (3-6 kata)",
  "ringkasan": "1-2 kalimat merangkum pekan ini secara menyeluruh",
  "mood": "2-3 kalimat membaca pola suasana hati dengan empatik",
  "ibadah": "2-3 kalimat mengapresiasi/mendorong konsistensi ibadah",
  "fokus": "satu fokus lembut & konkret untuk pekan depan",
  "doa_arabic": "doa pendek dalam Arab yang relevan",
  "doa_translation": "terjemahan doa"
}`;
}

function validate(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false };
  const missing = REQUIRED.filter((f) => !obj[f] || String(obj[f]).trim() === '');
  return missing.length ? { ok: false, missing } : { ok: true, data: obj };
}

function mockReport(data) {
  const d = data.deeds || {};
  return {
    judul: 'Laporan Pekanmu',
    ringkasan: `Pekan ini kamu hadir untuk dirimu — mencatat perasaan dan menjaga ibadah. Setiap langkah kecil berarti.`,
    mood: 'Suasana hatimu naik-turun, dan itu manusiawi. Kamu sudah berani jujur pada diri sendiri, dan itu langkah besar.',
    ibadah: `Streak sholatmu ${d.salatStreak || 0} hari dan tilawah ${d.tilawahStreak || 0} hari menunjukkan niat yang tulus. Istiqomah itu soal kembali, bukan kesempurnaan.`,
    fokus: 'Pekan depan, pilih satu amalan kecil dan jaga konsistensinya setiap hari, walau sederhana.',
    doa_arabic: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ',
    doa_translation: 'Ya Allah, tolonglah aku untuk mengingat-Mu, bersyukur kepada-Mu, dan beribadah dengan baik kepada-Mu.',
  };
}

export async function handleReport(body = {}) {
  const { moods = [], deeds = {}, favCount = 0, profile = {}, topics = [], lang = 'id' } = body;
  const safeLang = lang === 'en' ? 'en' : 'id';
  const safe = {
    moods: Array.isArray(moods) ? moods.slice(-60).map((m) => String(m || '').slice(0, 20)).filter(Boolean) : [],
    deeds: {
      salatStreak: Number(deeds.salatStreak) || 0,
      salatDone: Number(deeds.salatDone) || 0,
      tilawahStreak: Number(deeds.tilawahStreak) || 0,
      tilawahDays: Number(deeds.tilawahDays) || 0,
      perfectDays: Number(deeds.perfectDays) || 0,
      puasaDays: Number(deeds.puasaDays) || 0,
    },
    favCount: Number(favCount) || 0,
    profile: { nama: String(profile.nama || '').slice(0, 40), peran: String(profile.peran || '').slice(0, 60) },
    topics: Array.isArray(topics) ? topics.map((x) => String(x || '').slice(0, 120)).filter(Boolean).slice(-8) : [],
  };

  if (!safe.moods.length && !safe.deeds.salatDone && !safe.deeds.tilawahDays) {
    return { status: 400, body: { error: 'Belum cukup data untuk membuat laporan' } };
  }

  if (process.env.MOCK_AI === '1' || !process.env.SUMOPOD_API_KEY) {
    return { status: 200, body: mockReport(safe) };
  }

  let parsed;
  try {
    parsed = await sumopodJson(buildPrompt(safe, safeLang), { maxTokens: 800 });
  } catch (err) {
    return { status: 502, body: { error: 'Gagal memanggil AI', detail: err.message } };
  }
  const v = validate(parsed);
  if (!v.ok) return { status: 502, body: { error: 'Respons AI tidak valid' } };
  return { status: 200, body: v.data };
}

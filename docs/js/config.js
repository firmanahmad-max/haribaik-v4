// config.js — konfigurasi klien.
// Ganti BACKEND_URL ke URL Railway produksi saat deploy.
// Saat dijalankan di localhost, otomatis pakai server lokal.

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const BACKEND_URL = isLocal
  ? 'http://localhost:3000'
  : 'https://haribaik-v4-production.up.railway.app';

// Supabase (Fase 4). Anon key aman ditaruh di frontend — keamanan data dijaga RLS.
// Isi setelah membuat project Supabase + menjalankan supabase/schema.sql.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

export const MOODS = ['Senang', 'Sedih', 'Cemas', 'Kesal', 'Bersyukur', 'Lelah'];

// Metadata mood terpusat (emoji, warna, skor valensi 1-5) — dipakai chat & jurnal.
export const MOOD_META = {
  Senang: { emoji: '😊', color: '#f4c430', score: 5 },
  Sedih: { emoji: '😢', color: '#5b8def', score: 1 },
  Cemas: { emoji: '😟', color: '#b06bd6', score: 2 },
  Kesal: { emoji: '😣', color: '#e0664f', score: 2 },
  Bersyukur: { emoji: '🤲', color: '#2d9b6e', score: 5 },
  Lelah: { emoji: '😮‍💨', color: '#8a9a92', score: 3 },
};

// Label + kelas badge untuk sumber kutipan.
export function badgeFor(sourceType) {
  const t = (sourceType || '').toLowerCase();
  if (t === 'quran') return { cls: 'quran', label: 'Al-Quran' };
  if (t === 'doa') return { cls: 'doa', label: 'Doa' };
  return { cls: 'hadits', label: 'Hadits' };
}

export const QUICK_REPLIES = [
  'Ceritakan lebih banyak',
  'Beri aku doa lagi',
  'Bagaimana caranya?',
  'Terima kasih 🙏',
];

// config.js — konfigurasi klien.
// Ganti BACKEND_URL ke URL Railway produksi saat deploy.
// Saat dijalankan di localhost, otomatis pakai server lokal.

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const BACKEND_URL = isLocal
  ? 'http://localhost:3000'
  : 'https://haribaik-v4-production.up.railway.app';

// Supabase (Fase 4). Anon key aman ditaruh di frontend — keamanan data dijaga RLS.
// Isi setelah membuat project Supabase + menjalankan supabase/schema.sql.
export const SUPABASE_URL = 'https://syiqxvnsvvzmhcumyzed.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5aXF4dm5zdnZ6bWhjdW15emVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0OTc2NDQsImV4cCI6MjA5NjA3MzY0NH0.FRKPcZH1OCTCtGgPHSZEl8jiWnsaqTEhoDHNyBUzrS0';

// VAPID public key untuk Web Push (private key ada di env backend, JANGAN di sini).
// Hasilkan pasangan baru dengan: node scripts/gen-vapid.mjs
export const VAPID_PUBLIC_KEY = 'BHjhKOQQKn6jpbBP3nqlKEYRvUcyAvgcfrfTtgHVG0ha9aIjPzRGxh0x4JvEC0g-FDaSr6-MKR7D-uy28_9TIZ0';

// Versi app (selaras dgn cache Service Worker) — dipakai monitoring error.
export const APP_VERSION = 'v4-41';

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

// config.js — konfigurasi klien.
// Ganti BACKEND_URL ke URL Railway produksi saat deploy.
// Saat dijalankan di localhost, otomatis pakai server lokal.

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const BACKEND_URL = isLocal
  ? 'http://localhost:3000'
  : 'https://haribaik-v4-production.up.railway.app';

export const MOODS = ['Senang', 'Sedih', 'Cemas', 'Kesal', 'Bersyukur', 'Lelah'];

export const QUICK_REPLIES = [
  'Ceritakan lebih banyak',
  'Beri aku doa lagi',
  'Bagaimana caranya?',
  'Terima kasih 🙏',
];

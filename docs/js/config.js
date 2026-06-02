// config.js — konfigurasi klien.
// Ganti BACKEND_URL ke URL Railway produksi saat deploy.
// Saat dijalankan di localhost, otomatis pakai server lokal.

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

export const BACKEND_URL = isLocal
  ? 'http://localhost:3000'
  : 'https://goodday-app-v3-production.up.railway.app'; // TODO: ganti ke backend HariBaik V4

export const MOODS = ['Senang', 'Sedih', 'Cemas', 'Kesal', 'Bersyukur', 'Lelah'];

export const QUICK_REPLIES = [
  'Ceritakan lebih banyak',
  'Beri aku doa lagi',
  'Bagaimana caranya?',
  'Terima kasih 🙏',
];

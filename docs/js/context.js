// context.js — konteks temporal: waktu (Pagi/Siang/Sore/Malam), tanggal Hijriyah,
// hari, dan streak counter harian.

import { Meta } from './db.js';

export function timeOfDay(d = new Date()) {
  const h = d.getHours();
  if (h >= 4 && h < 11) return 'Pagi';
  if (h >= 11 && h < 15) return 'Siang';
  if (h >= 15 && h < 18) return 'Sore';
  return 'Malam';
}

const WAKTU_ICON = { Pagi: '🌅', Siang: '☀️', Sore: '🌇', Malam: '🌙' };

export function hariName(d = new Date()) {
  return ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][d.getDay()];
}

// Nama bulan Hijriyah (Bahasa Indonesia) — dipetakan manual dari NOMOR bulan agar
// tidak bergantung pada lokalisasi browser. Sebagian Android salah melokalkan nama
// bulan kalender islam memakai tabel nama bulan Masehi (mis. bulan ke-12 -> "Desember").
const HIJRI_MONTHS = [
  'Muharam', 'Safar', 'Rabiulawal', 'Rabiulakhir', 'Jumadilawal', 'Jumadilakhir',
  'Rajab', 'Syakban', 'Ramadan', 'Syawal', 'Zulkaidah', 'Zulhijah',
];

// Tanggal Hijriyah via Intl (kalender islamic-umalqura, standar Indonesia) — tanpa library.
// Ambil hari/bulan(angka)/tahun, lalu susun string sendiri + " H".
export function hijriDate(d = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      calendar: 'islamic-umalqura',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    // Guard: jika engine tidak menerapkan kalender islam, jangan tampilkan (hindari fallback Masehi).
    if (!fmt.resolvedOptions().calendar.includes('islamic')) return '';
    const parts = fmt.formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
    const day = parseInt(get('day'), 10);
    const monthNum = parseInt(get('month'), 10);
    const year = get('year').replace(/\D/g, ''); // buang era bila ikut terbawa
    if (!day || !monthNum || !year || !HIJRI_MONTHS[monthNum - 1]) return '';
    return `${day} ${HIJRI_MONTHS[monthNum - 1]} ${year} H`;
  } catch {
    return '';
  }
}

// Nomor bulan Hijriyah (1-12; Ramadan = 9) dan tahun Hijriyah.
export function hijriMonth(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { calendar: 'islamic-umalqura', month: 'numeric' }).formatToParts(d);
    return parseInt(parts.find((p) => p.type === 'month')?.value, 10) || 0;
  } catch {
    return 0;
  }
}
export function hijriYear(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { calendar: 'islamic-umalqura', year: 'numeric' }).formatToParts(d);
    return parseInt((parts.find((p) => p.type === 'year')?.value || '').replace(/\D/g, ''), 10) || 0;
  } catch {
    return 0;
  }
}

// Tanggal Masehi (untuk ditampilkan saat chip Hijriyah diketuk).
export function gregorianDate(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return '';
  }
}

export function buildTemporal(d = new Date()) {
  const waktu = timeOfDay(d);
  return {
    waktu,
    icon: WAKTU_ICON[waktu],
    hari: hariName(d),
    hijri: hijriDate(d),
  };
}

// Streak: bertambah bila user aktif di hari berbeda berturut-turut.
export async function touchStreak() {
  const today = new Date().toDateString();
  const last = await Meta.get('lastActiveDay', null);
  let streak = (await Meta.get('streak', 0)) || 0;

  if (last === today) return streak; // sudah dihitung hari ini

  const yesterday = new Date(Date.now() - 86400000).toDateString();
  streak = last === yesterday ? streak + 1 : 1;

  await Meta.set('lastActiveDay', today);
  await Meta.set('streak', streak);
  return streak;
}

export async function getStreak() {
  return (await Meta.get('streak', 0)) || 0;
}

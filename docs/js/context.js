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

// Tanggal Hijriyah via Intl (kalender islamic-umalqura, standar Indonesia) — tanpa library.
// Ambil bagian tanggal secara eksplisit lalu tambahkan " H" manual, agar era tidak bocor
// menjadi "SM"/"M" dan nama bulan Masehi tidak muncul di sebagian browser.
export function hijriDate(d = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat('id-ID', {
      calendar: 'islamic-umalqura',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    // Guard: jika engine tidak menerapkan kalender islam, jangan tampilkan (hindari fallback Masehi).
    if (!fmt.resolvedOptions().calendar.includes('islamic')) return '';
    const parts = fmt.formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
    const day = get('day');
    const month = get('month');
    const year = get('year');
    if (!day || !month || !year) return '';
    return `${day} ${month} ${year} H`;
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

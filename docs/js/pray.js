// pray.js — jadwal sholat otomatis via Aladhan API (metode Kemenag/Indonesia, method=20),
// dengan cache harian per lokasi agar tetap jalan offline setelah sekali ambil.

import { Meta, dayKey } from './db.js';

// Kota besar Indonesia sebagai fallback bila geolokasi ditolak.
export const CITIES = [
  { name: 'Jakarta', lat: -6.2088, lng: 106.8456 },
  { name: 'Bandung', lat: -6.9175, lng: 107.6191 },
  { name: 'Surabaya', lat: -7.2575, lng: 112.7521 },
  { name: 'Medan', lat: 3.5952, lng: 98.6722 },
  { name: 'Semarang', lat: -6.9667, lng: 110.4167 },
  { name: 'Makassar', lat: -5.1477, lng: 119.4327 },
  { name: 'Yogyakarta', lat: -7.7956, lng: 110.3695 },
  { name: 'Palembang', lat: -2.9761, lng: 104.7754 },
  { name: 'Denpasar', lat: -8.6705, lng: 115.2126 },
  { name: 'Balikpapan', lat: -1.2379, lng: 116.8529 },
  { name: 'Banda Aceh', lat: 5.5483, lng: 95.3238 },
  { name: 'Pontianak', lat: -0.0263, lng: 109.3425 },
];

export function getCurrentCoords() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolokasi tidak didukung perangkat ini'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 10000, maximumAge: 3600000 }
    );
  });
}

// Urutan tampilan + pemetaan ke field Aladhan.
const KEYS = [
  ['Imsak', 'Imsak'],
  ['Subuh', 'Fajr'],
  ['Terbit', 'Sunrise'],
  ['Dzuhur', 'Dhuhr'],
  ['Ashar', 'Asr'],
  ['Maghrib', 'Maghrib'],
  ['Isya', 'Isha'],
];

/**
 * Ambil jadwal sholat hari ini untuk koordinat tertentu (dengan cache harian).
 * @returns {Promise<Record<string,string>>} mis. { Subuh:'04:34', ... }
 */
export async function getTimings(lat, lng, date = new Date()) {
  const day = dayKey(date.getTime());
  const cacheKey = `prayer:${day}:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = await Meta.get(cacheKey, null);
  if (cached) return cached;

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const url = `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}?latitude=${lat}&longitude=${lng}&method=20`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Gagal mengambil jadwal sholat');
  const json = await res.json();
  const t = json?.data?.timings || {};
  const result = {};
  for (const [label, key] of KEYS) result[label] = String(t[key] || '').slice(0, 5);
  if (!result.Subuh) throw new Error('Jadwal tidak tersedia');

  await Meta.set(cacheKey, result);
  return result;
}

export const PRAYER_ORDER = KEYS.map((k) => k[0]);

// Reverse-geocode koordinat → nama kota (BigDataCloud, gratis tanpa key).
export async function reverseGeocode(lat, lng) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=id`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    return j.city || j.locality || j.principalSubdivision || null;
  } catch {
    return null;
  }
}

// memory.js — memori jangka panjang AI (per pengguna, di perangkat + tersinkron cloud).
// AI menitipkan fakta durable lewat field "remember" pada respons yang SUDAH ADA
// (tanpa panggilan API tambahan → hemat token). Fakta dipakai kembali di prompt
// berikutnya agar AI terasa "mengenalmu" lintas percakapan.

import { Meta } from './db.js';

const KEY = 'aiMemory';
const MAX = 20; // batasi agar prompt tetap ringkas & hemat token

export async function getMemory() {
  const arr = await Meta.get(KEY, []);
  return Array.isArray(arr) ? arr : [];
}

export async function memoryStrings() {
  return (await getMemory()).map((m) => m.text).filter(Boolean);
}

// Tambah fakta baru. Dedupe (abaikan bila sudah ada yang identik/serupa),
// simpan yang terbaru, batasi MAX (buang yang paling lama).
export async function addMemory(text) {
  const clean = String(text || '').trim().slice(0, 200);
  if (!clean || clean.length < 4) return;
  const list = await getMemory();
  const low = clean.toLowerCase();
  // Serupa jika salah satu memuat yang lain (hindari duplikat mirip).
  if (list.some((m) => { const e = m.text.toLowerCase(); return e === low || e.includes(low) || low.includes(e); })) return;
  list.push({ text: clean, ts: Date.now() });
  const trimmed = list.slice(-MAX);
  await Meta.set(KEY, trimmed);
}

export async function removeMemory(ts) {
  const list = (await getMemory()).filter((m) => m.ts !== ts);
  await Meta.set(KEY, list);
}

export async function clearMemory() {
  await Meta.set(KEY, []);
}

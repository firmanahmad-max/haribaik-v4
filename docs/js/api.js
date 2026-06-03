// api.js — wrapper pemanggilan backend /api/chat.

import { BACKEND_URL } from './config.js';

/**
 * @param {object} payload { message, mood, history, profile, temporal, requestCount, recentMoods }
 * @returns {Promise<object>} respons terstruktur dari AI (+ meta)
 */
export async function postChat(payload) {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Gagal jaringan (offline / server tak terjangkau).
    const err = new Error('network');
    err.status = 0;
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Server error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Laporan spiritual mingguan (mood + ibadah). */
export async function postReport(payload) {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    const err = new Error('network');
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Server error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Refleksi mingguan dari pola mood. */
export async function postInsight(payload) {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/insight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    const err = new Error('network');
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Server error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

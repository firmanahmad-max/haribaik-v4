// api.js — wrapper pemanggilan backend /api/chat.

import { BACKEND_URL } from './config.js';

/**
 * @param {object} payload { message, mood, history, profile, temporal, requestCount, recentMoods }
 * @returns {Promise<object>} respons terstruktur dari AI (+ meta)
 */
export async function postChat(payload) {
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Server error ${res.status}`);
  }
  return data;
}

// sumopod.js — pemanggil Sumopod generik yang mengembalikan JSON (assistant-prefill "{").
// Dipakai oleh endpoint yang butuh keluaran JSON (mis. /api/insight).

import { extractFirstJsonObject } from './parse.js';

const SUMOPOD_URL = 'https://ai.sumopod.com/v1/messages';
const MODEL = 'claude-haiku-4-5';

/**
 * @param {string} userContent prompt lengkap (instruksi + data) di dalam pesan user.
 * @param {{maxTokens?: number}} [opts]
 * @returns {Promise<object>} JSON ter-parse
 */
export async function sumopodJson(userContent, { maxTokens = 700 } = {}) {
  const res = await fetch(SUMOPOD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.SUMOPOD_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: '{' },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Sumopod ${res.status}: ${detail.slice(0, 200)}`);
  }

  const result = await res.json();
  const text = (result?.content?.[0]?.text ?? '').trim();
  try {
    return extractFirstJsonObject(text);
  } catch {
    return extractFirstJsonObject('{' + text);
  }
}

// sumopod.js — pemanggil Sumopod generik yang mengembalikan JSON.
// Dipakai oleh endpoint yang butuh keluaran JSON (mis. /api/insight, /api/report).
// Sumopod kini OpenAI/LiteLLM-compatible (Anthropic /v1/messages sudah 404); keluaran
// JSON dipaksa lewat instruksi prompt, bukan assistant-prefill.

import { extractFirstJsonObject } from './parse.js';

const SUMOPOD_URL = 'https://ai.sumopod.com/v1/chat/completions';
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
      Authorization: `Bearer ${process.env.SUMOPOD_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Sumopod ${res.status}: ${detail.slice(0, 200)}`);
  }

  const result = await res.json();
  const text = (result?.choices?.[0]?.message?.content ?? '').trim();
  try {
    return extractFirstJsonObject(text);
  } catch {
    return extractFirstJsonObject('{' + text);
  }
}

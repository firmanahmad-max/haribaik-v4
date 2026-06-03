// server.js — entry point untuk Railway. HTTP server vanilla (tanpa Express),
// menyalin gaya V3: CORS allowlist + routing manual.

import http from 'node:http';
import { handleChat } from './api/chat.js';
import { handleInsight } from './api/insight.js';
import { handleReport } from './api/report.js';
import { handlePushTest } from './api/push.js';
import { startScheduler } from './api/scheduler.js';

const PORT = process.env.PORT || 3000;

// --- Rate limit sederhana per-IP (in-memory, sliding window) ---
const RL_MAX = Number(process.env.RATE_LIMIT_MAX || 20); // maks request
const RL_WINDOW = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000); // per jendela (ms)
const rlHits = new Map(); // ip -> number[] timestamps

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const arr = (rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW);
  arr.push(now);
  rlHits.set(ip, arr);
  // Prune sesekali agar Map tidak membengkak.
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) if (!v.some((t) => now - t < RL_WINDOW)) rlHits.delete(k);
  }
  return arr.length > RL_MAX;
}

const ALLOWED_ORIGINS = new Set([
  'https://firmanahmad-max.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:5500', // Live Server (VS Code)
  'http://localhost:5500',
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooBig) return reject(new Error('Body terlalu besar'));
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    return sendJson(res, 200, { status: 'HariBaik API running', version: '4.0' });
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    if (isRateLimited(clientIp(req))) {
      return sendJson(res, 429, { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
    }
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    try {
      const { status, body: out } = await handleChat(body);
      return sendJson(res, status, out);
    } catch (err) {
      return sendJson(res, 500, { error: 'Kesalahan server', detail: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/insight') {
    if (isRateLimited(clientIp(req))) {
      return sendJson(res, 429, { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
    }
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    try {
      const { status, body: out } = await handleInsight(body);
      return sendJson(res, status, out);
    } catch (err) {
      return sendJson(res, 500, { error: 'Kesalahan server', detail: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/push/test') {
    if (isRateLimited(clientIp(req))) {
      return sendJson(res, 429, { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
    }
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    try {
      const { status, body: out } = await handlePushTest(body);
      return sendJson(res, status, out);
    } catch (err) {
      return sendJson(res, 500, { error: 'Kesalahan server', detail: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/report') {
    if (isRateLimited(clientIp(req))) {
      return sendJson(res, 429, { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
    }
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    try {
      const { status, body: out } = await handleReport(body);
      return sendJson(res, status, out);
    } catch (err) {
      return sendJson(res, 500, { error: 'Kesalahan server', detail: err.message });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  const mode = process.env.MOCK_AI === '1' || !process.env.SUMOPOD_API_KEY ? 'MOCK' : 'LIVE';
  console.log(`HariBaik API v4.0 listening on :${PORT} [AI mode: ${mode}]`);
  startScheduler(); // notifikasi latar (adzan + pengingat); no-op bila env belum lengkap
});

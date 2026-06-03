// webpush.js — Web Push murni Node (tanpa dependency npm).
// Mengimplementasikan VAPID (RFC 8292, ES256) + enkripsi payload aes128gcm
// (RFC 8291 + RFC 8188) memakai node:crypto.

import crypto from 'node:crypto';

const B = (s) => Buffer.from(s, 'base64url');
const b64 = (buf) => Buffer.from(buf).toString('base64url');

// ---------- VAPID ----------
// Rekonstruksi KeyObject privat EC P-256 dari kunci VAPID (public 65-byte point,
// private 32-byte d), keduanya base64url.
function vapidPrivateKey(publicB64, privateB64) {
  const pub = B(publicB64); // 0x04 || X(32) || Y(32)
  const x = b64(pub.subarray(1, 33));
  const y = b64(pub.subarray(33, 65));
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x, y, d: privateB64 },
    format: 'jwk',
  });
}

// Bangun header Authorization: `vapid t=<jwt>, k=<public>`
export function vapidAuthHeader(endpoint, { publicKey, privateKey, subject }) {
  const aud = new URL(endpoint).origin;
  const header = b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject || 'mailto:admin@haribaik.app',
  }));
  const signingInput = `${header}.${payload}`;
  const key = vapidPrivateKey(publicKey, privateKey);
  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  const jwt = `${signingInput}.${b64(sig)}`;
  return `vapid t=${jwt}, k=${publicKey}`;
}

// ---------- Enkripsi payload (aes128gcm) ----------
const hkdf = (ikm, salt, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

export function encryptPayload(p256dh, auth, payload) {
  const uaPublic = B(p256dh);     // 65 byte
  const authSecret = B(auth);     // 16 byte
  const plaintext = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');

  // Keypair efemeral server.
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey(); // 65 byte
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  // IKM = HKDF(salt=authSecret, ikm=ecdhSecret, info="WebPush: info\0"||uaPub||serverPub, 32)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, serverPublic]);
  const ikm = hkdf(ecdhSecret, authSecret, keyInfo, 32);

  const salt = crypto.randomBytes(16);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

  // Satu record: plaintext || 0x02 (delimiter padding record terakhir).
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const padded = Buffer.concat([plaintext, Buffer.from([0x02])]);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Header aes128gcm: salt(16) || rs(4 BE) || idlen(1) || keyid(serverPublic 65).
  const rs = 4096;
  const header = Buffer.alloc(16 + 4 + 1 + serverPublic.length);
  salt.copy(header, 0);
  header.writeUInt32BE(rs, 16);
  header.writeUInt8(serverPublic.length, 20);
  serverPublic.copy(header, 21);

  return Buffer.concat([header, ciphertext, tag]);
}

// ---------- Kirim ----------
// subscription: { endpoint, keys: { p256dh, auth } }
// vapid: { publicKey, privateKey, subject }
// Mengembalikan { ok, status }. status 404/410 → langganan kedaluwarsa (hapus).
export async function sendPush(subscription, payload, vapid, { ttl = 2419200 } = {}) {
  const { endpoint, keys } = subscription;
  const body = encryptPayload(keys.p256dh, keys.auth, payload);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': String(ttl),
      'Authorization': vapidAuthHeader(endpoint, vapid),
    },
    body,
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

export function vapidFromEnv() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || 'mailto:admin@haribaik.app' };
}

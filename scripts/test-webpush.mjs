// test-webpush.mjs — verifikasi crypto Web Push secara offline:
// 1) Enkripsi payload lalu DEKRIPSI sebagai UA (round-trip) → harus identik.
// 2) Verifikasi tanda tangan VAPID JWT dengan kunci publik.
// Jalankan: node scripts/test-webpush.mjs
import crypto from 'node:crypto';
import { encryptPayload, vapidAuthHeader } from '../api/webpush.js';

const b64 = (b) => Buffer.from(b).toString('base64url');
const B = (s) => Buffer.from(s, 'base64url');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

// ---- 1) Round-trip enkripsi (simulasi UA) ----
const ua = crypto.createECDH('prime256v1');
ua.generateKeys();
const p256dh = b64(ua.getPublicKey());
const authSecret = crypto.randomBytes(16);
const auth = b64(authSecret);

const message = 'HariBaik 🌿 — اللّٰهُ أَكْبَر, waktunya Subuh.';
const body = encryptPayload(p256dh, auth, message);

// Bongkar header aes128gcm.
const salt = body.subarray(0, 16);
const idlen = body.readUInt8(20);
const serverPublic = body.subarray(21, 21 + idlen);
const ciphertextWithTag = body.subarray(21 + idlen);
const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);

// Turunkan ulang kunci dari sisi UA.
const ecdhSecret = ua.computeSecret(serverPublic);
const hkdf = (ikm, s, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, len));
const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), serverPublic]);
const ikm = hkdf(ecdhSecret, authSecret, keyInfo, 32);
const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);

const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
decipher.setAuthTag(tag);
let dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
// Buang padding delimiter 0x02 di akhir.
while (dec.length && dec[dec.length - 1] === 0x02) dec = dec.subarray(0, dec.length - 1);

console.log('Test 1: round-trip enkripsi aes128gcm');
ok(dec.toString('utf8') === message, 'payload terdekripsi identik dengan aslinya');

// ---- 2) VAPID JWT valid & terverifikasi ----
console.log('Test 2: VAPID JWT (ES256)');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwkPub = publicKey.export({ format: 'jwk' });
const pubPoint = b64(Buffer.concat([Buffer.from([0x04]), B(jwkPub.x), B(jwkPub.y)]));
const privD = privateKey.export({ format: 'jwk' }).d;

const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
const header = vapidAuthHeader(endpoint, { publicKey: pubPoint, privateKey: privD, subject: 'mailto:t@t.io' });
ok(header.startsWith('vapid t='), 'format header `vapid t=..., k=...`');

const m = header.match(/^vapid t=([^,]+), k=(.+)$/);
const [h, p, s] = m[1].split('.');
const signingInput = `${h}.${p}`;
const verifyKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwkPub.x, y: jwkPub.y }, format: 'jwk' });
const valid = crypto.verify('sha256', Buffer.from(signingInput), { key: verifyKey, dsaEncoding: 'ieee-p1363' }, B(s));
ok(valid, 'tanda tangan JWT terverifikasi dengan kunci publik');

const payload = JSON.parse(B(p).toString('utf8'));
ok(payload.aud === 'https://fcm.googleapis.com', 'aud = origin endpoint');
ok(payload.exp > Math.floor(Date.now() / 1000), 'exp di masa depan');
ok(m[2] === pubPoint, 'k = kunci publik VAPID');

console.log(`\n${fail === 0 ? '✅ SEMUA LULUS' : '❌ ADA GAGAL'}  (${pass} lulus, ${fail} gagal)`);
process.exit(fail === 0 ? 0 : 1);

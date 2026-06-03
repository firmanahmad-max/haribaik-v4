// gen-vapid.mjs — buat sepasang kunci VAPID untuk Web Push (sekali saja).
// Jalankan: node scripts/gen-vapid.mjs
// PUBLIC → docs/js/config.js (VAPID_PUBLIC_KEY).  PRIVATE → env Railway (VAPID_PRIVATE_KEY).
import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwkPriv = privateKey.export({ format: 'jwk' });
const jwkPub = publicKey.export({ format: 'jwk' });

// Public key sebagai titik tak-terkompres 65 byte (0x04 || X || Y), base64url.
const x = Buffer.from(jwkPub.x, 'base64url');
const y = Buffer.from(jwkPub.y, 'base64url');
const pub = Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64url');
const priv = jwkPriv.d; // 32 byte d, sudah base64url

console.log('VAPID_PUBLIC_KEY =', pub);
console.log('VAPID_PRIVATE_KEY =', priv);

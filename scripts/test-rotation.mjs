// test-rotation.mjs — verifikasi logika rotasi Quran/Hadits.
// Jalankan: npm run test:rotation
// Memakai mode mock (tidak perlu API key) agar logika rotasi & validasi teruji offline.

process.env.MOCK_AI = process.env.MOCK_AI ?? '1';

import { handleChat } from '../api/chat.js';
import { ROTATION_PATTERN, getSourceInstruction } from '../api/rotation.js';

const TURNS = 10;
let failures = 0;

console.log(`\nMenguji ${TURNS} request berurutan (mode MOCK)\n`);
console.log('count | requested        | family  | got     | match');
console.log('------+------------------+---------+---------+------');

for (let i = 0; i < TURNS; i++) {
  const expected = getSourceInstruction(i);
  const { status, body } = await handleChat({
    message: 'Aku sedang banyak pikiran hari ini.',
    requestCount: i,
  });

  const got = body.source_type ?? '(error)';
  const match = status === 200 && got === expected.family;
  if (!match) failures++;

  console.log(
    `${String(i).padStart(5)} | ${expected.key.padEnd(16)} | ${expected.family.padEnd(7)} | ` +
      `${String(got).padEnd(7)} | ${match ? 'OK' : 'FAIL'}`
  );
}

// Cek juga distribusi: pola 8-langkah punya 3 QURAN + 5 hadits-family.
const families = ROTATION_PATTERN.map((_, i) => getSourceInstruction(i).family);
const quran = families.filter((f) => f === 'quran').length;
const hadits = families.filter((f) => f === 'hadits').length;

console.log(`\nDistribusi 1 siklus pola (${ROTATION_PATTERN.length} langkah): quran=${quran}, hadits=${hadits}`);
console.log(failures === 0 ? '\n✅ Semua turn lolos.\n' : `\n❌ ${failures} turn gagal.\n`);

process.exit(failures === 0 ? 0 : 1);

// test-parse.mjs — unit test untuk parse.js (extractFirstJsonObject + validateResponse).
// Jalankan: npm run test:parse

import assert from 'node:assert/strict';
import { extractFirstJsonObject, validateResponse } from '../api/parse.js';

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    fail++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

const fullResponse = {
  empati: 'a', source_type: 'quran', arabic: 'ا', translation: 't',
  source: 'Al-Baqarah:286', aksi: 'x', doa_arabic: 'د', doa_translation: 'd',
};

console.log('\nextractFirstJsonObject');
test('JSON polos', () => assert.deepEqual(extractFirstJsonObject('{"a":1}'), { a: 1 }));
test('teks pembuka sebelum JSON', () => assert.deepEqual(extractFirstJsonObject('bla bla {"a":1} sisa'), { a: 1 }));
test('terbungkus pagar ```json', () => assert.deepEqual(extractFirstJsonObject('```json\n{"a":1}\n```'), { a: 1 }));
test('objek bersarang', () => assert.deepEqual(extractFirstJsonObject('{"a":{"b":2}}'), { a: { b: 2 } }));
test('kurung di dalam string tidak mengacaukan', () => assert.deepEqual(extractFirstJsonObject('{"a":"}{"}'), { a: '}{' }));
test('escape kutip dalam string', () => assert.deepEqual(extractFirstJsonObject('{"a":"he said \\"hi\\""}'), { a: 'he said "hi"' }));
test('mengambil objek pertama saja', () => assert.deepEqual(extractFirstJsonObject('{"a":1}{"b":2}'), { a: 1 }));
test('JSON tidak lengkap → error', () => assert.throws(() => extractFirstJsonObject('{"a":')));
test('tanpa objek → error', () => assert.throws(() => extractFirstJsonObject('halo dunia')));
test('input bukan string → error', () => assert.throws(() => extractFirstJsonObject(null)));

console.log('\nvalidateResponse');
test('respons lengkap valid', () => {
  const r = validateResponse(fullResponse);
  assert.equal(r.ok, true);
  assert.equal(r.data.source_type, 'quran');
});
test('source_type huruf besar dinormalkan', () => {
  const r = validateResponse({ ...fullResponse, source_type: 'HADITS' });
  assert.equal(r.ok, true);
  assert.equal(r.data.source_type, 'hadits');
});
test('field hilang → tidak valid', () => {
  const { aksi, ...partial } = fullResponse;
  const r = validateResponse(partial);
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('aksi'));
});
test('field kosong dianggap hilang', () => {
  const r = validateResponse({ ...fullResponse, empati: '   ' });
  assert.equal(r.ok, false);
});
test('source_type tidak valid → ditolak', () => {
  const r = validateResponse({ ...fullResponse, source_type: 'atsar' });
  assert.equal(r.ok, false);
});
test('bukan objek → tidak valid', () => assert.equal(validateResponse(null).ok, false));

console.log(`\n${fail === 0 ? '✅' : '❌'} parse: ${pass} lolos, ${fail} gagal\n`);
process.exit(fail === 0 ? 0 : 1);

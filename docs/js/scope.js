// scope.js — guardrail klien untuk Chat HariBaik.
// Tujuan: tolak permintaan yang JELAS di luar konteks (jadi tidak boros token API).
// Strategi: kata kunci spesifik + frasa eksplisit yang TIDAK mungkin muncul dalam
// percakapan biasa pengguna. Tidak terlalu agresif — biarkan pertanyaan keseharian
// & spiritual lolos ke AI.

const OFF_TOPIC = [
  // === Permintaan pembuatan konten panjang (klasik "hit token") ===
  { rx: /\b(buatkan|buatin|bikin|tolong\s+buatkan|tulisin|tulis(?:kan)?)\s+(?:saya|aku\s+)?(?:prd|brd|srs|product\s+requirement|business\s+requirement|spec(?:ification)?|spesifikasi|dokumen\s+(?:prd|teknis|produk))\b/i, why: 'doc' },
  { rx: /\b(prd|brd|spec\s+sheet|spesifikasi\s+produk|dokumen\s+teknis|technical\s+document|whitepaper|white\s+paper|business\s+plan|rencana\s+bisnis)\b/i, why: 'doc' },
  { rx: /\b(buatkan|bikin|tulis(?:kan)?)\s+(?:saya|aku\s+)?(?:artikel|esai|essay|blog|skripsi|tesis|makalah|paper|laporan|proposal|presentasi|pidato|cerpen|novel|cerita|puisi(?:\s+panjang)?|naskah|script)\b/i, why: 'content' },
  // === Coding & teknis pemrograman ===
  { rx: /\b(buatkan|bikin|tulis(?:kan)?|coding|ngoding)\s+(?:saya|aku\s+)?(?:kode|code|program|aplikasi|app|website|web|api|fungsi|function|script|html|css|javascript|python|java\b|sql)\b/i, why: 'code' },
  { rx: /\b(?:debug(?:ging)?|stack\s*trace|compile\s*error|syntax\s*error)\b/i, why: 'code' },
  // === Tugas akademik / sekolah ===
  { rx: /\b(?:jawab|kerjakan|selesaikan)\s+(?:soal|tugas|pr|ujian|essay|esai|matematika|fisika|kimia|biologi|kalkulus|aljabar)\b/i, why: 'homework' },
  { rx: /\b(?:translate|terjemahkan|terjemahin)\s+(?:ini\s+)?(?:ke|dari|seluruh|panjang)/i, why: 'translate' },
  // === Politik & berita ===
  { rx: /\b(?:siapa\s+presiden|capres|pemilu|pilpres|partai\s+politik|berita\s+(?:terkini|hari\s+ini))\b/i, why: 'news' },
  // === Saham/kripto/judi ===
  { rx: /\b(?:rekomendasi(?:kan)?|prediksi|analisis|saran)\s+(?:saham|crypto|kripto|bitcoin|forex|trading|judi|togel|slot)\b/i, why: 'finance' },
  // === Resep, gosip, hiburan ===
  { rx: /\b(?:resep|cara\s+masak|cara\s+memasak)\s+\w+/i, why: 'recipe' },
  { rx: /\b(?:rangkum|ringkasan|ringkas)\s+(?:buku|film|novel|video|youtube)\b/i, why: 'summary' },
];

// Frase "izin" yang membuat AI tetap merespons: mis. "doakan agar aku sukses
// dalam ujian" mengandung "ujian" tapi sebenarnya minta doa. Cek dulu intensi spiritual.
const SPIRITUAL_HINT = /\b(?:doakan|berdoa|tolong\s+doakan|minta\s+doa|aamiin|insya\s*allah|alhamdulillah|astaghfirullah|subhanallah|allahu|tausiyah|nasihat|nasehat|hikmah|ayat|hadits|hadis|qur|firman|tilawah|sholat|salat|puasa|dzikir|zikir|sedekah)\b/i;

const TECH_HINT = /\b(prd|brd|spec(?:ification)?|spesifikasi\s+produk|whitepaper|business\s+plan|kode|coding|program(?:an)?|html|css|javascript|python|skripsi|tesis|makalah|essay|esai|saham|crypto|kripto|capres|pilpres)\b/i;

/**
 * Cek apakah pesan jelas di luar lingkup HariBaik (motivasi harian Islami).
 * @param {string} text  pesan pengguna
 * @returns {null | { reason: string }} null jika lolos, atau objek alasan jika OOC.
 */
export function isOffScope(text) {
  const msg = String(text || '').trim();
  if (!msg) return null;
  // Pesan sangat pendek (≤8 char) lolos — biar tidak salah blok "halo", "hai", dst.
  if (msg.length <= 8) return null;
  // Pesan panjang yang dominan kata teknis → hampir pasti out-of-scope.
  if (msg.length > 600 && TECH_HINT.test(msg)) return { reason: 'too_long_tech' };

  for (const { rx, why } of OFF_TOPIC) {
    if (rx.test(msg)) {
      // Jika SEKALIGUS punya nuansa spiritual yang kuat, biarkan lolos (mis. "doakan agar
      // skripsiku lancar" — kata "skripsi" muncul tapi user minta doa).
      if (SPIRITUAL_HINT.test(msg)) return null;
      return { reason: why };
    }
  }
  return null;
}

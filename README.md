# HariBaik V4

> Mulai harimu dengan kebaikan.

PWA motivasi harian Islami dengan **AI companion**. User bisa curhat (teks/suara), memilih
mood, dan AI merespons dengan **empati + ayat/hadits + saran aksi + doa** dalam percakapan
multi-turn. Rebrand & upgrade besar dari GoodDay V3.

## Arsitektur (Fase 1 — Opsi 1)

- **Frontend** (`/docs`): Vanilla JS PWA → GitHub Pages. Tanpa build step; library via CDN.
- **Backend** (`server.js`, `/api`): Node HTTP server (tanpa dependency npm, butuh Node ≥18) → Railway.
- **AI**: Sumopod (`https://ai.sumopod.com/v1/messages`) → `claude-haiku-4-5`.
- **Persistence**: IndexedDB di klien (riwayat percakapan, favorit, counter rotasi, streak).

## Fitur Fase 1

1. **AI Companion Chat** — percakapan multi-turn, respons terstruktur (kartu ayat/aksi/doa).
2. **Rotasi Quran–Hadits** — 3 lapis (instruksi eksplisit + pola rotasi + validasi & retry) untuk memperbaiki bias V3 yang ~99% Al-Quran.
3. **Dark mode** — default gelap, toggle tersimpan di localStorage.
4. **Favorit** — simpan kutipan ke IndexedDB, kelola di `favorites.html` (filter Quran/Hadits).
5. **Share** — kartu visual Islami (html2canvas) via Web Share API / fallback unduh+salin.
6. **Pengingat harian** — Notification API + Service Worker.

## Menjalankan lokal

### Backend
```bash
cp .env.example .env        # isi SUMOPOD_API_KEY=sk-xxxxx
npm start                   # http://localhost:3000
```
Tanpa API key (atau `MOCK_AI=1`), server memakai respons **mock** deterministik — berguna
untuk menguji UI & rotasi tanpa biaya/API.

### Frontend
Sajikan folder `docs/` lewat static server (modul ES & service worker butuh http, bukan `file://`):
```bash
npx serve docs              # atau: VS Code Live Server
```
`js/config.js` otomatis menunjuk ke `http://localhost:3000` saat di localhost.

## Uji rotasi
```bash
npm run test:rotation       # 10 request berurutan, cek urutan Quran/Hadits (mode mock)
```

## Deploy
- **Frontend** → GitHub Pages (source: folder `/docs`).
- **Backend** → Railway: set env `SUMOPOD_API_KEY`. Start command `npm start`.
- Setelah backend punya URL HariBaik sendiri, perbarui `BACKEND_URL` di `docs/js/config.js`
  dan tambahkan origin GitHub Pages ke `ALLOWED_ORIGINS` di `server.js`.

## Catatan & keterbatasan

- **Ikon PWA**: saat ini satu `icons/icon.svg`. Untuk installability maksimal di semua
  browser, tambahkan PNG 192×192 & 512×512 lalu daftarkan di `manifest.json`.
- **Pengingat harian**: push terjadwal yang andal pada waktu tetap butuh push server
  (Fase 4). MVP memicu pengingat saat app dibuka/aktif kembali melewati waktu yang disetel.
- `BACKEND_URL` non-lokal masih menunjuk backend V3 sebagai placeholder — ganti saat deploy.

## Roadmap
Fase 2 (personalisasi: mood journal + insight, kalender, stats, TTS) · Fase 3 (sosial &
gamifikasi) · Fase 4 (Supabase + auth + push server). Lihat master prompt proyek.

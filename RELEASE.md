# HariBaik V4 — Panduan Rilis Nyata

Checklist & langkah untuk meluncurkan HariBaik ke pengguna sungguhan.

---

## 1. Pasang sebagai aplikasi (PWA install) — sudah otomatis ✅

Aplikasi sudah memenuhi semua syarat **installable** (HTTPS, manifest lengkap
dengan ikon 192/512, service worker dgn handler `fetch`). Yang ditambahkan:

- **Banner "Pasang HariBaik"** muncul otomatis di Android/Chrome (`beforeinstallprompt`),
  bisa ditunda 7 hari.
- **Petunjuk iOS** otomatis ("Bagikan ⬆️ → Tambah ke Layar Utama") karena iOS Safari
  tidak punya prompt instal.
- Tombol **📲 Pasang aplikasi** di Pengaturan (muncul saat installable).

**Cek cepat:** buka di Chrome Android → harusnya muncul banner / menu ⋮ → "Instal aplikasi".

---

## 2. Masuk Google Play Store via TWA (opsional, tapi memperluas jangkauan)

TWA (Trusted Web Activity) membungkus PWA jadi paket Android (.aab) untuk Play Store.
Pengguna merasa seperti aplikasi native, tanpa address bar.

> ✅ Custom domain sudah aktif: **`https://haribaik.firmanahmad.id/`** (file `docs/CNAME`).
> Karena app kini di **root origin**, `assetlinks.json` cukup di `docs/.well-known/` — tidak
> perlu repo terpisah. Jauh lebih simpel.

### Cara termudah: **PWABuilder** (berbasis web, tanpa setup Android)
1. Buka <https://www.pwabuilder.com> → masukkan URL:
   `https://haribaik.firmanahmad.id/`
2. Klik **Package for stores → Android → Google Play**.
3. Atur:
   - **Package ID**: `id.firmanahmad.haribaik` (samakan dengan `docs/.well-known/assetlinks.json`)
   - **App name**: HariBaik
   - Centang **Signing key**: biarkan PWABuilder membuatkan (simpan file `.keystore` + password baik-baik — wajib untuk update ke depan!).
4. Download paket `.aab` + file `assetlinks.json` yang dihasilkan PWABuilder.

### Alternatif CLI: **Bubblewrap**
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://haribaik.firmanahmad.id/manifest.json
bubblewrap build
```

### Digital Asset Links (agar TWA full-screen tanpa address bar)
1. Setelah build, PWABuilder/Play Console memberi **SHA-256 fingerprint** sertifikat.
2. Salin fingerprint itu ke `docs/.well-known/assetlinks.json` (ganti
   `GANTI_DENGAN_SHA256_FINGERPRINT_DARI_PLAY_CONSOLE`), commit & deploy.
3. Verifikasi file live di:
   `https://haribaik.firmanahmad.id/.well-known/assetlinks.json`

> Tanpa fingerprint yang benar, TWA tetap rilis tapi memunculkan bilah URL kecil.

### Play Console
1. Daftar **Google Play Developer** (sekali bayar **$25**): <https://play.google.com/console>
2. Buat app baru → upload `.aab`.
3. Lengkapi: deskripsi, **screenshot** (min 2, ambil dari perangkat), ikon 512px,
   feature graphic 1024×500, kebijakan privasi (URL wajib), rating konten.
4. Submit untuk review (biasa 1–7 hari).

---

## 3. Sebelum publik — checklist akhir

- [ ] Jalankan semua migrasi Supabase: `schema.sql`, `migration_push.sql`,
      `migration_doa_safety.sql`, `migration_errors.sql`.
- [ ] Env Railway lengkap: `SUMOPOD_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
      `VAPID_SUBJECT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Supabase Auth → URL Configuration: Site URL `https://haribaik.firmanahmad.id`
      + Redirect URLs `https://haribaik.firmanahmad.id/**` agar magic-link email jalan.
- [ ] Backend CORS sudah memuat `https://haribaik.firmanahmad.id` (server.js) — pastikan
      Railway sudah redeploy dengan perubahan ini.
- [ ] GitHub Pages: custom domain `haribaik.firmanahmad.id` aktif + **Enforce HTTPS** dicentang
      (Settings → Pages), dan DNS (CNAME `haribaik` → `firmanahmad-max.github.io`) sudah propagasi.
- [ ] **Kebijakan privasi** (halaman publik) — wajib untuk Play Store & etis: jelaskan
      data yang disimpan (mood, jurnal, lokasi untuk sholat, langganan push) & bahwa
      tidak dijual. Bisa halaman statis sederhana.
- [ ] Uji nyata: install di Android + iPhone, tes notifikasi, sync 2 perangkat.
- [ ] Siapkan kanal **feedback** (form/email) untuk pengguna awal.

---

## 4. Langkah pertumbuhan setelah rilis (saran)

- **Analytics ringan** privasi-aman (event anonim ke Supabase) untuk tahu fitur mana
  yang dipakai.
- **Form masukan** di dalam app.
- Bagikan ke komunitas (grup pengajian, medsos) + ajakan share built-in.

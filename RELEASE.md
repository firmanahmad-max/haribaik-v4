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

### Cara termudah: **PWABuilder** (berbasis web, tanpa setup Android)
1. Buka <https://www.pwabuilder.com> → masukkan URL:
   `https://firmanahmad-max.github.io/haribaik-v4/`
2. Klik **Package for stores → Android → Google Play**.
3. Atur:
   - **Package ID**: `io.github.firmanahmad_max.haribaik` (samakan dengan `play-store/assetlinks.json`)
   - **App name**: HariBaik
   - Centang **Signing key**: biarkan PWABuilder membuatkan (simpan file `.keystore` + password baik-baik — wajib untuk update ke depan!).
4. Download paket `.aab` + file `assetlinks.json` yang dihasilkan PWABuilder
   (sudah berisi fingerprint SHA-256 yang benar).

### Alternatif CLI: **Bubblewrap**
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://firmanahmad-max.github.io/haribaik-v4/manifest.json
bubblewrap build
```

### ⚠️ Digital Asset Links — KHUSUS GitHub Pages (penting!)
Agar TWA tampil full-screen (tanpa address bar), domain harus memverifikasi app lewat
`assetlinks.json`. File ini **WAJIB di root origin**, bukan subpath proyek:

- ✅ Lokasi benar: `https://firmanahmad-max.github.io/.well-known/assetlinks.json`
- ❌ Bukan: `https://firmanahmad-max.github.io/haribaik-v4/.well-known/assetlinks.json`

Karena HariBaik ada di subpath (`/haribaik-v4/`), kamu punya 2 pilihan:

**Opsi A — taruh di repo user pages.** Buat/gunakan repo `firmanahmad-max.github.io`
(situs utama GitHub Pages-mu), lalu commit file ke
`/.well-known/assetlinks.json` di repo itu. Isi pakai fingerprint dari PWABuilder
(template ada di `play-store/assetlinks.json`).

**Opsi B (disarankan untuk brand) — custom domain.** Beli domain (mis. `haribaik.app`),
arahkan ke GitHub Pages, set di repo ini Settings → Pages → Custom domain. Maka origin
jadi `https://haribaik.app/` dan `assetlinks.json` cukup di `docs/.well-known/`.
Update juga `start_url`/`scope` bila perlu. Lebih bersih & profesional.

> Tanpa verifikasi DAL, TWA tetap bisa rilis tapi memunculkan bilah URL kecil.

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
- [ ] Supabase Auth → URL Configuration: tambahkan Site URL + Redirect URLs
      (`https://firmanahmad-max.github.io/haribaik-v4/**`) agar magic-link email jalan.
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

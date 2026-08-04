# CLAUDE.md — HariBaik V4

Catatan arsitektur untuk sesi pengembangan berikutnya.

## Stack
- Backend: Node HTTP murni (`server.js` + `/api/*.js`), **tanpa dependency npm** (pakai global `fetch`, Node ≥18). Deploy: Railway.
- Frontend: Vanilla JS PWA di `/docs`, ES modules, **tanpa build step**. Library (html2canvas) via CDN. Deploy: GitHub Pages (folder `/docs`).
- AI: Sumopod = endpoint Anthropic-compatible. `POST https://ai.sumopod.com/v1/messages`, header `x-api-key: $SUMOPOD_API_KEY` + `anthropic-version: 2023-06-01`, model `claude-haiku-4-5`. Keluaran JSON dipaksa via **assistant-prefill `{`**.

## Alur /api/chat
`server.js` → `api/chat.js#handleChat(body)` → rakit konteks + `rotation.js` + `prompt.js` → `callSumopod()` → `parse.js` (`extractFirstJsonObject` + `validateResponse`) → retry sekali bila family sumber salah (Lapis 3).

## Rotasi Quran/Hadits (perbaikan inti V3)
- Klien menyimpan `requestCount` persisten di IndexedDB (`db.js#nextRequestCount`) dan mengirimnya tiap turn. **Server stateless**.
- `rotation.js`: `ROTATION_PATTERN` (8 langkah, 3 quran + 5 hadits-family) + `getSourceInstruction(count)` + `getRetryInstruction()`.
- Respons AI berisi `source_type` ("quran"|"hadits") → divalidasi terhadap family yang diminta; mismatch memicu retry.

## Mock mode
`MOCK_AI=1` atau tanpa `SUMOPOD_API_KEY` → `api/chat.js#mockResponse({family})` mengembalikan respons deterministik sesuai family. Dipakai `scripts/test-rotation.mjs`. **Penting**: mock dipilih lewat parameter `mockFamily`, bukan regex pada prompt.

## Bentuk respons (kontrak FE↔BE)
`{ empati, source_type, arabic, translation, source, aksi, doa_arabic, doa_translation, meta }`.
`chat.js#renderAI` memetakan ini ke kartu: bubble empati, ayat-card (+badge Quran/Hadits), aksi-card, doa-card.

## Penyimpanan klien (`docs/js/db.js`)
IndexedDB `haribaik` v1, store: `messages`, `favorites` (index `source_type`), `meta` (key/value: `requestCount`, `streak`, `lastActiveDay`, `reminderTime`, `moodLog`, `profile`).

## Yang perlu diingat saat deploy
- Ganti `BACKEND_URL` non-lokal di `docs/js/config.js` (masih placeholder V3).
- Tambah origin GitHub Pages HariBaik ke `ALLOWED_ORIGINS` di `server.js`.
- Tambah ikon PNG 192/512 ke `manifest.json` untuk installability penuh.

## Notifikasi latar / Web Push (Fase 4 #3)
- **Murni Node, tanpa npm**: `api/webpush.js` = VAPID (ES256 JWT) + enkripsi payload aes128gcm (RFC 8291/8188) via `node:crypto`. Verifikasi offline: `node scripts/test-webpush.mjs` (round-trip dekripsi + verify JWT).
- **Kunci VAPID**: `node scripts/gen-vapid.mjs`. Public → `docs/js/config.js#VAPID_PUBLIC_KEY`; private → env `VAPID_PRIVATE_KEY` (server saja).
- **Scheduler** (`api/scheduler.js`): `setInterval` 30 dtk, baca semua `push_subscriptions` via **SERVICE ROLE KEY** (env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), hitung waktu lokal per `tz`, kirim pengingat harian + adzan (jadwal via Aladhan method 20, cache memori). Dedupe via kolom `last_sent` (slot `YYYY-MM-DD:reminder|<Sholat>`). No-op bila env belum lengkap.
- **Endpoint** `POST /api/push/test` (`api/push.js`): kirim notifikasi uji ke langganan pemanggil (verifikasi end-to-end di perangkat).
- **Klien** (`docs/js/push.js`): `enablePush/syncPushPrefs/disablePush/sendTestPush`. Langganan butuh sesi Supabase (anon boleh; auto sign-in anon saat enable). Preferensi (tz, lang, reminder, adzan, lat/lng) disimpan di baris `push_subscriptions` (RLS own-row). Dipicu dari Settings (toggle pengingat + tombol Tes) & Amalan (toggle adzan + ganti lokasi).
- **SW** (`docs/sw.js`): handler `push` (tampilkan notif), `notificationclick` (buka `data.url`), `pushsubscriptionchange` (langganan ulang). Cache → `haribaik-v4-30`.
- **SQL**: `supabase/migration_push.sql` (tabel `push_subscriptions` + RLS). Catatan deploy: set 4 env di Railway (VAPID public/private/subject + service_role + SUPABASE_URL), commit config public key, jalankan migrasi.

## Komunitas & Sosial (Fase 5)
- **Hub**: halaman `doa.html` kini jadi hub "Komunitas" dengan segmented control 3 bagian (pakai kelas `.ib-seg`). Entry `docs/js/community.js` (menggantikan `doa.js` lama) → me-mount bagian secara lazy & memanggil cleanup (unsub realtime) saat pindah tab. Tab aktif disimpan di `localStorage.communityTab`. Nav label `nav_doa` → "Komunitas"/"Community".
- **Bagian**: `doa-wall.js` (Dinding Doa + **balasan**), `syukur.js` (Papan Syukur), `kebaikan.js` (Kebaikan Bersama). Util bersama di `social-util.js` (escape/waktu/skeleton/toast/`localSet`/`feedCache`/profanity).
- **Balas doa**: tabel `doa_replies` (+ `doa_reply_reports`, RPC `report_reply`, rate-limit 5/60s, publication). UI: tombol "💬 Balas" per kartu → thread lazy-load + composer.
- **Papan Syukur**: tabel `syukur_posts` + `syukur_hugs` (RPC `add_hug`) + `syukur_reports` (RPC `report_syukur`), rate-limit 3/60s, realtime. Pola identik Dinding Doa (reaksi = 🤲 peluk).
- **Kebaikan Bersama**: agregat pekanan `kebaikan_counters (week,kind)` + `kebaikan_log` (rate-limit). RPC `bump_kebaikan(kind)` (kind: dzikir|doa|syukur|sedekah; ISO week `to_char(now(),'IYYY"W"IW')`) & `get_kebaikan()`→jsonb. Realtime. **Auto-bump**: `postDoa`→'doa', `postSyukur`→'syukur' (fire-and-forget di `cloud.js`); dzikir/sedekah via tombol niat (guard sekali/hari per kind via Meta `kebaikanMark`). Tanpa leaderboard individual (hindari riya').
- **Notif aamiin/balasan (#4)**: tabel antrean `notifications (user_id,kind,ref_id,count,pushed)`; `add_aamiin` (didefinisikan ulang) + trigger `notify_doa_reply` memanggil `enqueue_notif` (coalesce count, reset pushed). Scheduler `drainNotifications()` (service role) kirim push ke semua langganan penerima tiap tick 30 dtk lalu set `pushed=true` (payload per-`lang` sub, tag collapse).
- **SQL**: `supabase/migration_community.sql` (idempotent) — jalankan SETELAH `schema.sql` + `migration_doa_safety.sql`. Klien degrade mulus bila belum dijalankan (feed tampilkan pesan error, counter 0). SW cache → `haribaik-v4-54`.

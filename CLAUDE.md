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

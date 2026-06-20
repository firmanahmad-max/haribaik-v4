-- HariBaik V4 — Migrasi: Daftar Donatur
-- Jalankan di Supabase Studio → SQL Editor → New query → Run. Idempotent.
--
-- Tabel ini bisa DIBACA siapa saja (anonim + ter-login) agar daftar donatur tampil
-- di halaman Tentang publik. TIDAK ADA policy INSERT/UPDATE/DELETE → hanya admin
-- (lewat Supabase Studio / service_role) yang bisa menambah/mengubah/menghapus.

create table if not exists public.donors (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  donated_at date not null,
  note text,
  created_at timestamptz default now()
);

create index if not exists donors_date_idx on public.donors (donated_at, created_at);

alter table public.donors enable row level security;

drop policy if exists "donors_select_all" on public.donors;
create policy "donors_select_all" on public.donors
  for select to anon, authenticated using (true);

-- Seed donatur awal (idempotent — tidak dobel kalau dijalankan ulang).
insert into public.donors (display_name, donated_at)
select * from (values
  ('Alm. Rizky Ramanda Gustam'::text, '2026-06-04'::date),
  ('Hamba Allah'::text,                '2026-06-19'::date)
) as t(display_name, donated_at)
where not exists (
  select 1 from public.donors d
  where d.display_name = t.display_name and d.donated_at = t.donated_at
);

-- ============ Cara menambah donatur baru ============
-- Opsi A — UI Studio (paling mudah):
--   Supabase Studio → Table Editor → donors → "Insert row" →
--   isi display_name (mis. "Hamba Allah" atau "Fulan bin Fulan") + donated_at
--   (kalender) + (opsional) note → Save. Daftar otomatis terbaru di halaman
--   Tentang saat dimuat (tidak perlu redeploy/commit).
--
-- Opsi B — SQL:
--   insert into public.donors (display_name, donated_at)
--   values ('Nama Donatur', '2026-07-15');

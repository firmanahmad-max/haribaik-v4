-- HariBaik V4 — Migrasi: Monitoring error ringan (QA rilis)
-- Jalankan di Supabase Studio → SQL Editor → New query → Run. Idempotent.
--
-- Tabel hanya bisa di-INSERT oleh klien (anon/authenticated). TIDAK ada policy SELECT,
-- jadi data hanya bisa dibaca lewat dashboard / service role (privasi terjaga).

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  message text,
  source text,
  lineno int,
  colno int,
  stack text,
  page text,
  ua text,
  app_version text,
  created_at timestamptz default now()
);

create index if not exists app_errors_created_idx on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;

drop policy if exists "app_errors_insert_any" on public.app_errors;
create policy "app_errors_insert_any" on public.app_errors
  for insert to anon, authenticated with check (true);

-- (Opsional) Bersihkan error lama secara manual:
--   delete from public.app_errors where created_at < now() - interval '30 days';

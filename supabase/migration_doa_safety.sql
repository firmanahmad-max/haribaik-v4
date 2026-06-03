-- HariBaik V4 — Migrasi: Keamanan Dinding Doa (paket #2)
-- Jalankan SETELAH schema.sql, di Supabase Studio → SQL Editor → New query → Run.
-- Idempotent: aman dijalankan ulang.

-- 1) Kolom "hidden": doa yang dilaporkan cukup banyak akan disembunyikan dari feed.
alter table public.doa_requests add column if not exists hidden boolean not null default false;

-- 2) Tabel laporan (1 laporan per pengguna per doa).
create table if not exists public.doa_reports (
  id uuid primary key default gen_random_uuid(),
  doa_id uuid not null references public.doa_requests on delete cascade,
  reporter_id uuid not null references auth.users on delete cascade,
  reason text,
  created_at timestamptz default now(),
  unique (doa_id, reporter_id)
);
alter table public.doa_reports enable row level security;
drop policy if exists "reports_insert_own" on public.doa_reports;
create policy "reports_insert_own" on public.doa_reports for insert with check (auth.uid() = reporter_id);

-- 3) RPC laporkan: catat laporan, dan bila ≥ 3 laporan unik → sembunyikan otomatis.
create or replace function public.report_doa(p_doa uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.doa_reports (doa_id, reporter_id, reason)
  values (p_doa, auth.uid(), p_reason)
  on conflict (doa_id, reporter_id) do nothing;
  select count(*) into n from public.doa_reports where doa_id = p_doa;
  if n >= 3 then
    update public.doa_requests set hidden = true where id = p_doa;
  end if;
end; $$;

-- 4) Rate-limit anti-spam: maksimum 3 doa per pengguna dalam 60 detik.
create or replace function public.doa_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  select count(*) into cnt from public.doa_requests
  where user_id = auth.uid() and created_at > now() - interval '60 seconds';
  if cnt >= 3 then
    raise exception 'rate_limit: terlalu sering mengirim doa, coba lagi sebentar';
  end if;
  return new;
end; $$;

drop trigger if exists doa_rate_limit_trg on public.doa_requests;
create trigger doa_rate_limit_trg
  before insert on public.doa_requests
  for each row execute function public.doa_rate_limit();

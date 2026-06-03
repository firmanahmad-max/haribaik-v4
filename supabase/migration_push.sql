-- HariBaik V4 — Migrasi: Langganan Web Push (paket #3, notifikasi latar)
-- Jalankan di Supabase Studio → SQL Editor → New query → Run. Idempotent.
--
-- Catatan: scheduler backend membaca SEMUA baris memakai SERVICE ROLE KEY
-- (bypass RLS). Klien hanya boleh mengelola barisnya sendiri (RLS di bawah).

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  tz text default 'Asia/Jakarta',
  lang text default 'id',
  -- Pengingat harian
  reminder_enabled boolean not null default false,
  reminder_time text default '05:30',
  -- Adzan
  adzan_enabled boolean not null default false,
  adzan_prayers text[] default array['Subuh','Dzuhur','Ashar','Maghrib','Isya'],
  lat double precision,
  lng double precision,
  method int default 20,
  -- Dedupe kirim: { "YYYY-MM-DD:slot": true }
  last_sent jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create index if not exists push_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_select_own" on public.push_subscriptions;
drop policy if exists "push_insert_own" on public.push_subscriptions;
drop policy if exists "push_update_own" on public.push_subscriptions;
drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_select_own" on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "push_insert_own" on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "push_update_own" on public.push_subscriptions for update using (auth.uid() = user_id);
create policy "push_delete_own" on public.push_subscriptions for delete using (auth.uid() = user_id);

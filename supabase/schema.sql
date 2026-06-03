-- HariBaik V4 — Skema Supabase (Fase 4)
-- Jalankan seluruh isi file ini di Supabase Studio → SQL Editor → New query → Run.
-- Pola: klien (frontend) langsung ke Supabase memakai ANON KEY, diamankan oleh RLS.

-- ============ PROFIL (1 baris per pengguna) ============
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nama text, goal text, gender text, usia text, peran text,
  settings jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_upsert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- ============ JURNAL MOOD ============
create table if not exists public.journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  mood text not null, note text default '', ts bigint not null, day text not null, source text,
  created_at timestamptz default now()
);
create index if not exists journal_user_idx on public.journal (user_id, ts);
alter table public.journal enable row level security;
create policy "journal_all_own" on public.journal for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ AMALAN IBADAH (1 baris per hari per pengguna) ============
create table if not exists public.deeds (
  user_id uuid not null references auth.users on delete cascade,
  day text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, day)
);
alter table public.deeds enable row level security;
create policy "deeds_all_own" on public.deeds for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ FAVORIT KUTIPAN ============
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  arabic text, translation text, source text, source_type text, ts bigint,
  created_at timestamptz default now()
);
create index if not exists favorites_user_idx on public.favorites (user_id, ts);
alter table public.favorites enable row level security;
create policy "favorites_all_own" on public.favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ DOA REQUEST (DINDING DOA, SOSIAL) ============
-- Bisa dibaca SEMUA pengguna terautentikasi; hanya pemilik yang bisa hapus.
create table if not exists public.doa_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  content text not null check (char_length(content) between 3 and 300),
  display_name text default 'Anonim',
  aamiin_count int not null default 0,
  created_at timestamptz default now()
);
create index if not exists doa_created_idx on public.doa_requests (created_at desc);
alter table public.doa_requests enable row level security;
create policy "doa_select_all" on public.doa_requests for select using (auth.role() = 'authenticated');
create policy "doa_insert_own" on public.doa_requests for insert with check (auth.uid() = user_id);
create policy "doa_delete_own" on public.doa_requests for delete using (auth.uid() = user_id);

-- Dedupe "Aamiin" (1 pengguna 1x per doa)
create table if not exists public.aamiins (
  doa_id uuid not null references public.doa_requests on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz default now(),
  primary key (doa_id, user_id)
);
alter table public.aamiins enable row level security;
create policy "aamiins_select_all" on public.aamiins for select using (auth.role() = 'authenticated');
create policy "aamiins_insert_own" on public.aamiins for insert with check (auth.uid() = user_id);

-- RPC: tambah Aamiin secara aman (cegah hitung ganda) + naikkan counter.
create or replace function public.add_aamiin(p_doa uuid)
returns int language plpgsql security definer set search_path = public as $$
declare new_count int;
begin
  insert into public.aamiins (doa_id, user_id) values (p_doa, auth.uid())
  on conflict do nothing;
  if not found then
    return (select aamiin_count from public.doa_requests where id = p_doa);
  end if;
  update public.doa_requests set aamiin_count = aamiin_count + 1 where id = p_doa
  returning aamiin_count into new_count;
  return new_count;
end; $$;

-- Realtime untuk dinding doa (opsional, agar update muncul langsung).
alter publication supabase_realtime add table public.doa_requests;

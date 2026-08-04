-- HariBaik V4 — Migrasi: Komunitas & Sosial (Fase 5)
-- Jalankan SETELAH schema.sql + migration_doa_safety.sql, di Supabase Studio →
-- SQL Editor → New query → Run. Idempotent (aman dijalankan ulang).
--
-- Menambah 4 fitur komunitas:
--   1) Papan Syukur   → syukur_posts + syukur_hugs + syukur_reports
--   2) Balas doa      → doa_replies (+ laporan)
--   3) Kebaikan Bersama → kebaikan_counters + kebaikan_log (agregat pekanan)
--   4) Notif aamiin/balasan → notifications (antrean, dikuras scheduler via service role)
--
-- Pola tetap sama: klien langsung ke Supabase (anon key), diamankan RLS;
-- operasi sensitif lewat RPC security definer.
--
-- STATUS: Diterapkan & diverifikasi LIVE pada 2026-08-05 (Supabase produksi).
-- Uji end-to-end (browser, sesi anon) LULUS semua:
--   • Kebaikan Bersama: get_kebaikan ✓, bump_kebaikan('dzikir') 0→1 ✓
--   • Papan Syukur: post/list ✓, add_hug 0→1 ✓, my_hugs ✓, auto-bump 'syukur' ✓
--   • Balas doa: post reply → muncul di thread ✓
--   • Notif (2 pengguna): B aamiin/balas doa milik A → antrean A terisi
--     {aamiin:count1, reply:count1, pushed:false} ✓; RLS select-own ✓
--   • add_aamiin (redefinisi) + enqueue_notif jalur owner≠pelaku ✓;
--     trigger notify_doa_reply ✓. Baris uji dibersihkan (cascade).

-- =====================================================================
-- 1) PAPAN SYUKUR
-- =====================================================================
create table if not exists public.syukur_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  content text not null check (char_length(content) between 3 and 300),
  display_name text default 'Anonim',
  hug_count int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists syukur_created_idx on public.syukur_posts (created_at desc);
alter table public.syukur_posts enable row level security;
drop policy if exists "syukur_select_all" on public.syukur_posts;
drop policy if exists "syukur_insert_own" on public.syukur_posts;
drop policy if exists "syukur_delete_own" on public.syukur_posts;
create policy "syukur_select_all" on public.syukur_posts for select using (auth.role() = 'authenticated');
create policy "syukur_insert_own" on public.syukur_posts for insert with check (auth.uid() = user_id);
create policy "syukur_delete_own" on public.syukur_posts for delete using (auth.uid() = user_id);

-- Dedupe "peluk/syukur" (1 pengguna 1x per post)
create table if not exists public.syukur_hugs (
  post_id uuid not null references public.syukur_posts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);
alter table public.syukur_hugs enable row level security;
drop policy if exists "syukur_hugs_select_all" on public.syukur_hugs;
drop policy if exists "syukur_hugs_insert_own" on public.syukur_hugs;
create policy "syukur_hugs_select_all" on public.syukur_hugs for select using (auth.role() = 'authenticated');
create policy "syukur_hugs_insert_own" on public.syukur_hugs for insert with check (auth.uid() = user_id);

-- Laporan syukur (1 laporan per pengguna per post)
create table if not exists public.syukur_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.syukur_posts on delete cascade,
  reporter_id uuid not null references auth.users on delete cascade,
  reason text,
  created_at timestamptz default now(),
  unique (post_id, reporter_id)
);
alter table public.syukur_reports enable row level security;
drop policy if exists "syukur_reports_insert_own" on public.syukur_reports;
create policy "syukur_reports_insert_own" on public.syukur_reports for insert with check (auth.uid() = reporter_id);

-- RPC: tambah peluk syukur (cegah ganda) + naikkan counter.
create or replace function public.add_hug(p_post uuid)
returns int language plpgsql security definer set search_path = public as $$
declare new_count int;
begin
  insert into public.syukur_hugs (post_id, user_id) values (p_post, auth.uid())
  on conflict do nothing;
  if not found then
    return (select hug_count from public.syukur_posts where id = p_post);
  end if;
  update public.syukur_posts set hug_count = hug_count + 1 where id = p_post
  returning hug_count into new_count;
  return new_count;
end; $$;

-- RPC: laporkan syukur; bila ≥ 3 laporan unik → sembunyikan otomatis.
create or replace function public.report_syukur(p_post uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.syukur_reports (post_id, reporter_id, reason)
  values (p_post, auth.uid(), p_reason)
  on conflict (post_id, reporter_id) do nothing;
  select count(*) into n from public.syukur_reports where post_id = p_post;
  if n >= 3 then
    update public.syukur_posts set hidden = true where id = p_post;
  end if;
end; $$;

-- Rate-limit anti-spam: maksimum 3 syukur per pengguna dalam 60 detik.
create or replace function public.syukur_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  select count(*) into cnt from public.syukur_posts
  where user_id = auth.uid() and created_at > now() - interval '60 seconds';
  if cnt >= 3 then
    raise exception 'rate_limit: terlalu sering berbagi syukur, coba lagi sebentar';
  end if;
  return new;
end; $$;
drop trigger if exists syukur_rate_limit_trg on public.syukur_posts;
create trigger syukur_rate_limit_trg
  before insert on public.syukur_posts
  for each row execute function public.syukur_rate_limit();

alter publication supabase_realtime add table public.syukur_posts;

-- =====================================================================
-- 2) BALAS DOA (dukungan/penyemangat pada Dinding Doa)
-- =====================================================================
create table if not exists public.doa_replies (
  id uuid primary key default gen_random_uuid(),
  doa_id uuid not null references public.doa_requests on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  content text not null check (char_length(content) between 1 and 200),
  display_name text default 'Anonim',
  hidden boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists doa_replies_idx on public.doa_replies (doa_id, created_at);
alter table public.doa_replies enable row level security;
drop policy if exists "doa_replies_select_all" on public.doa_replies;
drop policy if exists "doa_replies_insert_own" on public.doa_replies;
drop policy if exists "doa_replies_delete_own" on public.doa_replies;
create policy "doa_replies_select_all" on public.doa_replies for select using (auth.role() = 'authenticated');
create policy "doa_replies_insert_own" on public.doa_replies for insert with check (auth.uid() = user_id);
create policy "doa_replies_delete_own" on public.doa_replies for delete using (auth.uid() = user_id);

create table if not exists public.doa_reply_reports (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid not null references public.doa_replies on delete cascade,
  reporter_id uuid not null references auth.users on delete cascade,
  reason text,
  created_at timestamptz default now(),
  unique (reply_id, reporter_id)
);
alter table public.doa_reply_reports enable row level security;
drop policy if exists "doa_reply_reports_insert_own" on public.doa_reply_reports;
create policy "doa_reply_reports_insert_own" on public.doa_reply_reports for insert with check (auth.uid() = reporter_id);

create or replace function public.report_reply(p_reply uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.doa_reply_reports (reply_id, reporter_id, reason)
  values (p_reply, auth.uid(), p_reason)
  on conflict (reply_id, reporter_id) do nothing;
  select count(*) into n from public.doa_reply_reports where reply_id = p_reply;
  if n >= 3 then
    update public.doa_replies set hidden = true where id = p_reply;
  end if;
end; $$;

-- Rate-limit balasan: maksimum 5 per pengguna dalam 60 detik.
create or replace function public.doa_reply_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  select count(*) into cnt from public.doa_replies
  where user_id = auth.uid() and created_at > now() - interval '60 seconds';
  if cnt >= 5 then
    raise exception 'rate_limit: terlalu sering membalas, coba lagi sebentar';
  end if;
  return new;
end; $$;
drop trigger if exists doa_reply_rate_limit_trg on public.doa_replies;
create trigger doa_reply_rate_limit_trg
  before insert on public.doa_replies
  for each row execute function public.doa_reply_rate_limit();

alter publication supabase_realtime add table public.doa_replies;

-- =====================================================================
-- 4) NOTIFIKASI (antrean) — didefinisikan sebelum RPC/trigger yang mengisinya
-- =====================================================================
-- Satu baris per (penerima, jenis, referensi). Aamiin/balasan berikutnya
-- meng-coalesce ke baris yang sama (count++) & reset pushed=false agar
-- scheduler mengirim ulang ringkasan. Dibaca scheduler via SERVICE ROLE (bypass RLS).
create table if not exists public.notifications (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,            -- 'aamiin' | 'reply'
  ref_id uuid not null,          -- doa_requests.id
  count int not null default 1,
  pushed boolean not null default false,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  primary key (user_id, kind, ref_id)
);
create index if not exists notif_unpushed_idx on public.notifications (pushed) where pushed = false;
alter table public.notifications enable row level security;
drop policy if exists "notif_select_own" on public.notifications;
create policy "notif_select_own" on public.notifications for select using (auth.uid() = user_id);
-- Tidak ada policy insert/update untuk klien: hanya diisi RPC/trigger security definer.

-- Helper: masukkan/naikkan notifikasi utk penerima (dipakai aamiin & balasan).
create or replace function public.enqueue_notif(p_user uuid, p_kind text, p_ref uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, ref_id, count, pushed, updated_at)
  values (p_user, p_kind, p_ref, 1, false, now())
  on conflict (user_id, kind, ref_id) do update
    set count = public.notifications.count + 1, pushed = false, updated_at = now();
end; $$;

-- =====================================================================
-- 3) KEBAIKAN BERSAMA (penghitung amal kolektif pekanan)
-- =====================================================================
create table if not exists public.kebaikan_counters (
  week text not null,            -- ISO: to_char(now(),'IYYY"W"IW') → mis. 2026W32
  kind text not null,            -- 'dzikir' | 'doa' | 'syukur' | 'sedekah'
  count bigint not null default 0,
  primary key (week, kind)
);
alter table public.kebaikan_counters enable row level security;
drop policy if exists "kebaikan_select_all" on public.kebaikan_counters;
create policy "kebaikan_select_all" on public.kebaikan_counters for select using (auth.role() = 'authenticated');
-- Tidak ada policy tulis: hanya lewat RPC bump_kebaikan (security definer).

-- Log kontribusi (untuk rate-limit; tidak diekspos ke klien).
create table if not exists public.kebaikan_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz default now()
);
create index if not exists kebaikan_log_idx on public.kebaikan_log (user_id, created_at);
alter table public.kebaikan_log enable row level security;
-- Tanpa policy klien: hanya RPC definer yang menyentuh.

-- RPC: kontribusi 1 kebaikan pada pekan berjalan. Rate-limit 60/menit/pengguna.
create or replace function public.bump_kebaikan(p_kind text)
returns bigint language plpgsql security definer set search_path = public as $$
declare wk text; n bigint; recent int;
begin
  if p_kind not in ('dzikir', 'doa', 'syukur', 'sedekah') then
    raise exception 'invalid kind';
  end if;
  select count(*) into recent from public.kebaikan_log
  where user_id = auth.uid() and created_at > now() - interval '60 seconds';
  if recent >= 60 then
    raise exception 'rate_limit: terlalu cepat, coba lagi sebentar';
  end if;
  insert into public.kebaikan_log (user_id) values (auth.uid());
  wk := to_char(now(), 'IYYY"W"IW');
  insert into public.kebaikan_counters (week, kind, count) values (wk, p_kind, 1)
  on conflict (week, kind) do update set count = public.kebaikan_counters.count + 1
  returning count into n;
  return n;
end; $$;

-- RPC: baca total pekan berjalan (semua kind) sebagai jsonb {kind: count}.
create or replace function public.get_kebaikan()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_object_agg(kind, count), '{}'::jsonb)
  from public.kebaikan_counters where week = to_char(now(), 'IYYY"W"IW');
$$;

alter publication supabase_realtime add table public.kebaikan_counters;

-- =====================================================================
-- 4b) Sambungkan notifikasi ke aamiin & balasan
-- =====================================================================
-- add_aamiin: definisi ulang (menimpa schema.sql) + enqueue notif ke pemilik doa.
create or replace function public.add_aamiin(p_doa uuid)
returns int language plpgsql security definer set search_path = public as $$
declare new_count int; owner uuid;
begin
  insert into public.aamiins (doa_id, user_id) values (p_doa, auth.uid())
  on conflict do nothing;
  if not found then
    return (select aamiin_count from public.doa_requests where id = p_doa);
  end if;
  update public.doa_requests set aamiin_count = aamiin_count + 1 where id = p_doa
  returning aamiin_count, user_id into new_count, owner;
  if owner is not null and owner <> auth.uid() then
    perform public.enqueue_notif(owner, 'aamiin', p_doa);
  end if;
  return new_count;
end; $$;

-- Trigger: saat ada balasan baru, beri tahu pemilik doa (bila bukan diri sendiri).
create or replace function public.notify_doa_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.doa_requests where id = new.doa_id;
  if owner is not null and owner <> new.user_id then
    perform public.enqueue_notif(owner, 'reply', new.doa_id);
  end if;
  return new;
end; $$;
drop trigger if exists doa_reply_notify_trg on public.doa_replies;
create trigger doa_reply_notify_trg
  after insert on public.doa_replies
  for each row execute function public.notify_doa_reply();

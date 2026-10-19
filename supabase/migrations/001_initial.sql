-- 会場席リアルタイム管理: 初期スキーマ + RLS

create type public.seat_status_enum as enum (
  'available',
  'presold',
  'daysold',
  'hold',
  'blocked'
);

create type public.seat_zone_enum as enum (
  'floor1',
  'courtside',
  'end',
  'special'
);

create type public.allocation_enum as enum (
  'all_day',
  'men',
  'women'
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  background_path text not null,
  map_width integer not null default 1200,
  map_height integer not null default 900,
  created_at timestamptz not null default now()
);

create table public.seats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  label text not null,
  section text,
  zone public.seat_zone_enum not null default 'floor1',
  x double precision not null check (x >= 0 and x <= 1),
  y double precision not null check (y >= 0 and y <= 1),
  w double precision not null check (w > 0 and w <= 1),
  h double precision not null check (h > 0 and h <= 1),
  created_at timestamptz not null default now()
);

create index seats_event_id_idx on public.seats (event_id);

create table public.seat_states (
  seat_id uuid not null references public.seats (id) on delete cascade,
  allocation public.allocation_enum not null default 'all_day',
  status public.seat_status_enum not null default 'available',
  note text,
  updated_at timestamptz not null default now(),
  primary key (seat_id, allocation)
);

alter table public.events enable row level security;
alter table public.seats enable row level security;
alter table public.seat_states enable row level security;

-- 公開閲覧: 匿名 SELECT
create policy "events_select_anon"
  on public.events for select
  to anon, authenticated
  using (true);

create policy "seats_select_anon"
  on public.seats for select
  to anon, authenticated
  using (true);

create policy "seat_states_select_anon"
  on public.seat_states for select
  to anon, authenticated
  using (true);

-- スタッフ: authenticated のみ INSERT/UPDATE/DELETE
create policy "seats_write_auth"
  on public.seats for all
  to authenticated
  using (true)
  with check (true);

create policy "seat_states_write_auth"
  on public.seat_states for all
  to authenticated
  using (true)
  with check (true);

create policy "events_write_auth"
  on public.events for all
  to authenticated
  using (true)
  with check (true);

-- Realtime
alter publication supabase_realtime add table public.seat_states;
alter publication supabase_realtime add table public.seats;

-- 初期イベント（背景は Storage または public URL に合わせて変更）
insert into public.events (slug, title, background_path, map_width, map_height) values
  ('2025-12-11', '12/11 試合', '/backgrounds/2025-12-11.png', 4600, 4110),
  ('2025-12-12', '12/12 試合', '/backgrounds/2025-12-12.png', 2399, 3167),
  ('2025-12-13', '12/13 試合', '/backgrounds/2025-12-13.png', 2399, 3167);

-- デモ席（12/11 のみ・本番は席配置モードで追加可）
insert into public.seats (event_id, label, section, zone, x, y, w, h)
select e.id, v.label, v.section, v.zone::public.seat_zone_enum, v.x, v.y, v.w, v.h
from public.events e
cross join (
  values
    ('A-1', 'A', 'courtside', 0.10, 0.15, 0.035, 0.04),
    ('A-2', 'A', 'courtside', 0.15, 0.15, 0.035, 0.04),
    ('A-3', 'A', 'courtside', 0.20, 0.15, 0.035, 0.04),
    ('B-1', 'B', 'floor1', 0.55, 0.15, 0.035, 0.04),
    ('B-2', 'B', 'floor1', 0.60, 0.15, 0.035, 0.04)
) as v(label, section, zone, x, y, w, h)
where e.slug = '2025-12-11';

insert into public.seat_states (seat_id, allocation, status, note)
select s.id, 'all_day'::public.allocation_enum, 'available', null
from public.seats s
on conflict (seat_id, allocation) do nothing;

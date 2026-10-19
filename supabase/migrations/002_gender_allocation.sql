-- 既存 DB を 001 旧版から移行する場合に実行

do $$ begin
  create type public.seat_zone_enum as enum (
    'floor1', 'courtside', 'end', 'special'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.allocation_enum as enum (
    'all_day', 'men', 'women'
  );
exception when duplicate_object then null;
end $$;

alter table public.seats
  add column if not exists zone public.seat_zone_enum not null default 'floor1';

alter table public.seat_states
  add column if not exists allocation public.allocation_enum not null default 'all_day';

-- 旧 PK (seat_id のみ) から複合 PK へ
alter table public.seat_states drop constraint if exists seat_states_pkey;
alter table public.seat_states
  add primary key (seat_id, allocation);

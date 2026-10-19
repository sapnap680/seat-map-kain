-- 当日券販売ログ（案内可に戻しても残る・集計用）

create table public.day_ticket_sales (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null,
  seat_id uuid not null references public.seats (id) on delete cascade,
  label text not null,
  category text,
  zone text not null,
  allocation public.allocation_enum not null,
  note text,
  sold_at timestamptz not null default now()
);

create index day_ticket_sales_event_sold_idx
  on public.day_ticket_sales (event_slug, sold_at desc);

alter table public.day_ticket_sales enable row level security;

create policy "day_ticket_sales_select"
  on public.day_ticket_sales for select
  to anon, authenticated
  using (true);

create policy "day_ticket_sales_insert_auth"
  on public.day_ticket_sales for insert
  to authenticated
  with check (true);

alter publication supabase_realtime add table public.day_ticket_sales;

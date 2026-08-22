-- ==================================================================
-- EDGE JOURNAL — розбори (reviews)
-- Виконати у Supabase → SQL Editor. Ідемпотентний.
--
-- Ключові поля винесені окремими колонками, бо по них ми фільтруємо
-- й сортуємо (період, оцінка). Усе інше — емоції, відповіді на
-- питання, обіцянки, зліпок статистики й підібраний матеріал —
-- лежить у jsonb: структура тут ще змінюватиметься.
--
-- is_public працює так само, як у планів: доки власник не натиснув
-- «поділитись», розбір не видно нікому.
-- ==================================================================

create table if not exists public.trader_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_from date not null,
  period_to   date not null,
  score       smallint not null default 0,
  lesson      text,
  data        jsonb not null default '{}'::jsonb,
  is_public   boolean not null default false,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create index if not exists trader_reviews_user_period_idx
  on public.trader_reviews (user_id, period_to desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end $$;

drop trigger if exists trader_reviews_touch on public.trader_reviews;
create trigger trader_reviews_touch
  before update on public.trader_reviews
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------
-- Доступ
-- ------------------------------------------------------------------

alter table public.trader_reviews enable row level security;
alter table public.trader_reviews force row level security;

drop policy if exists trader_reviews_owner_select on public.trader_reviews;
drop policy if exists trader_reviews_owner_insert on public.trader_reviews;
drop policy if exists trader_reviews_owner_update on public.trader_reviews;
drop policy if exists trader_reviews_owner_delete on public.trader_reviews;
drop policy if exists trader_reviews_public_read on public.trader_reviews;

create policy trader_reviews_owner_select on public.trader_reviews
  for select to authenticated using (user_id = auth.uid());

create policy trader_reviews_owner_insert on public.trader_reviews
  for insert to authenticated with check (user_id = auth.uid());

create policy trader_reviews_owner_update on public.trader_reviews
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy trader_reviews_owner_delete on public.trader_reviews
  for delete to authenticated using (user_id = auth.uid());

-- Публічний перегляд — тільки для явно відкритих розборів
create policy trader_reviews_public_read on public.trader_reviews
  for select to anon, authenticated using (is_public = true);

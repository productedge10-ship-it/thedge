-- ==================================================================
-- EDGE JOURNAL — картки статистики для експорту
-- Виконати у Supabase → SQL Editor. Ідемпотентний.
--
-- Кожен експорт — це зліпок: у data лежать уже порахованi цифри й
-- крива на момент натискання кнопки. Посилання показує саме їх і
-- не оновлюється разом із журналом. Так людина ділиться конкретним
-- результатом, а не відкриває доступ до свого поточного стану.
-- ==================================================================

create table if not exists public.stat_cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null,
  is_public  boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists stat_cards_user_idx
  on public.stat_cards (user_id, created_at desc);

alter table public.stat_cards enable row level security;
alter table public.stat_cards force row level security;

drop policy if exists stat_cards_owner_select on public.stat_cards;
drop policy if exists stat_cards_owner_insert on public.stat_cards;
drop policy if exists stat_cards_owner_update on public.stat_cards;
drop policy if exists stat_cards_owner_delete on public.stat_cards;
drop policy if exists stat_cards_public_read on public.stat_cards;

create policy stat_cards_owner_select on public.stat_cards
  for select to authenticated using (user_id = auth.uid());

create policy stat_cards_owner_insert on public.stat_cards
  for insert to authenticated with check (user_id = auth.uid());

create policy stat_cards_owner_update on public.stat_cards
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy stat_cards_owner_delete on public.stat_cards
  for delete to authenticated using (user_id = auth.uid());

-- Картку створюють саме щоб показати, тому вона публічна одразу.
-- Закрити доступ можна, знявши is_public або видаливши рядок.
create policy stat_cards_public_read on public.stat_cards
  for select to anon, authenticated using (is_public = true);

-- ==================================================================
-- EDGE JOURNAL — сховище стану сторінок (todo, чекліст і далі)
-- Виконати у Supabase → SQL Editor. Скрипт ідемпотентний.
--
-- Одна таблиця «ключ → документ» на користувача. Так завдання,
-- помодоро, налаштування таймера й чекліст переїжджають з localStorage
-- у базу і стають доступні з будь-якого пристрою.
-- ==================================================================

create table if not exists public.user_state (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_state_user_key unique (user_id, key)
);

create index if not exists user_state_user_idx on public.user_state (user_id);

-- updated_at оновлює себе саме (функція вже могла бути створена раніше)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end $$;

drop trigger if exists user_state_touch on public.user_state;
create trigger user_state_touch
  before update on public.user_state
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------
-- Доступ: тільки свої рядки
-- ------------------------------------------------------------------

alter table public.user_state enable row level security;
alter table public.user_state force row level security;

drop policy if exists user_state_owner_select on public.user_state;
drop policy if exists user_state_owner_insert on public.user_state;
drop policy if exists user_state_owner_update on public.user_state;
drop policy if exists user_state_owner_delete on public.user_state;

create policy user_state_owner_select on public.user_state
  for select to authenticated using (user_id = auth.uid());

create policy user_state_owner_insert on public.user_state
  for insert to authenticated with check (user_id = auth.uid());

create policy user_state_owner_update on public.user_state
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_state_owner_delete on public.user_state
  for delete to authenticated using (user_id = auth.uid());

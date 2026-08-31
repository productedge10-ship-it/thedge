-- ==================================================================
-- EDGE JOURNAL — свої торгові сесії
-- Виконати один раз у Supabase → SQL Editor → New query → Run.
-- Скрипт ідемпотентний: можна запускати повторно без наслідків.
--
-- Дублює структуру public.user_assets (той самий патерн «дефолтний
-- список у коді + свої рядки в БД»), лише для сесій (Азія/Лондон/
-- Нью-Йорк + власні), які тепер додаються/перейменовуються/
-- видаляються прямо з модалки запису угоди.
-- ==================================================================

create table if not exists public.user_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default timezone('utc', now())
);

create unique index if not exists user_sessions_user_name_key
  on public.user_sessions (user_id, name);

alter table public.user_sessions enable row level security;

drop policy if exists user_sessions_owner_select on public.user_sessions;
drop policy if exists user_sessions_owner_insert on public.user_sessions;
drop policy if exists user_sessions_owner_update on public.user_sessions;
drop policy if exists user_sessions_owner_delete on public.user_sessions;

create policy user_sessions_owner_select
  on public.user_sessions for select to authenticated
  using (user_id = auth.uid());

create policy user_sessions_owner_insert
  on public.user_sessions for insert to authenticated
  with check (user_id = auth.uid());

create policy user_sessions_owner_update
  on public.user_sessions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_sessions_owner_delete
  on public.user_sessions for delete to authenticated
  using (user_id = auth.uid());

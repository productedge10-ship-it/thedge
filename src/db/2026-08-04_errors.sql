-- ==================================================================
-- EDGE JOURNAL — журнал помилок
-- Виконати у Supabase → SQL Editor. Ідемпотентний: можна запускати
-- повторно, нічого не зламається.
--
-- Помилки жили в localStorage разом із демо-даними: на іншому
-- пристрої людина бачила чужі приклади замість власних записів, а
-- чистка кешу зносила все. Тепер це таблиця з RLS.
--
-- Ділитись помилками не передбачено взагалі — це найінтимніша
-- частина журналу, тому жодного публічного доступу тут немає.
-- ==================================================================

create table if not exists public.trade_errors (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,

  pair          text not null default '',
  description   text not null default '',

  -- Категорії помилки: плаский масив id з CATS ('fomo', 'tilt', ...).
  -- jsonb, бо перелік ще уточнюється, а фільтрація йде на клієнті.
  cats          jsonb not null default '[]'::jsonb,

  tv_link       text not null default '',

  -- Два прапорці, з яких рахується вся статистика сторінки
  followed_plan boolean not null default false,
  rushed        boolean not null default false,

  -- День, до якого належить помилка. Окремо від created_at: розбір
  -- вчорашньої угоди часто пишеться сьогодні, а стояти має вчорашнім.
  error_date    date not null default (timezone('utc', now()))::date,

  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

-- Стрічка завжди сортується за датою в межах одного користувача
create index if not exists trade_errors_user_date_idx
  on public.trade_errors (user_id, error_date desc, created_at desc);

-- Фільтр по категоріях, якщо колись перенесемо його на бік бази
create index if not exists trade_errors_cats_idx
  on public.trade_errors using gin (cats);

alter table public.trade_errors enable row level security;
alter table public.trade_errors force row level security;

drop policy if exists trade_errors_owner_select on public.trade_errors;
drop policy if exists trade_errors_owner_insert on public.trade_errors;
drop policy if exists trade_errors_owner_update on public.trade_errors;
drop policy if exists trade_errors_owner_delete on public.trade_errors;

create policy trade_errors_owner_select on public.trade_errors
  for select to authenticated using (user_id = auth.uid());

create policy trade_errors_owner_insert on public.trade_errors
  for insert to authenticated with check (user_id = auth.uid());

create policy trade_errors_owner_update on public.trade_errors
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy trade_errors_owner_delete on public.trade_errors
  for delete to authenticated using (user_id = auth.uid());

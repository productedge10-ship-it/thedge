-- ==================================================================
-- EDGE JOURNAL — журнал помилок + три поля угоди
-- Виконати цілком у Supabase → SQL Editor. Ідемпотентний.
--
-- Таблиці trade_errors у базі немає взагалі, тому створюємо її
-- одразу в кінцевому вигляді, а не ланцюжком alter'ів.
--
-- Помилка потрапляє сюди з трьох джерел:
--   source = 'manual' — заведена руками на сторінці помилок
--   source = 'trade'  — дзеркало помилки з угоди (trade_id)
--   source = 'plan'   — дзеркало з пост-сесійної діагностики (plan_id)
-- ==================================================================

create table if not exists public.trade_errors (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,

  pair          text not null default '',
  description   text not null default '',

  -- Плаский масив id категорій: 'fomo', 'haste', 'tilt', 'risk'…
  cats          jsonb not null default '[]'::jsonb,

  tv_link       text not null default '',

  followed_plan boolean not null default false,
  rushed        boolean not null default false,

  -- День, до якого належить помилка. Окремо від created_at: розбір
  -- вчорашньої угоди часто пишеться сьогодні, а стояти має вчорашнім.
  error_date    date not null default (timezone('utc', now()))::date,

  -- Звідки прийшов запис і куди по ньому повернутись.
  -- cascade: дзеркало не має власного життя без свого джерела.
  trade_id      uuid references public.trades(id) on delete cascade,
  plan_id       uuid references public.trading_plans(id) on delete cascade,
  source        text not null default 'manual',

  -- Сенс журналу: помилку мало зафіксувати, її треба потім перебрати
  resolved      boolean not null default false,

  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

-- Якщо таблиця вже якось існувала — доганяємо колонки
alter table public.trade_errors add column if not exists trade_id uuid references public.trades(id) on delete cascade;
alter table public.trade_errors add column if not exists plan_id  uuid references public.trading_plans(id) on delete cascade;
alter table public.trade_errors add column if not exists source   text not null default 'manual';
alter table public.trade_errors add column if not exists resolved boolean not null default false;

-- Один запис на угоду і один на план. Саме ці індекси не дають
-- наплодити дублів при повторному збереженні: синхронізація в коді
-- спирається на них.
create unique index if not exists trade_errors_trade_uniq
  on public.trade_errors (trade_id) where trade_id is not null;

create unique index if not exists trade_errors_plan_uniq
  on public.trade_errors (plan_id) where plan_id is not null;

create index if not exists trade_errors_user_date_idx
  on public.trade_errors (user_id, error_date desc, created_at desc);

create index if not exists trade_errors_user_open_idx
  on public.trade_errors (user_id, resolved, error_date desc);

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


-- ------------------------------------------------------------------
-- Три поля угоди
--
-- Форма запису угоди вже пише setup / entry_time / exit_time, а
-- колонок у базі немає — тобто збереження угоди зараз падає. Без них
-- також мовчать три розділи аналітики: по сетапах, по годинах входу
-- і по часу утримання.
-- ------------------------------------------------------------------

alter table public.trades add column if not exists setup      text;
alter table public.trades add column if not exists entry_time time;
alter table public.trades add column if not exists exit_time  time;

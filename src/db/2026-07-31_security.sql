-- ==================================================================
-- EDGE JOURNAL — захист даних
-- Виконати один раз у Supabase → SQL Editor → New query → Run.
-- Скрипт ідемпотентний: можна запускати повторно без наслідків.
--
-- Що робить:
--   1. вмикає Row Level Security на всіх таблицях користувача;
--   2. дає кожному доступ РІВНО до своїх рядків;
--   3. додає trading_plans.is_public — план видно чужим тільки
--      після явного «поділитись»;
--   4. створює daily_diagnostics — один запис на користувача на день;
--   5. довідники (instruments, trade_checklist) робить лише читабельними.
-- ==================================================================


-- ------------------------------------------------------------------
-- 0. Нові колонки й таблиці
-- ------------------------------------------------------------------

alter table public.trading_plans
  add column if not exists is_public boolean not null default false;

-- Один план на користувача / дату / актив. Захищає від дублікатів,
-- які інакше плодить автозбереження при швидких перемиканнях.
create unique index if not exists trading_plans_user_date_pair_key
  on public.trading_plans (user_id, date, pair);

-- Стан голови перед торгівлею. Один рядок на день — незалежно від
-- того, скільки планів по різних активах створено того дня.
create table if not exists public.daily_diagnostics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  sleep       boolean,
  mood        boolean,
  revenge     boolean,
  risk        boolean,
  note        text,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now()),
  constraint daily_diagnostics_user_date_key unique (user_id, date)
);

create index if not exists daily_diagnostics_user_date_idx
  on public.daily_diagnostics (user_id, date desc);

-- updated_at саме себе оновлює
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end $$;

drop trigger if exists daily_diagnostics_touch on public.daily_diagnostics;
create trigger daily_diagnostics_touch
  before update on public.daily_diagnostics
  for each row execute function public.touch_updated_at();


-- ------------------------------------------------------------------
-- 1. Осиротілі рядки без власника
--    Якщо user_id порожній, RLS сховає рядок від усіх — але й від
--    тебе теж. Тому спершу дивимось, чи такі є:
--      select 'trading_plans' t, count(*) from public.trading_plans where user_id is null
--      union all select 'trades', count(*) from public.trades where user_id is null;
--    Якщо це твої старі записи — підстав свій id замість <YOUR-UUID>
--    і розкоментуй потрібні рядки.
-- ------------------------------------------------------------------

-- update public.trading_plans set user_id = '<YOUR-UUID>' where user_id is null;
-- update public.trades         set user_id = '<YOUR-UUID>' where user_id is null;
-- update public.trader_notes   set user_id = '<YOUR-UUID>' where user_id is null;
-- update public.trader_observations set user_id = '<YOUR-UUID>' where user_id is null;
-- update public.trading_system set user_id = '<YOUR-UUID>' where user_id is null;
-- update public.prop_accounts  set user_id = '<YOUR-UUID>' where user_id is null;
-- update public.periodic_reviews set user_id = '<YOUR-UUID>' where user_id is null;
-- update public.tasks          set user_id = '<YOUR-UUID>' where user_id is null;
-- update public.user_assets    set user_id = '<YOUR-UUID>' where user_id is null;
-- update public.user_mistake_categories set user_id = '<YOUR-UUID>' where user_id is null;


-- ------------------------------------------------------------------
-- 2. Власник бере значення сам, навіть якщо клієнт його не надіслав
-- ------------------------------------------------------------------

alter table public.trading_plans       alter column user_id set default auth.uid();
alter table public.trades              alter column user_id set default auth.uid();
alter table public.trader_notes        alter column user_id set default auth.uid();
alter table public.trader_observations alter column user_id set default auth.uid();
alter table public.trading_system      alter column user_id set default auth.uid();
alter table public.prop_accounts       alter column user_id set default auth.uid();
alter table public.periodic_reviews    alter column user_id set default auth.uid();
alter table public.tasks               alter column user_id set default auth.uid();
alter table public.user_assets         alter column user_id set default auth.uid();
alter table public.user_mistake_categories alter column user_id set default auth.uid();
alter table public.tg_alerts           alter column user_id set default auth.uid();
alter table public.backtest_sessions   alter column user_id set default auth.uid();
alter table public.backtest_trades     alter column user_id set default auth.uid();
alter table public.method_20_trades    alter column user_id set default auth.uid();
alter table public.user_settings       alter column user_id set default auth.uid();
alter table public.user_emails         alter column user_id set default auth.uid();


-- ------------------------------------------------------------------
-- 3. RLS + однакова політика «тільки свої рядки»
--    Робимо циклом, щоб не писати 60 однакових policy руками.
-- ------------------------------------------------------------------

do $$
declare
  t text;
  owned text[] := array[
    'trading_plans', 'trades', 'trader_notes', 'trader_observations',
    'trading_system', 'prop_accounts', 'periodic_reviews', 'tasks',
    'user_assets', 'user_mistake_categories', 'tg_alerts',
    'backtest_sessions', 'backtest_trades', 'method_20_trades',
    'user_settings', 'user_emails', 'daily_diagnostics'
  ];
begin
  foreach t in array owned loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_owner_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_delete', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      t || '_owner_select', t);

    -- with check не дає підсунути чужий user_id при вставці
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
      t || '_owner_insert', t);

    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner_update', t);

    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
      t || '_owner_delete', t);
  end loop;
end $$;


-- ------------------------------------------------------------------
-- 4. Публічний план — тільки коли власник сам увімкнув is_public
--    Читання анонімом, без права щось змінити.
-- ------------------------------------------------------------------

drop policy if exists trading_plans_public_read on public.trading_plans;
create policy trading_plans_public_read
  on public.trading_plans
  for select
  to anon, authenticated
  using (is_public = true);


-- ------------------------------------------------------------------
-- 5. Довідники — спільні, тільки читання
-- ------------------------------------------------------------------

alter table public.instruments enable row level security;
drop policy if exists instruments_read on public.instruments;
create policy instruments_read
  on public.instruments for select to anon, authenticated using (true);

alter table public.trade_checklist enable row level security;
drop policy if exists trade_checklist_read on public.trade_checklist;
create policy trade_checklist_read
  on public.trade_checklist for select to authenticated using (true);


-- ------------------------------------------------------------------
-- 6. Перевірка. Після виконання тут не має бути жодного false.
-- ------------------------------------------------------------------

select
  c.relname                as "таблиця",
  c.relrowsecurity         as "rls",
  count(p.policyname)      as "політик"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.tablename = c.relname and p.schemaname = 'public'
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relrowsecurity, c.relname;

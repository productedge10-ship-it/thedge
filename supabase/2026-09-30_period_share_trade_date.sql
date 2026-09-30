-- ===================================================================
-- 2026-09-30. Посилання на журнал за період + ручна дата угоди.
--
-- Запустити один раз у Supabase → SQL Editor. ДО деплою фронтенду:
-- кнопка «Поділитись періодом» ходить у нову таблицю, а картка угоди
-- пише нову колонку date_edited.
--
-- 1) journal_period_shares — окремі посилання на журнал за вибраний
--    період. Окрема таблиця, а не колонки в journal_shares: там один
--    рядок на людину («весь журнал»), а посилань на періоди може бути
--    кілька одночасно (вересень ментору, тиждень другу).
--    Токен починається з «p» — за цим фронтенд знає, яку функцію
--    питати, і не робить зайвий запит у shared_journal.
--
-- 2) shared_journal_period / shared_period_candles — читання для
--    гостя. Фільтр за датами стоїть ТУТ, у базі, а не в браузері:
--    інакше гість отримав би в мережі всі угоди, а приховав би їх
--    лише інтерфейс.
--
-- 3) trades.date_edited + тригер — ручна дата не повертається назад
--    після наступної синхронізації MT5: воркер пише без користувача
--    (auth.uid() порожній), і для таких рядків дату він не чіпає.
-- ===================================================================

-- ---------- 1. таблиця посилань ----------
create table if not exists public.journal_period_shares (
  token      text primary key default ('p' || replace(gen_random_uuid()::text, '-', '')),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date_from  date,
  date_to    date,
  created_at timestamptz not null default now(),
  constraint journal_period_shares_range
    check (date_from is null or date_to is null or date_from <= date_to)
);

create index if not exists journal_period_shares_user_idx
  on public.journal_period_shares (user_id);

alter table public.journal_period_shares enable row level security;

drop policy if exists "period shares: read own"   on public.journal_period_shares;
drop policy if exists "period shares: create own" on public.journal_period_shares;
drop policy if exists "period shares: delete own" on public.journal_period_shares;

create policy "period shares: read own" on public.journal_period_shares
  for select to authenticated using (user_id = auth.uid());
create policy "period shares: create own" on public.journal_period_shares
  for insert to authenticated with check (user_id = auth.uid());
create policy "period shares: delete own" on public.journal_period_shares
  for delete to authenticated using (user_id = auth.uid());
-- update навмисно немає: змінити період = нове посилання. Інакше
-- людина, якій скинули «вересень», раптом бачила б увесь рік.

revoke all on public.journal_period_shares from anon;
grant select, insert, delete on public.journal_period_shares to authenticated;

-- ---------- 2. читання для гостя ----------
-- Дати порівнюємо як текст 'YYYY-MM-DD': так фільтр працює однаково,
-- чи plan_date зберігається як date, чи як text, і не падає на
-- криво записаному рядку, як упав би ::date.
create or replace function public.shared_journal_period(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  s      public.journal_period_shares%rowtype;
  v_name text;
  f      text;
  t      text;
begin
  select * into s from public.journal_period_shares where token = p_token;
  if not found then
    return null;
  end if;

  f := s.date_from::text;
  t := s.date_to::text;

  select nullif(trim(us.data->>'nickname'), '') into v_name
    from public.user_state us
   where us.user_id = s.user_id and us.key = 'settings';

  if v_name is null then
    select nullif(trim(coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name')), '')
      into v_name
      from auth.users u where u.id = s.user_id;
  end if;

  return jsonb_build_object(
    'owner',  jsonb_build_object('name', v_name),
    'period', jsonb_build_object('from', f, 'to', t),
    'trades', coalesce((
      select jsonb_agg(to_jsonb(tr) - 'user_id')
        from public.trades tr
       where tr.user_id = s.user_id
         and (f is null or tr.plan_date::text >= f)
         and (t is null or tr.plan_date::text <= t)
    ), '[]'::jsonb),
    'prop_accounts', coalesce((
      select jsonb_agg(to_jsonb(a) - 'user_id')
        from public.prop_accounts a
       where a.user_id = s.user_id
    ), '[]'::jsonb),
    'trading_plans', coalesce((
      select jsonb_agg(to_jsonb(p) - 'user_id')
        from public.trading_plans p
       where p.user_id = s.user_id
         and (f is null or p.date::text >= f)
         and (t is null or p.date::text <= t)
    ), '[]'::jsonb),
    -- Лише налаштування відображення. Нотатки, чекліст, задачі й
    -- розкладки інших розділів гостю ні до чого.
    'user_state', coalesce((
      select jsonb_agg(jsonb_build_object('key', us.key, 'data', us.data))
        from public.user_state us
       where us.user_id = s.user_id and us.key = 'settings'
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.shared_period_candles(p_token text, p_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('external_id', x.external_id, 'data', x.data)), '[]'::jsonb)
  from (
    select distinct on (c.external_id) c.external_id::text as external_id, c.data
      from public.journal_period_shares s
      join public.trades tr
        on tr.user_id = s.user_id
       and (s.date_from is null or tr.plan_date::text >= s.date_from::text)
       and (s.date_to   is null or tr.plan_date::text <= s.date_to::text)
      join public.trade_candles c
        on c.source = tr.source and c.external_id = tr.external_id
     where s.token = p_token
       and c.external_id::text = any(p_ids)
  ) x;
$$;

revoke all on function public.shared_journal_period(text) from public;
revoke all on function public.shared_period_candles(text, text[]) from public;
grant execute on function public.shared_journal_period(text) to anon, authenticated;
grant execute on function public.shared_period_candles(text, text[]) to anon, authenticated;

-- ---------- 3. ручна дата угоди ----------
alter table public.trades add column if not exists date_edited boolean not null default false;

create or replace function public.trades_keep_user_date()
returns trigger
language plpgsql
as $$
begin
  -- Людина поміняла дату сама → синхронізація (без користувача в
  -- сесії) її не перезаписує. Правки з застосунку йдуть як завжди.
  if old.date_edited and auth.uid() is null then
    new.plan_date   := old.plan_date;
    new.date_edited := true;
  end if;
  return new;
end $$;

drop trigger if exists trades_keep_user_date on public.trades;
create trigger trades_keep_user_date
  before update on public.trades
  for each row execute function public.trades_keep_user_date();

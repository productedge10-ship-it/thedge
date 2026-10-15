-- ==================================================================
-- Free: ручні бектести без обмежень, реальний графік — 2 сесії (+1 за
-- чекліст), далі Lite. Раніше квота рахувала всі сесії, а режим
-- («графік» / «ручний») жив лише в localStorage браузера — сервер не
-- міг відрізнити одне від одного і не закривав вхід у графік.
-- ==================================================================

-- Режим сесії нарешті в базі (міграція 2026-10-08_backtest_mode.sql).
alter table public.backtest_sessions
  add column if not exists mode text not null default 'manual',
  add column if not exists settings jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.backtest_sessions
    add constraint backtest_sessions_mode_check check (mode in ('manual', 'chart'));
exception when duplicate_object then null; end $$;
update public.backtest_sessions s set mode = 'chart'
 where s.mode = 'manual'
   and exists (select 1 from public.backtest_trades t where t.session_id = s.id and t.tda_data ? 'chart');

-- Квота — лише сесії на графіку.
insert into public.backtest_quota (user_id, used)
select user_id, count(*) from public.backtest_sessions where mode = 'chart' and user_id is not null group by user_id
on conflict (user_id) do nothing;
update public.backtest_quota q set used = coalesce((
  select count(*) from public.backtest_sessions s where s.user_id = q.user_id and s.mode = 'chart'), 0);

create or replace function public.backtest_quota_count()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.user_id is not null and new.mode = 'chart' then
    insert into public.backtest_quota (user_id, used) values (new.user_id, 1)
    on conflict (user_id) do update set used = public.backtest_quota.used + 1, updated_at = now();
  end if;
  return new;
end $$;

-- Ручний → графік зміною режиму теж не обійти.
create or replace function public.backtest_mode_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.mode = 'chart' and old.mode = 'manual' and auth.uid() is not null then
    if not public.has_lite() and public.backtest_free_left() <= 0 then
      raise exception 'backtest chart limit' using errcode = '42501';
    end if;
    insert into public.backtest_quota (user_id, used) values (new.user_id, 1)
    on conflict (user_id) do update set used = public.backtest_quota.used + 1, updated_at = now();
  end if;
  return new;
end $$;
drop trigger if exists backtest_mode_guard on public.backtest_sessions;
create trigger backtest_mode_guard before update of mode on public.backtest_sessions
  for each row execute function public.backtest_mode_guard();

-- Чи відкрита сесія для угод: ручна — завжди, графік — перші N.
create or replace function public.backtest_session_open(p_session uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.has_lite()
    or exists (select 1 from public.backtest_sessions s where s.id = p_session and s.user_id = auth.uid() and s.mode = 'manual')
    or exists (
      select 1 from (
        select s.id, row_number() over (order by s.created_at, s.id) rn
          from public.backtest_sessions s where s.user_id = auth.uid() and s.mode = 'chart'
      ) r where r.id = p_session and r.rn <= public.backtest_free_limit());
$$;

-- Чи можна зараз відкрити графік (null — без сесії, лише дивитись).
create or replace function public.chart_access(p_session uuid default null)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.has_lite()
    or (p_session is null and public.backtest_free_left() > 0)
    or (p_session is not null and public.backtest_session_open(p_session)
        and exists (select 1 from public.backtest_sessions s where s.id = p_session and s.user_id = auth.uid() and s.mode = 'chart'));
$$;
grant execute on function public.chart_access(uuid) to authenticated;

-- Політики.
drop policy if exists backtest_sessions_require_plan on public.backtest_sessions;
create policy backtest_sessions_require_plan on public.backtest_sessions
  as restrictive for insert to authenticated
  with check (
    mode = 'manual'
    or public.has_lite()
    or public.backtest_free_left() > 0
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'topochkanovalexandr@gmail.com'
  );

drop policy if exists backtest_trades_require_plan on public.backtest_trades;
create policy backtest_trades_require_plan on public.backtest_trades
  as restrictive for insert to authenticated
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'topochkanovalexandr@gmail.com'
    or public.has_lite()
    or (
      public.backtest_session_open(session_id)
      -- угода з графіка (tda_data.chart) — лише в сесії-графіку
      and (not coalesce(tda_data ? 'chart', false)
           or exists (select 1 from public.backtest_sessions s where s.id = session_id and s.mode = 'chart'))
    )
  );

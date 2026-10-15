-- ==================================================================
-- Тариф Lite.
--
-- Free  — журнал, аналітика, калькулятор, 1 рахунок, 2 бектести.
-- Lite  — Free + бектести без обмежень + Telegram-бот.
-- Pro   — Lite + автоімпорт MT5, до 5 рахунків.
--
-- subscriptions.plan тепер 'free' | 'lite' | 'pro'. is_pro() не
-- змінюється: true лише для Pro, тож MT5 і рахунки Lite не відкриває.
-- has_lite() — true для Lite і для Pro: усе, що входить у Lite.
-- ==================================================================

create or replace function public.has_lite(p_user uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.subscriptions s
     where s.user_id = case when auth.role() = 'service_role' then p_user else auth.uid() end
       and s.plan in ('lite', 'pro') and s.status in ('active', 'trialing')
       and (s.valid_until is null or s.valid_until > now()));
$$;
grant execute on function public.has_lite(uuid) to authenticated, service_role;

-- ---------- Безкоштовні бектести ----------
-- Рахуємо СТВОРЕНІ, а не наявні: інакше видалив і створив знову — і
-- ліміту немає. bonus — на майбутнє (нагорода за чекліст).
create table if not exists public.backtest_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used int not null default 0,
  bonus int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.backtest_quota enable row level security;
drop policy if exists backtest_quota_own_select on public.backtest_quota;
create policy backtest_quota_own_select on public.backtest_quota
  for select using (user_id = auth.uid());

-- Ті, хто вже створював бектести, — з чесним лічильником.
insert into public.backtest_quota (user_id, used)
select user_id, count(*) from public.backtest_sessions where user_id is not null group by user_id
on conflict (user_id) do update set used = greatest(public.backtest_quota.used, excluded.used);

create or replace function public.backtest_free_limit(p_user uuid default auth.uid())
returns int
language sql stable security definer
set search_path to 'public'
as $$
  select 2 + coalesce((select q.bonus from public.backtest_quota q
    where q.user_id = case when auth.role() = 'service_role' then p_user else auth.uid() end), 0);
$$;

create or replace function public.backtest_free_left(p_user uuid default auth.uid())
returns int
language sql stable security definer
set search_path to 'public'
as $$
  select greatest(0, public.backtest_free_limit(p_user) - coalesce((select q.used from public.backtest_quota q
    where q.user_id = case when auth.role() = 'service_role' then p_user else auth.uid() end), 0))::int;
$$;
grant execute on function public.backtest_free_limit(uuid) to authenticated, service_role;
grant execute on function public.backtest_free_left(uuid) to authenticated, service_role;

-- Чи можна писати угоди в цю сесію: Lite/Pro — у будь-яку свою;
-- Free — лише в перші N своїх сесій (N = ліміт). Скінчився Lite —
-- старі бектести лишаються видимими, нові угоди йдуть лише в перші N.
create or replace function public.backtest_session_open(p_session uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.has_lite() or exists (
    select 1 from (
      select s.id, row_number() over (order by s.created_at, s.id) rn
        from public.backtest_sessions s where s.user_id = auth.uid()
    ) r where r.id = p_session and r.rn <= public.backtest_free_limit());
$$;
grant execute on function public.backtest_session_open(uuid) to authenticated;

create or replace function public.backtest_quota_count()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if new.user_id is not null then
    insert into public.backtest_quota (user_id, used) values (new.user_id, 1)
    on conflict (user_id) do update set used = public.backtest_quota.used + 1, updated_at = now();
  end if;
  return new;
end
$$;
drop trigger if exists backtest_quota_count on public.backtest_sessions;
create trigger backtest_quota_count after insert on public.backtest_sessions
  for each row execute function public.backtest_quota_count();

-- ---------- Політики ----------
drop policy if exists backtest_sessions_require_pro on public.backtest_sessions;
drop policy if exists backtest_sessions_require_plan on public.backtest_sessions;
create policy backtest_sessions_require_plan on public.backtest_sessions
  as restrictive for insert to authenticated
  with check (
    public.has_lite()
    or public.backtest_free_left() > 0
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'topochkanovalexandr@gmail.com'
  );

drop policy if exists backtest_trades_require_pro on public.backtest_trades;
drop policy if exists backtest_trades_require_plan on public.backtest_trades;
create policy backtest_trades_require_plan on public.backtest_trades
  as restrictive for insert to authenticated
  with check (
    public.backtest_session_open(session_id)
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'topochkanovalexandr@gmail.com'
  );

-- Telegram-бот — з Lite.
drop policy if exists tg_links_require_pro on public.tg_links;
drop policy if exists tg_links_require_plan on public.tg_links;
create policy tg_links_require_plan on public.tg_links
  as restrictive for insert
  with check (public.has_lite());

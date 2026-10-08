-- Режим бектесту: 'chart' — на реальному графіку, 'manual' — ручний журнал.
-- settings: ризик на угоду, таймфрейм на старті, дата старту реплею.
alter table public.backtest_sessions
  add column if not exists mode text not null default 'manual',
  add column if not exists settings jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.backtest_sessions
    add constraint backtest_sessions_mode_check check (mode in ('manual', 'chart'));
exception when duplicate_object then null; end $$;

-- Старі бектести, в яких уже є угоди з графіка, — одразу в режим графіка.
update public.backtest_sessions s
   set mode = 'chart'
 where s.mode = 'manual'
   and exists (
     select 1 from public.backtest_trades t
      where t.session_id = s.id
        and t.tda_data ? 'chart'
   );

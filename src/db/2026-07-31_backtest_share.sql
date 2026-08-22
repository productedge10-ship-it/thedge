-- ==================================================================
-- EDGE JOURNAL — публічні бектести
-- Виконати у Supabase → SQL Editor. Ідемпотентний.
--
-- Самі бектести вже лежать у базі. Тут додається лише можливість
-- відкрити конкретну сесію за посиланням — разом з її угодами,
-- бо без угод показувати нічого.
-- ==================================================================

alter table public.backtest_sessions
  add column if not exists is_public boolean not null default false;

-- Нотатка автора до публічної сторінки: що це за прогін і навіщо
alter table public.backtest_sessions
  add column if not exists summary text;

-- ------------------------------------------------------------------
-- Публічний доступ
-- ------------------------------------------------------------------

drop policy if exists backtest_sessions_public_read on public.backtest_sessions;
create policy backtest_sessions_public_read
  on public.backtest_sessions
  for select
  to anon, authenticated
  using (is_public = true);

-- Угоди відкритої сесії видно разом із нею. Перевіряємо через
-- підзапит на саму сесію, тому чужі угоди не витікають.
drop policy if exists backtest_trades_public_read on public.backtest_trades;
create policy backtest_trades_public_read
  on public.backtest_trades
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.backtest_sessions s
      where s.id = backtest_trades.session_id
        and s.is_public = true
    )
  );

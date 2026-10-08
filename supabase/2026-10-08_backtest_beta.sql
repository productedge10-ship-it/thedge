-- Бектести лише для тестувальників: база не дає створювати сесії й угоди нікому, крім двох пошт.
-- Читання не чіпаємо, щоб працювали публічні посилання на звіти (/shared/backtest/:id).
drop policy if exists backtest_beta_sessions on public.backtest_sessions;
create policy backtest_beta_sessions on public.backtest_sessions
  as restrictive for insert to authenticated
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) in ('h1f3st@gmail.com', 'andreejdhh@gmail.com', 'zozuk.ruslana2006@gmail.com'));

drop policy if exists backtest_beta_trades on public.backtest_trades;
create policy backtest_beta_trades on public.backtest_trades
  as restrictive for insert to authenticated
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) in ('h1f3st@gmail.com', 'andreejdhh@gmail.com', 'zozuk.ruslana2006@gmail.com'));

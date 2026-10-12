-- Бектести відкриті всім (платний доступ — через підписку на рівні застосунку): знімаємо обмеження за поштами.
drop policy if exists backtest_beta_sessions on public.backtest_sessions;
drop policy if exists backtest_beta_trades on public.backtest_trades;

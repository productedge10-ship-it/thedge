-- Pro на рівні бази, а не тільки в інтерфейсі.
--
-- Кнопки MT5-автоімпорту, Telegram-бота й бектестів на Free ховає
-- застосунок — але RLS на самих таблицях перевіряла лише «це моя
-- строка», без «чи є в мене Pro». Будь-хто, відкривши консоль
-- браузера, міг напряму через REST API Supabase вставити рядок у
-- mt5_accounts чи tg_links своїм anon-токеном, і воркер почав би
-- синхронізацію чи бот — обійшовши оплату повністю.
--
-- RESTRICTIVE-політика не замінює наявні permissive (вони й далі
-- працюють як є — «це моє»), а додається до них через AND: щоб
-- вставити рядок, тепер потрібно і бути власником, і мати Pro.
-- Старі owner-політики цей файл не чіпає.

drop policy if exists mt5_accounts_require_pro on public.mt5_accounts;
create policy mt5_accounts_require_pro on public.mt5_accounts
  as restrictive for insert
  with check (public.is_pro());

drop policy if exists tg_links_require_pro on public.tg_links;
create policy tg_links_require_pro on public.tg_links
  as restrictive for insert
  with check (public.is_pro());

drop policy if exists backtest_sessions_require_pro on public.backtest_sessions;
create policy backtest_sessions_require_pro on public.backtest_sessions
  as restrictive for insert
  with check (public.is_pro());

drop policy if exists backtest_trades_require_pro on public.backtest_trades;
create policy backtest_trades_require_pro on public.backtest_trades
  as restrictive for insert
  with check (public.is_pro());

-- Рахунки (prop_accounts) — не заблоковані повністю, у Free є ліміт 5.
-- Той самий трюк: рахувати можна скільки завгодно, але вставити
-- шостий рядок без Pro не вийде, хай там що каже клієнтський код.
drop policy if exists prop_accounts_free_limit on public.prop_accounts;
create policy prop_accounts_free_limit on public.prop_accounts
  as restrictive for insert
  with check (
    public.is_pro()
    or (select count(*) from public.prop_accounts p where p.user_id = auth.uid()) < 5
  );

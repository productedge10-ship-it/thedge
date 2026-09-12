-- ==================================================================
-- EDGE JOURNAL — тижневі плани
-- Виконати у Supabase → SQL Editor. Ідемпотентний.
--
-- Дотепер `trading_plans` знав тільки один масштаб: день + актив.
-- Тижневий план — це не менший денний план, а рівень вище: теза на
-- ринок цілого тижня і список активів, за якими цього тижня варто
-- стежити (список може бути порожнім — буває тиждень без чіткої
-- ідеї, і це так само чесний результат, як і план на п'ять активів).
--
-- Замість другої таблиці — той самий trading_plans з дискримінатором
-- plan_type. Це свідомий вибір: список у «Аналізах», пошук, фільтр
-- за датою — все це вже вміє одну таблицю, і дублювати цю механіку
-- під другу модель означало б підтримувати два майже однакових
-- списки назавжди.
--
-- Домовленості для рядків із plan_type = 'weekly':
--   • date  — понеділок того тижня (не довільний день);
--   • pair  — завжди 'ALL': тижневий план не про один інструмент,
--             тому «унікальний за тиждень» рахується так само, як
--             «унікальний за день+актив» для денного;
--   • plan_data.assets — масив спостережуваних активів, кожен зі
--     своїм bias/рівнями/нотатками. Порожній масив — валідний стан.
-- ==================================================================

alter table public.trading_plans
  add column if not exists plan_type text not null default 'daily';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trading_plans_plan_type_chk'
  ) then
    alter table public.trading_plans
      add constraint trading_plans_plan_type_chk check (plan_type in ('daily', 'weekly'));
  end if;
end $$;

-- Старий унікальний індекс (user_id, date, pair) не розрізняв би
-- денний план на 'ALL' від тижневого того самого тижня, якби колись
-- такий актив завели вручну. Перебудовуємо з урахуванням типу.
drop index if exists trading_plans_user_date_pair_key;
create unique index if not exists trading_plans_user_date_pair_type_key
  on public.trading_plans (user_id, date, pair, plan_type);

-- Швидкий фільтр списку в «Аналізах» — Daily/Weekly одним запитом,
-- без сканування всієї таблиці користувача.
create index if not exists trading_plans_user_type_date_idx
  on public.trading_plans (user_id, plan_type, date desc);

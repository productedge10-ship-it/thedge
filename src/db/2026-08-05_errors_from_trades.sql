-- ==================================================================
-- EDGE JOURNAL — помилка з угоди летить у журнал помилок
-- Виконати у Supabase → SQL Editor. Ідемпотентний.
--
-- З фідбеку: «оця помилка я так і не знайшов куди клацнуть, вона
-- пишеться, як з нею працювати. Якби вона автоматом летіла в журнал
-- помилок, це було б зручно потім їх там перебирати».
--
-- Досі опис помилки жив у самій угоді (trades.mistake_description), а
-- журнал помилок наповнювався окремо вручну. Тобто людина описувала
-- те саме двічі або не описувала ніде — а журнал помилок при цьому
-- один з головних розділів.
--
-- Три поля закривають розрив:
--   trade_id  — звідки запис прийшов і куди повернутись;
--   source    — щоб автоматичний запис було видно і його не плутали
--               з тим, що людина завела руками;
--   resolved  — сам сенс журналу помилок: помилку мало зафіксувати,
--               її треба потім перебрати. Без цього поля «перебрати»
--               нічим не відрізняється від «прочитати».
-- ==================================================================

alter table public.trade_errors
  -- cascade, а не set null: цей запис не має власного життя, він
  -- дзеркало помилки в угоді. Немає угоди — немає й дзеркала.
  -- Помилки, заведені руками, мають trade_id = null і не зачіпаються.
  add column if not exists trade_id uuid references public.trades(id) on delete cascade;

alter table public.trade_errors
  add column if not exists source text not null default 'manual';

alter table public.trade_errors
  add column if not exists resolved boolean not null default false;

-- Один запис на угоду. Саме цей індекс не дає наплодити дублів при
-- повторному збереженні тієї самої угоди: синхронізація спирається
-- на нього, а не на перевірку в коді.
create unique index if not exists trade_errors_trade_uniq
  on public.trade_errors (trade_id)
  where trade_id is not null;

-- Нерозібране піднімається першим — це основний режим сторінки
create index if not exists trade_errors_user_open_idx
  on public.trade_errors (user_id, resolved, error_date desc);

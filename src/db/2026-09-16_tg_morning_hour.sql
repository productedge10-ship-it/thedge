-- ------------------------------------------------------------------
-- О котрій нагадувати про план
--
-- Досі година жила в .env воркера — тобто була одна на всіх. Але це
-- налаштування особисте: хтось пише план о восьмій, хтось о десятій,
-- і спільне значення означає, що комусь воно приходить не вчасно й
-- перестає працювати як нагадування.
--
-- Межі свідомо вузькі. Нагадування про план має сенс лише до
-- відкриття Лондона; о шостій його ніхто не прочитає, о другій дня
-- воно вже безглузде. Перевірка тут — не формальність, а те, що
-- заважає випадковому значенню з клієнта стати тихою поломкою.
-- ------------------------------------------------------------------

alter table public.user_settings
  add column if not exists tg_morning_hour smallint not null default 9;

alter table public.user_settings
  drop constraint if exists user_settings_tg_morning_hour_check;

alter table public.user_settings
  add constraint user_settings_tg_morning_hour_check
  check (tg_morning_hour between 6 and 12);

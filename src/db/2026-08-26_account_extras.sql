-- ==================================================================
-- EDGE JOURNAL — ліміти проп-фірми, закриття акаунта, авто-рух
-- балансу від угод.
-- Виконати у Supabase → SQL Editor. Ідемпотентний.
-- ==================================================================

-- ---------- 1. Ліміти ризику проп-фірми ----------
-- Просто зберігаємо на акаунті те, що вписав користувач при
-- створенні (напр. FTMO: 5% денний / 10% загальний). Поки що ніде
-- не рахується автоматично — це майданчик під майбутню перевірку.
alter table public.prop_accounts
  add column if not exists max_daily_loss_pct numeric,
  add column if not exists max_total_loss_pct numeric;

-- ---------- 2. Закриття акаунта ----------
-- status лишається як є ('Active' і т.д.), сюди пишемо лише деталі
-- закриття: коли і чому. Акаунт при цьому не видаляється — вся
-- історія лишається на місці.
alter table public.prop_accounts
  add column if not exists closed_at timestamptz,
  add column if not exists closed_reason text;

-- ---------- 3. Рух балансу від угод ----------
-- account_events.kind мав лише start/payout/deposit/adjust. Тепер
-- запис угоди з профітом на прив'язаному проп-акаунті сам додає
-- подію kind='trade' — щоб баланс акаунта відповідав реальності,
-- а не лише ручним виплатам/коригуванням.
alter table public.account_events drop constraint if exists account_events_kind_check;
alter table public.account_events
  add constraint account_events_kind_check
  check (kind in ('start', 'payout', 'deposit', 'adjust', 'trade'));

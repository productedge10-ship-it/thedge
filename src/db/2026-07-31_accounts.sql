-- ==================================================================
-- EDGE JOURNAL — акаунти: розмір рахунку та історія руху грошей
-- Виконати у Supabase → SQL Editor. Ідемпотентний.
--
-- Деталка акаунта показувала намальовані цифри: графік по вигаданих
-- точках, виплати списком-заглушкою. Щоб вона показувала реальність,
-- потрібні дві речі:
--   1) початковий розмір рахунку — щоб було від чого рахувати прибуток;
--   2) журнал подій — щоб знати, коли й на скільки баланс змінювався.
--
-- Головний сценарій: акаунт на 10 000 → наторгував до 11 000 →
-- вписав виплату 1 000 → баланс знову 10 000, а тисяча назавжди
-- лишилась в історії.
-- ==================================================================

-- ---------- 1. Розмір рахунку ----------
-- balance — це поточний стан, він гуляє. Початковий розмір потрібен
-- окремо: саме до нього повертається рахунок після виплати прибутку.
alter table public.prop_accounts
  add column if not exists initial_balance numeric;

update public.prop_accounts
   set initial_balance = balance
 where initial_balance is null;

-- ---------- 2. Журнал подій ----------
create table if not exists public.account_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id    uuid not null references public.prop_accounts(id) on delete cascade,

  -- start   — точка відліку, створюється разом з акаунтом
  -- payout  — виплата: баланс зменшується
  -- deposit — поповнення чи апгрейд рахунку: баланс зростає
  -- adjust  — ручне виправлення балансу на конкретне число
  kind          text not null check (kind in ('start', 'payout', 'deposit', 'adjust')),

  amount        numeric not null default 0,

  -- Баланс ПІСЛЯ події. Зберігаємо готовим, щоб малювати графік
  -- одним проходом і не перераховувати всю історію щоразу.
  balance_after numeric not null,

  note          text not null default '',

  -- Дата, до якої належить подія: виплату можна вписати наступного дня
  happened_at   date not null default (timezone('utc', now()))::date,
  created_at    timestamptz not null default timezone('utc', now())
);

create index if not exists account_events_acc_idx
  on public.account_events (account_id, happened_at, created_at);

create index if not exists account_events_user_idx
  on public.account_events (user_id, happened_at desc);

alter table public.account_events enable row level security;
alter table public.account_events force row level security;

drop policy if exists account_events_owner_select on public.account_events;
drop policy if exists account_events_owner_insert on public.account_events;
drop policy if exists account_events_owner_update on public.account_events;
drop policy if exists account_events_owner_delete on public.account_events;

create policy account_events_owner_select on public.account_events
  for select to authenticated using (user_id = auth.uid());

create policy account_events_owner_insert on public.account_events
  for insert to authenticated with check (user_id = auth.uid());

create policy account_events_owner_update on public.account_events
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy account_events_owner_delete on public.account_events
  for delete to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------------
-- Етапи проп-челенджу
--
-- prop_accounts досі мав один незмінний набір правил на весь час
-- життя рахунку: max_daily_loss_pct, max_total_loss_pct. У
-- реальності проп-челендж — не один набір, а послідовність етапів
-- (Фаза 1 → Фаза 2 → Funded), і в кожного своя ціль, а часом і свій
-- ліміт. Перехід на новий етап — це новий відлік: баланс і просадка
-- знову рахуються від нуля, а не продовжують криву з попереднього.
--
-- Тому це окрема таблиця, а не поле phase на рахунку: інакше перехід
-- на другий етап стирав би слід першого (з чим пройшов, скільки днів
-- зайняло) назавжди.
--
-- Ліміти (daily_loss_pct/max_drawdown_pct) — nullable: null означає
-- «як на рахунку» (prop_accounts.max_daily_loss_pct/max_total_loss_pct),
-- а не 0. Денний ліміт зазвичай спільний для всіх етапів; дублювати
-- його в кожен рядок означало б, що зміна на рахунку не долетить до
-- вже створених етапів і цифри розʼїдуться. target_pct дублювати
-- нема сенсу — це якраз те, що відрізняється етап від етапу.
-- ------------------------------------------------------------------

create table if not exists public.account_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.prop_accounts(id) on delete cascade,

  label text not null default 'Фаза 1',

  -- null = успадкувати з prop_accounts (max_daily_loss_pct/max_total_loss_pct).
  target_pct numeric,
  daily_loss_pct numeric,
  max_drawdown_pct numeric,

  -- Баланс рахунку в момент старту цього етапу — від нього рахується
  -- прогрес до цілі й просадка, а не від initial_balance рахунку.
  starting_balance numeric not null default 0,

  -- active — рівно один на рахунок (див. унікальний індекс нижче),
  -- passed / failed — етап завершений і лишається в історії як був.
  status text not null default 'active' check (status in ('active', 'passed', 'failed')),

  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_phases_account_idx
  on public.account_phases (account_id, started_at);

-- Один активний етап на рахунок — гарантія на рівні бази, а не лише
-- в коді: подвійний клік «наступна фаза» не заведе два активні рядки.
create unique index if not exists account_phases_one_active_idx
  on public.account_phases (account_id)
  where status = 'active';

alter table public.account_phases enable row level security;

drop policy if exists account_phases_select on public.account_phases;
create policy account_phases_select
  on public.account_phases
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists account_phases_insert on public.account_phases;
create policy account_phases_insert
  on public.account_phases
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists account_phases_update on public.account_phases;
create policy account_phases_update
  on public.account_phases
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists account_phases_delete on public.account_phases;
create policy account_phases_delete
  on public.account_phases
  for delete
  to authenticated
  using (user_id = auth.uid());

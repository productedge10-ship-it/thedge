-- Адаптивна черга MT5.
--
-- Було: кожен рахунок синхронізувався раз на 30 хвилин — вдень, уночі й у
-- неділю однаково. Удень цього мало (угоду закрив, а в журналі її ще пів
-- години немає), уночі й на вихідних — забагато.
--
-- Стало: інтервал рахує база, а не воркер, з трьох речей.
--
--   1. Час доби. У робочі години ринку — часто, поза ними — рідше, на
--      вихідних — рідко (крім фірм, які торгують крипту й на вихідних).
--   2. Навантаження. Один воркер обробляє рахунки по черзі, і кожен
--      забирає свої секунди. Якщо рахунків стало стільки, що за «часто»
--      черга не встигає обійти всіх, інтервал сам розтягується рівно
--      настільки, щоб встигала. Без цього черга відставала б дедалі
--      більше, і «кожні 3 хвилини» на ділі означало б «коли дійде».
--      Скільки триває один прохід, база міряє сама (claim → done).
--   3. Попит. Людина відкрила журнал — її рахунки стають першими в черзі
--      (mt5_sync_now). Свіжі дані потрібні саме тоді, коли на них дивляться.
--
-- Воркер на VPS правити НЕ треба: він і далі передає p_interval у
-- mt5_done, просто тепер база ним не користується.
--
-- Усі числа — в одному рядку mt5_sync_config. Змінити «години пік» чи
-- інтервали можна прямо в Table Editor, без коду й без перезапуску
-- воркера: наступний же прохід візьме нові значення.

-- ------------------------------------------------------------------
-- Налаштування
-- ------------------------------------------------------------------
create table if not exists public.mt5_sync_config (
  id                int primary key default 1 check (id = 1),
  tz                text     not null default 'Europe/Kyiv',
  peak_from         time     not null default '08:00',
  peak_to           time     not null default '16:00',
  peak_interval     interval not null default '3 minutes',
  offpeak_interval  interval not null default '15 minutes',
  weekend_interval  interval not null default '60 minutes',
  -- Фірми, чиї рахунки торгують і на вихідних (крипта): для них субота
  -- й неділя — звичайні дні.
  weekend_brokers   text[]   not null default '{cryptofundtrader}',
  -- Запас, щоб черга не йшла впритул: 1.2 = на 20% повільніше за
  -- граничну швидкість воркера.
  headroom          numeric  not null default 1.2,
  -- Скільки вважати тривалістю проходу, поки рахунок ще жодного разу не
  -- міряли.
  default_duration  interval not null default '20 seconds',
  -- Як часто людина може «підштовхнути» свої рахунки, відкриваючи журнал.
  nudge_cooldown    interval not null default '60 seconds'
);

insert into public.mt5_sync_config (id) values (1) on conflict (id) do nothing;

-- Читає й пише лише база (функції нижче) і адмін у Table Editor.
alter table public.mt5_sync_config enable row level security;

-- ------------------------------------------------------------------
-- Що база тепер знає про кожен прохід
-- ------------------------------------------------------------------
alter table public.mt5_accounts
  add column if not exists last_claimed_at timestamptz,
  add column if not exists last_worker     text,
  add column if not exists last_duration   interval,
  add column if not exists wanted_at       timestamptz;

-- ------------------------------------------------------------------
-- Через скільки синхронізувати рахунок наступного разу
-- ------------------------------------------------------------------
create or replace function public.mt5_next_interval(p_broker text)
returns interval
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c        public.mt5_sync_config;
  local_ts timestamp;
  base     interval;
  workers  int;
  total    interval;
  floor_i  interval;
begin
  select * into c from public.mt5_sync_config where id = 1;
  if not found then return interval '30 minutes'; end if;

  local_ts := now() at time zone c.tz;

  if extract(isodow from local_ts) in (6, 7)
     and not (coalesce(p_broker, '') = any (c.weekend_brokers)) then
    base := c.weekend_interval;
  elsif local_ts::time >= c.peak_from and local_ts::time < c.peak_to then
    base := c.peak_interval;
  else
    base := c.offpeak_interval;
  end if;

  -- Скільки воркерів реально працює: ті, хто брав рахунки за останні
  -- 15 хвилин. Другий воркер на VPS — і черга сама стає вдвічі швидшою.
  select greatest(1, count(distinct last_worker))
    into workers
    from public.mt5_accounts
   where last_claimed_at > now() - interval '15 minutes';

  -- Повний обхід черги: сума тривалостей усіх живих рахунків.
  select coalesce(sum(coalesce(last_duration, c.default_duration)), interval '0')
    into total
    from public.mt5_accounts
   where status in ('pending', 'active', 'error')
     and fail_count < 10;

  floor_i := total / workers * c.headroom;

  return greatest(base, floor_i);
end
$$;

-- ------------------------------------------------------------------
-- Взяти рахунок у роботу
-- ------------------------------------------------------------------
-- Порядок: щойно підключені → ті, кого чекає людина з відкритим
-- журналом → решта за чергою.
create or replace function public.mt5_claim(
  p_worker text,
  p_limit  int      default 1,
  p_lease  interval default '2 minutes'
)
returns setof public.mt5_accounts
language plpgsql
security definer
set search_path = public
as $$
begin
  set local lock_timeout = '500ms';
  set local statement_timeout = '5s';

  return query
  with picked as (
    select id from public.mt5_accounts
     where status in ('pending', 'active', 'error')
       and fail_count < 10
       and (next_sync_at <= now() or wanted_at is not null)
       and (locked_until is null or locked_until < now())
     order by (status = 'pending') desc,
              (wanted_at is not null) desc,
              wanted_at nulls last,
              next_sync_at
     limit p_limit
     for update skip locked
  )
  update public.mt5_accounts a
     set locked_until    = now() + p_lease,
         locked_by       = p_worker,
         last_claimed_at = now(),
         last_worker     = p_worker
    from picked
   where a.id = picked.id
  returning a.*;
end
$$;

-- ------------------------------------------------------------------
-- Відзвітувати про прохід
-- ------------------------------------------------------------------
-- Сигнатура та сама, щоб воркер не довелось чіпати. p_interval лишився
-- для сумісності й більше не використовується.
create or replace function public.mt5_done(
  p_id       uuid,
  p_ok       boolean,
  p_error    text     default null,
  p_interval interval default '30 minutes'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mt5_accounts set
    status       = case when p_ok then 'active' else 'error' end,
    last_error   = case when p_ok then null else left(p_error, 500) end,
    last_sync_at = case when p_ok then now() else last_sync_at end,
    fail_count   = case when p_ok then 0 else fail_count + 1 end,
    next_sync_at = case
      when p_ok then now() + public.mt5_next_interval(broker)
      else now() + least(
        (power(2, least(fail_count, 5)) * interval '1 minute'),
        interval '1 hour')
    end,
    -- Тривалість проходу. Стеля — 5 хвилин: якщо воркер упав посеред
    -- рахунку й повернувся пізніше, ця пауза не має роздути оцінку
    -- навантаження на всю чергу.
    last_duration = case
      when last_claimed_at is null then last_duration
      else least(now() - last_claimed_at, interval '5 minutes')
    end,
    wanted_at    = null,
    locked_until = null,
    locked_by    = null
  where id = p_id;
end
$$;

-- ------------------------------------------------------------------
-- «Я дивлюсь — оновіть мене зараз»
-- ------------------------------------------------------------------
-- Викликає застосунок, коли людина відкриває журнал. Не частіше за
-- nudge_cooldown після останньої синхронізації: інакше кожне
-- перезавантаження сторінки ставило б рахунок у голову черги, і пара
-- нетерплячих людей тримала б там себе постійно.
create or replace function public.mt5_sync_now()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cd interval;
  n  int;
begin
  if auth.uid() is null then return 0; end if;
  select nudge_cooldown into cd from public.mt5_sync_config where id = 1;

  update public.mt5_accounts
     set wanted_at = now()
   where user_id = auth.uid()
     and status in ('active', 'error')
     and fail_count < 10
     and wanted_at is null
     and (last_sync_at is null or last_sync_at < now() - coalesce(cd, interval '60 seconds'))
     and next_sync_at > now()
     and (locked_until is null or locked_until < now());
  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.mt5_next_interval(text) from public, anon, authenticated;
revoke all on function public.mt5_sync_now() from public, anon;
grant execute on function public.mt5_sync_now() to authenticated;
grant execute on function public.mt5_next_interval(text) to service_role;

-- Ті, хто вже стоїть у черзі з next_sync_at на пів години вперед, не мають
-- чекати старого розкладу: підтягуємо їх під новий.
update public.mt5_accounts
   set next_sync_at = least(next_sync_at, now() + public.mt5_next_interval(broker))
 where status in ('active', 'error') and fail_count < 10;

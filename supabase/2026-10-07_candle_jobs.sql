-- ==================================================================
--  Черга «підтягни свічки» для сервера свічок EDGE.
--
--  Сайт просить місяці інструмента, якого ще немає в R2
--  (rpc request_candles). VPS (vps/candles/edge_candles.py serve)
--  бере рядки з status='pending' сервісним ключем, кладе місяці в R2
--  і ставить 'done' / 'error'.
--
--  Потрібно лише для інструментів «на запит». Основні (заливаються
--  файлом або backfill) працюють і без цієї міграції.
--
--  Запускати руками в Supabase → SQL Editor після перегляду.
-- ==================================================================

create table if not exists public.candle_jobs (
  id            bigserial primary key,
  symbol        text        not null check (symbol ~ '^[A-Za-z0-9._#!-]{1,24}$'),
  month         text        not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  priority      int         not null default 0,
  status        text        not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  bars          int,
  error         text,
  requested_by  uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  done_at       timestamptz
);

-- Один незавершений запит на місяць: повторні кліки не плодять роботу.
create unique index if not exists candle_jobs_open_uniq
  on public.candle_jobs (symbol, month) where status in ('pending', 'running');
create index if not exists candle_jobs_pending_idx
  on public.candle_jobs (priority desc, created_at) where status = 'pending';

alter table public.candle_jobs enable row level security;
-- Напряму з клієнта — нічого: лише через функцію нижче. VPS ходить
-- сервісним ключем, на нього RLS не діє.
revoke all on public.candle_jobs from anon, authenticated;

create or replace function public.request_candles(p_symbol text, p_months text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  m     text;
  added int := 0;
  open_cnt int;
begin
  if uid is null then
    raise exception 'auth required';
  end if;
  if p_symbol !~ '^[A-Za-z0-9._#!-]{1,24}$' then
    raise exception 'bad symbol';
  end if;
  if coalesce(array_length(p_months, 1), 0) = 0 or array_length(p_months, 1) > 12 then
    raise exception 'months: 1..12';
  end if;
  -- Захист від флуду: не більше 60 відкритих запитів на людину.
  select count(*) into open_cnt from candle_jobs
   where requested_by = uid and status in ('pending', 'running');
  if open_cnt > 60 then
    raise exception 'too many pending requests';
  end if;
  foreach m in array p_months loop
    if m !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
      raise exception 'bad month %', m;
    end if;
    insert into candle_jobs (symbol, month, requested_by, priority)
    values (p_symbol, m, uid, 0)
    on conflict do nothing;
    if found then added := added + 1; end if;
  end loop;
  return added;
end;
$$;

revoke all on function public.request_candles(text, text[]) from public, anon;
grant execute on function public.request_candles(text, text[]) to authenticated;

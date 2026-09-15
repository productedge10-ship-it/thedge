-- Черга синхронізації MT5.
--
-- Живе в базі, а не в памʼяті воркера: процес на VPS можна вбити будь-якої
-- миті, підняти поруч другу копію або перезавантажити машину — жоден рахунок
-- не загубиться і жоден не візьмуть двоє одночасно.
--
-- Обидві функції — SECURITY DEFINER: воркер ходить під service_role, але
-- підпирати це ще й правами ролі не варто, логіка черги має бути одна.
--
-- Стан живе в mt5_accounts: next_sync_at (коли можна брати),
-- locked_by / locked_until (оренда), fail_count (сходинка відкату),
-- status, last_error, last_sync_at.

-- ------------------------------------------------------------------
-- Взяти пачку рахунків в роботу
-- ------------------------------------------------------------------
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
  -- Черга не має права чекати. Не змогла взяти рядок за пів секунди —
  -- хай падає: воркер спробує знову через десять секунд, і нічого не
  -- станеться. А от зависле зʼєднання не звільниться саме, і коли їх
  -- назбирується пул, разом із PostgREST лягає й авторизація.
  set local lock_timeout = '500ms';
  set local statement_timeout = '5s';

  return query
  with picked as (
    select id from public.mt5_accounts
     where status in ('pending', 'active', 'error')
       and fail_count < 10
       and next_sync_at <= now()
       and (locked_until is null or locked_until < now())
     -- Щойно підключений рахунок іде поперед усіх: людина стоїть і дивиться
     -- на екран синхронізації саме зараз.
     order by (status = 'pending') desc, next_sync_at
     limit p_limit
     for update skip locked
  )
  update public.mt5_accounts a
     set locked_until = now() + p_lease, locked_by = p_worker
    from picked
   where a.id = picked.id
  returning a.*;
end
$$;

-- ------------------------------------------------------------------
-- Відзвітувати про прохід
-- ------------------------------------------------------------------
-- Помилки не забуваються, а відсовують рахунок усе далі: 1, 2, 4, 8, 16, 32 хв,
-- стеля — година. Мертвий рахунок (списаний проп, змінений пароль) перестає
-- жерти черзі час, але лишається видимим у списку з last_error.
-- На десятій поспіль mt5_claim перестає його брати взагалі.
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
      when p_ok then now() + p_interval
      else now() + least(
        (power(2, least(fail_count, 5)) * interval '1 minute'),
        interval '1 hour')
    end,
    -- Оренду знімаємо в будь-якому разі. Не відзвітував воркер взагалі —
    -- рядок повернеться в чергу сам, коли locked_until спливе.
    locked_until = null,
    locked_by    = null
  where id = p_id;
end
$$;

-- Викликає тільки воркер під service_role. Ключ у браузер не потрапляє,
-- тож анонові й залогіненому ці функції не потрібні.
revoke all on function public.mt5_claim(text, int, interval)             from public, anon, authenticated;
revoke all on function public.mt5_done(uuid, boolean, text, interval)    from public, anon, authenticated;
grant execute on function public.mt5_claim(text, int, interval)          to service_role;
grant execute on function public.mt5_done(uuid, boolean, text, interval) to service_role;

-- Індекс під сам вибір черги.
create index if not exists mt5_accounts_queue_idx
  on public.mt5_accounts (next_sync_at)
  where status in ('pending', 'active', 'error');

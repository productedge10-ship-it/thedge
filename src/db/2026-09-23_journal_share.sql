-- Поширення журналу: посилання, за яким видно журнал угод, аналітику й
-- аналізи власника — без права щось змінити.
--
-- Чому RPC, а не публічні політики RLS на trades/trading_plans. Політика
-- «читати можна, якщо в людини є посилання» не має куди прочитати сам
-- токен: анонім приходить без сесії, і сказати базі «я з посиланням X»
-- він може лише аргументом функції. До того ж політика відкрила б усю
-- таблицю кожному, хто вгадає user_id, — а тут без точного токена
-- функція не віддає нічого.
--
-- Один рядок на людину: одне посилання. «Відкликати» = видалити рядок,
-- «нове посилання» = новий токен; старе в обох випадках перестає
-- працювати одразу.

create table if not exists public.journal_shares (
  user_id    uuid primary key references auth.users on delete cascade,
  -- 32 hex-символи з gen_random_uuid: 122 біти випадковості, перебором
  -- не вгадати. pgcrypto для цього не потрібен.
  token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

alter table public.journal_shares enable row level security;

drop policy if exists journal_shares_own on public.journal_shares;
create policy journal_shares_own on public.journal_shares
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Увесь журнал за токеном одним документом
-- ------------------------------------------------------------------
-- user_id із рядків вирізаємо: у публічній відповіді справжній id
-- власника не потрібен ні для чого, а світити його назовні ні до чого.
--
-- Навмисно НЕ віддаємо: mt5_accounts (там зашифровані паролі терміналів
-- і логіни), підписку, налаштування, нотатки, завдання. Лише те, що
-- показують три сторінки перегляду.
create or replace function public.shared_journal(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_name text;
begin
  if p_token is null or length(p_token) < 16 then return null; end if;

  select user_id into v_uid from public.journal_shares where token = p_token;
  if v_uid is null then return null; end if;

  -- Лише ім'я з профілю реєстрації. Пошту не віддаємо навіть частково.
  select nullif(coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name'), '')
    into v_name
    from auth.users u where u.id = v_uid;

  return jsonb_build_object(
    'owner', jsonb_build_object('name', v_name),
    'trades', coalesce((
      select jsonb_agg(to_jsonb(t) - 'user_id') from public.trades t where t.user_id = v_uid
    ), '[]'::jsonb),
    'prop_accounts', coalesce((
      select jsonb_agg(to_jsonb(a) - 'user_id') from public.prop_accounts a where a.user_id = v_uid
    ), '[]'::jsonb),
    'trading_plans', coalesce((
      select jsonb_agg(to_jsonb(p) - 'user_id') from public.trading_plans p where p.user_id = v_uid
    ), '[]'::jsonb),
    -- Розкладка дошок аналітики — щоб гість бачив ту саму картину, що
    -- й власник, а не дефолтну.
    'user_state', coalesce((
      select jsonb_agg(jsonb_build_object('key', s.key, 'data', s.data))
        from public.user_state s
       where s.user_id = v_uid and s.key like 'analytics\_%'
    ), '[]'::jsonb)
  );
end
$$;

-- Свічки окремо й за запитом: у документі вище вони роздули б відповідь
-- у рази, а дивляться їх лише для угоди, яку відкрили.
create or replace function public.shared_candles(p_token text, p_ids text[])
returns table (source text, external_id text, data jsonb)
language sql
stable
security definer
set search_path = public
as $$
  -- Приведення типів явні: функція не має ламатись, якщо колонку
  -- колись переведуть із text у bigint чи json у jsonb.
  select c.source::text, c.external_id::text, c.data::jsonb
    from public.trade_candles c
    join public.journal_shares s on s.user_id = c.user_id
   where s.token = p_token
     and c.external_id::text = any (p_ids);
$$;

revoke all on function public.shared_journal(text) from public;
revoke all on function public.shared_candles(text, text[]) from public;
grant execute on function public.shared_journal(text) to anon, authenticated;
grant execute on function public.shared_candles(text, text[]) to anon, authenticated;

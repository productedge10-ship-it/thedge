-- ===================================================================
-- 2026-10-01. Реферальна програма.
--
-- Запустити один раз у Supabase → SQL Editor ДО деплою сайту й
-- адмінки (обидва ходять у ці таблиці й функції).
--
-- Два види посилань, одна механіка:
--   • user    — є в кожного автоматично (Settings → Referral).
--               Завжди 10% з першої оплати друга. Нараховане йде в
--               рахунок власної підписки (знімається з наступного
--               списання). Друг отримує −10% на свою першу оплату.
--   • partner — видає адмін за поштою: свій % рекламщику і свій %
--               знижки (може бути 0) тому, хто прийшов. Гроші
--               виплачуються вручну, облік виплат — тут же.
--
-- Відсоток рахується ЛИШЕ з першої оплати запрошеного. Знижка для
-- запрошеного — теж лише на першу оплату.
--
-- Усі гроші рахує сервер (service role) у _mono.mjs через функції
-- нижче; з браузера ці таблиці напряму не читаються й не пишуться.
-- ===================================================================

-- ---------- таблиці ----------
create table if not exists public.referral_codes (
  -- 8 символів без I та O, щоб код можна було продиктувати.
  code               text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  user_id            uuid not null unique references auth.users(id) on delete cascade,
  kind               text not null default 'user' check (kind in ('user', 'partner')),
  commission_percent smallint check (commission_percent between 0 and 100),
  discount_percent   smallint not null default 0 check (discount_percent between 0 and 90),
  active             boolean not null default true,
  note               text check (length(note) <= 200),
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null
);

create table if not exists public.referrals (
  -- Один запрошувач на людину: хто перший — того й людина.
  referred_id        uuid primary key references auth.users(id) on delete cascade,
  referrer_id        uuid not null references auth.users(id) on delete cascade,
  code               text not null references public.referral_codes(code) on update cascade,
  -- Знімок умов на момент приходу: якщо партнеру потім змінять
  -- знижку, людині, яка вже прийшла, обіцяне не переписується.
  discount_percent   smallint not null default 0,
  payout_kind        text not null check (payout_kind in ('credit', 'cash')),
  discount_used_at   timestamptz,
  first_paid_at      timestamptz,
  first_order_ref    text,
  commission_percent smallint,
  commission_amount  numeric(12, 2),
  currency           text,
  created_at         timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

create table if not exists public.referral_payouts (
  id          bigserial primary key,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0),
  currency    text not null default 'UAH',
  note        text check (length(note) <= 200),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);
create index if not exists referral_payouts_referrer_idx on public.referral_payouts (referrer_id);

-- Що реферальна програма зробила з конкретним замовленням: знижка
-- запрошеного (%) і скільки нарахованого кредиту з'їла ця оплата.
alter table public.payment_orders add column if not exists ref_discount smallint not null default 0;
alter table public.payment_orders add column if not exists credit_used numeric(12, 2) not null default 0;

alter table public.referral_codes   enable row level security;
alter table public.referrals        enable row level security;
alter table public.referral_payouts enable row level security;
-- Політик немає навмисно: усе читання й запис — через функції нижче.
revoke all on public.referral_codes, public.referrals, public.referral_payouts from anon, authenticated;

-- ---------- допоміжні ----------
create or replace function public.ref_new_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(a, 1 + floor(random() * length(a))::int, 1);
    end loop;
    exit when not exists (select 1 from public.referral_codes where code = c);
  end loop;
  return c;
end $$;

-- Ставка звичайного юзера: завжди 10% з першої оплати друга, від
-- кількості друзів не залежить. Аргумент лишено, щоб за потреби
-- повернути шкалу, не чіпаючи викликів. Дзеркало REF_USER_PERCENT у
-- src/lib/referral.js — міняти разом.
create or replace function public.ref_tier_percent(n integer)
returns smallint
language sql
immutable
as $$
  select 10::smallint
$$;

-- Скільки запрошених зараз платять. «Платить» = активна підписка,
-- оплачена карткою чи криптою (не промокодом), і ще не протермінована.
create or replace function public.ref_paying_count(p_referrer uuid, p_exclude uuid default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.referrals r
    join public.subscriptions s on s.user_id = r.referred_id
   where r.referrer_id = p_referrer
     and (p_exclude is null or r.referred_id <> p_exclude)
     and s.status = 'active'
     and coalesce(s.provider, '') <> 'promo'
     and (s.valid_until is null or s.valid_until > now())
$$;

-- Чи була в людини вже справжня оплата (не перевірочна гривня).
create or replace function public.ref_has_paid(p_user uuid, p_except_ref text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.payment_orders o
     where o.user_id = p_user and o.status = 'approved'
       and o.kind in ('charge', 'renew')
       and (p_except_ref is null or o.reference <> p_except_ref)
  )
$$;

-- ---------- для людини (з браузера) ----------

-- Прийшов за посиланням → закріпити запрошувача. Два шляхи:
--   • автоматично після входу (код з localStorage) — лише нові акаунти;
--   • руками в полі «Є промокод?» (p_manual = true) — той самий код
--     працює як промокод, і тоді вік акаунта не важливий. В обох
--     випадках — тільки поки людина ще жодного разу не платила.
drop function if exists public.claim_referral(text);
create or replace function public.claim_referral(p_code text, p_manual boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  me  uuid := auth.uid();
  c   public.referral_codes%rowtype;
  reg timestamptz;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into c from public.referral_codes where code = upper(trim(p_code));
  if not found or not c.active then return jsonb_build_object('ok', false, 'error', 'no_code'); end if;
  if c.user_id = me then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if exists (select 1 from public.referrals where referred_id = me) then
    return jsonb_build_object('ok', false, 'error', 'already');
  end if;
  -- Лише нові акаунти без жодної оплати: старий клієнт не може
  -- «приписати» себе другові заднім числом.
  select created_at into reg from auth.users where id = me;
  if not coalesce(p_manual, false) and reg < now() - interval '30 days' then
    return jsonb_build_object('ok', false, 'error', 'too_old');
  end if;
  if public.ref_has_paid(me) then return jsonb_build_object('ok', false, 'error', 'already_paid'); end if;

  insert into public.referrals (referred_id, referrer_id, code, discount_percent, payout_kind)
  values (me, c.user_id, c.code, c.discount_percent,
          case when c.kind = 'partner' then 'cash' else 'credit' end)
  on conflict (referred_id) do nothing;

  return jsonb_build_object('ok', true, 'discount', c.discount_percent);
end $$;

-- Знижка, яку людина отримає на першу оплату як запрошена.
create or replace function public.my_ref_discount()
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select r.discount_percent
      from public.referrals r
      join public.referral_codes c on c.code = r.code
     where r.referred_id = auth.uid()
       and r.discount_percent > 0 and r.discount_used_at is null and r.first_paid_at is null
       and c.active and not public.ref_has_paid(auth.uid())
  ), 0)::smallint
$$;

-- Усе для вкладки Referral. Код створюється при першому відкритті.
create or replace function public.my_referral()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  c      public.referral_codes%rowtype;
  paying integer;
  cur    text;
begin
  if me is null then return null; end if;
  select * into c from public.referral_codes where user_id = me;
  if not found then
    insert into public.referral_codes (code, user_id, kind, discount_percent)
    values (public.ref_new_code(), me, 'user', 10)
    on conflict (user_id) do nothing;
    select * into c from public.referral_codes where user_id = me;
  end if;

  paying := public.ref_paying_count(me);
  select coalesce(max(currency), 'UAH') into cur from public.referrals where referrer_id = me and currency is not null;

  return jsonb_build_object(
    'code', c.code,
    'kind', c.kind,
    'active', c.active,
    'commission_percent', c.commission_percent,
    'discount_percent', c.discount_percent,
    'invited', (select count(*) from public.referrals where referrer_id = me),
    'paid',    (select count(*) from public.referrals where referrer_id = me and first_paid_at is not null),
    'paying',  paying,
    'rate',    case when c.kind = 'partner' then coalesce(c.commission_percent, 0) else public.ref_tier_percent(paying) end,
    'currency', cur,
    'earned',  coalesce((select sum(commission_amount) from public.referrals where referrer_id = me), 0),
    'credit_used', coalesce((select sum(credit_used) from public.payment_orders
                              where user_id = me and status = 'approved'), 0),
    'paid_out', coalesce((select sum(amount) from public.referral_payouts where referrer_id = me), 0),
    -- Без пошти й імен: людині досить знати, скільки прийшло й хто
    -- вже заплатив. Чужі дані тут ні до чого.
    'recent', coalesce((
      select jsonb_agg(x order by x->>'at' desc)
        from (
          select jsonb_build_object(
                   'at', r.created_at, 'paid_at', r.first_paid_at,
                   'percent', r.commission_percent, 'amount', r.commission_amount, 'currency', r.currency
                 ) as x
            from public.referrals r
           where r.referrer_id = me
           order by r.created_at desc
           limit 20
        ) t
    ), '[]'::jsonb)
  );
end $$;

-- ---------- для сервера оплат (service role) ----------

-- Знижка запрошеного на ПЕРШУ оплату.
create or replace function public.referral_discount_for(p_user uuid)
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select r.discount_percent
      from public.referrals r
      join public.referral_codes c on c.code = r.code
     where r.referred_id = p_user
       and r.discount_percent > 0 and r.discount_used_at is null and r.first_paid_at is null
       and c.active and not public.ref_has_paid(p_user)
  ), 0)::smallint
$$;

-- Скільки нарахованого кредиту ще можна зняти з підписки людини.
create or replace function public.referral_credit_balance(p_user uuid, p_currency text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0,
      coalesce((select sum(commission_amount) from public.referrals
                 where referrer_id = p_user and payout_kind = 'credit'
                   and upper(coalesce(currency, '')) = upper(p_currency)), 0)
    - coalesce((select sum(credit_used) from public.payment_orders
                 where user_id = p_user and upper(currency) = upper(p_currency)
                   and status in ('approved', 'pending')), 0)
  )
$$;

-- Перша справжня оплата запрошеного пройшла → нарахувати запрошувачу.
-- Ідемпотентно: повторний виклик з тим самим замовленням нічого не міняє.
create or replace function public.referral_on_paid(p_user uuid, p_ref text, p_amount numeric, p_currency text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r   public.referrals%rowtype;
  c   public.referral_codes%rowtype;
  pct smallint := 0;
begin
  select * into r from public.referrals where referred_id = p_user for update;
  if not found or r.first_paid_at is not null then return; end if;

  -- Платив і раніше (до того, як закріпився запрошувач) — це не
  -- перша оплата, відсотка немає, але позначаємо, щоб не питати знову.
  if public.ref_has_paid(p_user, p_ref) then
    update public.referrals set first_paid_at = now(), first_order_ref = p_ref,
           commission_percent = 0, commission_amount = 0, currency = upper(p_currency)
     where referred_id = p_user;
    return;
  end if;

  select * into c from public.referral_codes where code = r.code;
  if found and c.active then
    pct := case when c.kind = 'partner' then coalesce(c.commission_percent, 0)
                else public.ref_tier_percent(public.ref_paying_count(r.referrer_id, p_user)) end;
  end if;

  update public.referrals
     set first_paid_at      = now(),
         first_order_ref    = p_ref,
         commission_percent = pct,
         commission_amount  = round(coalesce(p_amount, 0) * pct / 100.0, 2),
         currency           = upper(p_currency),
         discount_used_at   = case when discount_percent > 0 then coalesce(discount_used_at, now()) end
   where referred_id = p_user;
end $$;

-- ---------- адмінка ----------

create or replace function public.admin_ref_make_partner(
  p_email text, p_commission smallint, p_discount smallint, p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  uid    uuid;
  v_code text;
begin
  if not public.is_admin_writer() then
    raise exception 'доступ заборонено' using errcode = '42501';
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'Немає користувача з поштою %', p_email using errcode = 'P0002';
  end if;

  insert into public.referral_codes (code, user_id, kind, commission_percent, discount_percent, note, active, created_by)
  values (public.ref_new_code(), uid, 'partner', p_commission, coalesce(p_discount, 0), p_note, true, auth.uid())
  on conflict (user_id) do update
     set kind = 'partner',
         commission_percent = excluded.commission_percent,
         discount_percent   = excluded.discount_percent,
         note               = coalesce(excluded.note, public.referral_codes.note),
         active             = true
  returning referral_codes.code into v_code;

  return jsonb_build_object('code', v_code, 'user_id', uid);
end $$;

create or replace function public.admin_ref_update(
  p_code text, p_commission smallint, p_discount smallint, p_active boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin_writer() then
    raise exception 'доступ заборонено' using errcode = '42501';
  end if;
  update public.referral_codes
     set commission_percent = coalesce(p_commission, commission_percent),
         discount_percent   = coalesce(p_discount, discount_percent),
         active             = coalesce(p_active, active)
   where code = p_code;
end $$;

create or replace function public.admin_ref_partners()
returns table (
  code text, user_id uuid, email text, commission_percent smallint, discount_percent smallint,
  active boolean, note text, created_at timestamptz,
  invited bigint, paid bigint, paying integer,
  earned numeric, paid_out numeric, currency text, last_payout_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'доступ заборонено' using errcode = '42501';
  end if;
  return query
  select c.code, c.user_id, u.email::text, c.commission_percent, c.discount_percent,
         c.active, c.note, c.created_at,
         (select count(*) from public.referrals r where r.referrer_id = c.user_id),
         (select count(*) from public.referrals r where r.referrer_id = c.user_id and r.first_paid_at is not null),
         public.ref_paying_count(c.user_id),
         coalesce((select sum(r.commission_amount) from public.referrals r where r.referrer_id = c.user_id), 0),
         coalesce((select sum(p.amount) from public.referral_payouts p where p.referrer_id = c.user_id), 0),
         coalesce((select max(r.currency) from public.referrals r where r.referrer_id = c.user_id), 'UAH'),
         (select max(p.created_at) from public.referral_payouts p where p.referrer_id = c.user_id)
    from public.referral_codes c
    join auth.users u on u.id = c.user_id
   where c.kind = 'partner'
   order by c.created_at desc;
end $$;

create or replace function public.admin_ref_payout(p_user uuid, p_amount numeric, p_currency text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin_writer() then
    raise exception 'доступ заборонено' using errcode = '42501';
  end if;
  insert into public.referral_payouts (referrer_id, amount, currency, note, created_by)
  values (p_user, p_amount, upper(coalesce(p_currency, 'UAH')), p_note, auth.uid());
end $$;

-- ---------- права ----------
revoke all on function public.ref_new_code() from public, anon, authenticated;
revoke all on function public.ref_paying_count(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ref_has_paid(uuid, text) from public, anon, authenticated;
revoke all on function public.referral_discount_for(uuid) from public, anon, authenticated;
revoke all on function public.referral_credit_balance(uuid, text) from public, anon, authenticated;
revoke all on function public.referral_on_paid(uuid, text, numeric, text) from public, anon, authenticated;
-- Сервер оплат ходить ключем service_role — йому ці функції потрібні.
grant execute on function public.referral_discount_for(uuid) to service_role;
grant execute on function public.referral_credit_balance(uuid, text) to service_role;
grant execute on function public.referral_on_paid(uuid, text, numeric, text) to service_role;
grant execute on function public.ref_paying_count(uuid, uuid) to service_role;
grant execute on function public.ref_has_paid(uuid, text) to service_role;
grant execute on function public.ref_new_code() to service_role;

revoke all on function public.claim_referral(text, boolean) from public, anon;
revoke all on function public.my_referral() from public, anon;
revoke all on function public.my_ref_discount() from public, anon;
grant execute on function public.claim_referral(text, boolean) to authenticated;
grant execute on function public.my_referral() to authenticated;
grant execute on function public.my_ref_discount() to authenticated;

revoke all on function public.admin_ref_make_partner(text, smallint, smallint, text) from public, anon;
revoke all on function public.admin_ref_update(text, smallint, smallint, boolean) from public, anon;
revoke all on function public.admin_ref_partners() from public, anon;
revoke all on function public.admin_ref_payout(uuid, numeric, text, text) from public, anon;
grant execute on function public.admin_ref_make_partner(text, smallint, smallint, text) to authenticated;
grant execute on function public.admin_ref_update(text, smallint, smallint, boolean) to authenticated;
grant execute on function public.admin_ref_partners() to authenticated;
grant execute on function public.admin_ref_payout(uuid, numeric, text, text) to authenticated;

grant execute on function public.ref_tier_percent(integer) to authenticated;

-- Звичайні коди, створені до цієї версії зі знижкою 0, — на −10% другу.
update public.referral_codes set discount_percent = 10 where kind = 'user' and discount_percent = 0;

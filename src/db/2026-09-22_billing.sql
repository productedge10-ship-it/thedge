-- Оплата через WayForPay: замовлення й підписки.
--
-- Дві таблиці, і розділені вони навмисно.
--
-- `payment_orders` — те, що ми відправили в платіжну систему: сума, тариф,
-- чий це намір заплатити. Живе від натискання кнопки й назавжди: це слід
-- операції, і стирати його не можна навіть коли оплата провалилась.
--
-- `subscriptions` — поточний стан доступу. Рівно один рядок на людину, і
-- саме його питає застосунок, коли вирішує, показувати Pro чи ні.
--
-- Розділені тому, що це різні питання. «Скільки разів він платив» і «чи
-- має він доступ зараз» — не одне й те саме, і зберігання їх в одній
-- таблиці рано чи пізно дає рядок, який одночасно і історія, і стан.

-- ------------------------------------------------------------------
-- Замовлення
-- ------------------------------------------------------------------
create table if not exists public.payment_orders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,

  -- Те, що йде в WayForPay як orderReference. Окреме поле, а не id:
  -- у них це рядок, який видно платнику, і плодити в ньому наші uuid
  -- з дефісами ні до чого.
  reference   text not null unique,

  plan        text not null,                       -- pro_monthly | pro_yearly
  amount      numeric(12,2) not null,
  currency    text not null default 'UAH',

  -- pending → approved | declined | refunded. Рухається тільки колбеком.
  status      text not null default 'pending',

  -- Сире тіло колбека. Коли за півроку виникне суперечка «я платив», це
  -- єдине, що відповість на неї без листування з підтримкою.
  payload     jsonb,

  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

create index if not exists payment_orders_user on public.payment_orders (user_id, created_at desc);

alter table public.payment_orders enable row level security;

-- Читати своє — можна. Писати з браузера не можна НІЧОГО: і створення
-- замовлення, і зміна статусу йдуть через serverless із службовим ключем.
-- Інакше будь-хто відкриє консоль і поставить собі status = 'approved'.
drop policy if exists payment_orders_read on public.payment_orders;
create policy payment_orders_read on public.payment_orders
  for select using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Підписка
-- ------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id     uuid primary key references auth.users on delete cascade,

  plan        text not null default 'free',        -- free | pro
  -- inactive | trialing | active | past_due | canceled
  --
  -- `trialing` окремо від `active` навмисно. Доступ той самий, але в
  -- налаштуваннях має бути видно, що це пробний період і коли саме
  -- спишуться гроші. Людина, яку списання заскочило зненацька, не
  -- продовжує підписку — вона пише в підтримку.
  status      text not null default 'inactive',

  -- Доступ живе до цієї дати. Саме дата, а не прапорець: коли картка
  -- перестане списуватись, нічого не треба «вимикати» — доступ згасне
  -- сам. Прапорець же довелося б знімати якимось окремим процесом,
  -- який одного дня не відпрацює, і людина торгуватиме на Pro вічно.
  valid_until timestamptz,

  -- Токен картки WayForPay для наступних списань. Не реквізити —
  -- самої картки ми не бачимо й не зберігаємо.
  rec_token   text,

  last_order  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions
  for select using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Чи є доступ просто зараз
-- ------------------------------------------------------------------
-- Функцією, а не обчисленням на клієнті. Клієнтський код бачать усі, і
-- перевірка «чи я Pro», написана в браузері, нічого не захищає. Тут же
-- це одна відповідь, яку можна викликати і з застосунку, і з політики
-- RLS на будь-якій платній таблиці.
create or replace function public.is_pro(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
     where s.user_id = p_user
       and s.plan = 'pro'
       -- Тріал дає рівно той самий доступ, що й оплачена підписка.
       -- Інакше пробний період нічого не пробує.
       and s.status in ('active', 'trialing')
       and (s.valid_until is null or s.valid_until > now())
  );
$$;

grant execute on function public.is_pro(uuid) to authenticated;

-- ------------------------------------------------------------------
-- Рядок підписки заводиться разом із користувачем
-- ------------------------------------------------------------------
-- Щоб застосунку не доводилось розрізняти «немає підписки» і «є, але
-- free». Це два різні порожні значення для однієї й тієї самої думки, і
-- кожне місце, яке їх плутає, дає окремий баг.
create or replace function public.subscriptions_bootstrap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end
$$;

drop trigger if exists subscriptions_bootstrap_trg on auth.users;
create trigger subscriptions_bootstrap_trg
  after insert on auth.users
  for each row execute function public.subscriptions_bootstrap();

-- Тим, хто вже зареєстрований до цієї міграції.
insert into public.subscriptions (user_id)
select id from auth.users
on conflict (user_id) do nothing;

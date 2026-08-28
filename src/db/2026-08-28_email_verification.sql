-- ==================================================================
-- EDGE JOURNAL — підтвердження пошти
-- Виконати у Supabase → SQL Editor. Скрипт ідемпотентний.
--
-- Частини 1-5 вже застосовані раніше — повторний запуск нічого не
-- зламає. Нова тут частина 6: саме вона вмикає обмеження.
--
-- Навіщо власна таблиця, а не auth.users.email_confirmed_at:
--   у режимі «Confirm email = OFF» (він потрібен, щоб непідтверджений
--   юзер міг зайти на сайт) Supabase проставляє email_confirmed_at
--   ВСІМ одразу при реєстрації. Тобто поле є завжди й нічого не
--   розрізняє.
-- ==================================================================


-- ------------------------------------------------------------------
-- 1. Таблиця профілів
-- ------------------------------------------------------------------

create table if not exists public.profiles (
  id                         uuid primary key references auth.users(id) on delete cascade,
  email_verified             boolean not null default false,
  verified_at                timestamptz,
  last_verification_sent_at  timestamptz,
  created_at                 timestamptz not null default timezone('utc', now())
);


-- ------------------------------------------------------------------
-- 2. Новий юзер → рядок у profiles
--    security definer, бо тригер спрацьовує в контексті auth-схеми,
--    де у звичайної ролі немає прав на запис у public.
-- ------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ------------------------------------------------------------------
-- 3. Наявні юзери — одразу підтверджені
--    Вони реєструвалися до появи цієї механіки, тож блокувати їх
--    заднім числом не можна: інакше живі користувачі втратять доступ
--    до створення угод через зміну, якої не просили.
-- ------------------------------------------------------------------

insert into public.profiles (id, email_verified, verified_at)
select id, true, timezone('utc', now())
from auth.users
on conflict (id) do nothing;


-- ------------------------------------------------------------------
-- 4. RLS на profiles
--
--    Клієнту дозволено ТІЛЬКИ читати свій рядок. Якби він міг робити
--    update, то відкрив би консоль і поставив email_verified = true
--    сам — і весь захист став би декорацією. Прапорець ставить лише
--    сервер (service_role), який RLS обходить.
-- ------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

revoke insert, update, delete on public.profiles from authenticated, anon;
grant select on public.profiles to authenticated;


-- ------------------------------------------------------------------
-- 5. Хелпер «пошта підтверджена?»
--    Окрема security definer функція, щоб політики нижче не лізли
--    у profiles під RLS кожного разу.
-- ------------------------------------------------------------------

create or replace function public.is_email_verified()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select email_verified from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_email_verified() to authenticated;


-- ------------------------------------------------------------------
-- 6. Обмеження для непідтверджених   ← ЦЕ НОВЕ
--
--    ЧОМУ restrictive, а не звичайна політика:
--    кілька permissive-політик на одну дію Postgres обʼєднує через OR.
--    Тобто наявна {table}_owner_insert (user_id = auth.uid()) просто
--    перекрила б нову, і нічого б не блокувалося. Restrictive-політики
--    навпаки додаються через AND — саме те, що треба для обмеження.
--
--    Гейтимо лише INSERT: читати й редагувати вже створене можна.
--    Треба додати ще таблицю — допиши її в масив gated.
-- ------------------------------------------------------------------

do $$
declare
  t text;
  /* account_events тут не за компанію: через нього проходять виплати,
     а вони міняють баланс акаунта. Без нього лишалась би щілина —
     створити акаунт не можна, а рухати гроші на вже наявному можна. */
  gated text[] := array['prop_accounts', 'trades', 'account_events'];
begin
  foreach t in array gated loop
    execute format('drop policy if exists %I on public.%I', t || '_verified_insert', t);

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated
         with check (public.is_email_verified())',
      t || '_verified_insert', t);
  end loop;
end $$;

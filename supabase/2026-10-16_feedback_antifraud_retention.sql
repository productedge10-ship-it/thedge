-- ==================================================================
-- 1) Відгуки: короткий опитувальник у застосунку і причина скасування.
-- 2) Антифрод безкоштовних бектестів: ліміт рахується на «людину»,
--    а не на акаунт — акаунти з тією самою поштою (Gmail без крапок і
--    +тегів) або з того самого браузера ділять один лічильник.
-- 3) Листи повернення (win-back) колишнім платникам: 14 і 30 днів.
-- ==================================================================

-- ---------- 1. Відгуки ----------
create table if not exists public.feedback (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('pulse', 'cancel')),
  score int check (score between 1 and 5),
  likes text,
  dislikes text,
  would_pay text,
  reason text,
  comment text,
  plan text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
alter table public.feedback enable row level security;
drop policy if exists feedback_own_insert on public.feedback;
create policy feedback_own_insert on public.feedback
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists feedback_own_select on public.feedback;
create policy feedback_own_select on public.feedback
  for select to authenticated using (user_id = auth.uid());

-- ---------- 2. Антифрод ----------
create or replace function public.norm_email(e text)
returns text
language sql immutable
as $$
  select case when position('@' in x) = 0 then x else
    (case when d in ('gmail.com', 'googlemail.com')
          then replace(split_part(l, '+', 1), '.', '')
          else split_part(l, '+', 1) end)
    || '@' || (case when d = 'googlemail.com' then 'gmail.com' else d end)
  end
  from (select lower(trim(coalesce(e, ''))) x) a,
       lateral (select split_part(a.x, '@', 1) l, split_part(a.x, '@', 2) d) b;
$$;

-- Мітки браузера. Лише хеш випадкового id з localStorage — нічого
-- про пристрій ми не збираємо. З браузера таблиця недоступна.
create table if not exists public.user_marks (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  mark text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, mark)
);
create index if not exists user_marks_mark_idx on public.user_marks (kind, mark);
alter table public.user_marks enable row level security;

create or replace function public.note_device(p_mark text)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or p_mark is null or length(p_mark) < 16 or length(p_mark) > 128 then return; end if;
  -- Не більше 5 браузерів на акаунт: решта — шум, а не сигнал.
  if (select count(*) from public.user_marks where user_id = auth.uid() and kind = 'device') >= 5 then return; end if;
  insert into public.user_marks (user_id, kind, mark) values (auth.uid(), 'device', p_mark)
  on conflict do nothing;
end
$$;
revoke all on function public.note_device(text) from public;
grant execute on function public.note_device(text) to authenticated;

-- Усі акаунти тієї самої людини (один крок: пошта або браузер).
create or replace function public.free_group(p_user uuid)
returns setof uuid
language sql stable security definer
set search_path to 'public'
as $$
  select p_user
  union
  select u2.id from auth.users u1
    join auth.users u2 on public.norm_email(u2.email) = public.norm_email(u1.email)
   where u1.id = p_user and u1.email is not null
  union
  select m2.user_id from public.user_marks m1
    join public.user_marks m2 on m2.kind = m1.kind and m2.mark = m1.mark
   where m1.user_id = p_user;
$$;
revoke all on function public.free_group(uuid) from public;

create or replace function public.backtest_free_left(p_user uuid default auth.uid())
returns int
language sql stable security definer
set search_path to 'public'
as $$
  with me as (select case when auth.role() = 'service_role' then p_user else auth.uid() end id)
  select greatest(0, public.backtest_free_limit(p_user) - coalesce((
    select sum(q.used) from public.backtest_quota q
     where q.user_id in (select public.free_group((select id from me)))), 0))::int;
$$;
grant execute on function public.backtest_free_left(uuid) to authenticated, service_role;

-- ---------- 3. Листи повернення ----------
alter table public.onboard_mail add column if not exists sent_wb14_at timestamptz;
alter table public.onboard_mail add column if not exists sent_wb30_at timestamptz;

-- Журнал службових листів: кожен лист (вид + ключ) рівно один раз.
-- Писати й читати — лише сервер (service role), тож політик немає.
create table if not exists public.mail_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind    text not null,           -- welcome | canceled | ended | digest | mt5 | prop
  ref     text not null default '', -- тиждень, дата кінця доступу, рахунок…
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.mail_log enable row level security;

-- Окрема відписка від тижневого підсумку (нагадування — unsubscribed).
alter table public.onboard_mail add column if not exists digest_off boolean not null default false;

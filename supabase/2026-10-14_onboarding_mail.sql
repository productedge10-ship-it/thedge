-- Нагадування новим юзерам без угод (24 год і 3 дні).
-- Пише лише сервер службовим ключем: RLS увімкнено і політик немає,
-- тож з браузера таблиця недоступна взагалі.
create table if not exists public.onboard_mail (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  sent_24h_at   timestamptz,
  sent_3d_at    timestamptz,
  unsubscribed  boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.onboard_mail enable row level security;

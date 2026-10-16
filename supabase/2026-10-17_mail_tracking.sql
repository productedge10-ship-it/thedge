-- Статистика листів для адмінки: що надіслали (mail_sent, пише sendMail)
-- і що з листом сталось (mail_events, пише вебхук Resend /api/resend-webhook).
create table if not exists public.mail_sent (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null default 'other',
  user_id uuid,
  resend_id text unique,
  ok boolean not null default true,
  error text
);
create index if not exists mail_sent_kind_at on public.mail_sent (kind, at desc);
create table if not exists public.mail_events (
  id bigint generated always as identity primary key,
  resend_id text not null,
  type text not null,
  at timestamptz not null default now(),
  unique (resend_id, type)
);
alter table public.mail_sent enable row level security;
alter table public.mail_events enable row level security;
drop policy if exists mail_sent_admin on public.mail_sent;
create policy mail_sent_admin on public.mail_sent for select to authenticated using (public.is_admin());
drop policy if exists mail_events_admin on public.mail_events;
create policy mail_events_admin on public.mail_events for select to authenticated using (public.is_admin());
-- admin_mail_stats(p_days) і admin_mail_unsubs() — див. історію виконання (тексти ті самі, що в адмінці).

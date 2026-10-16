-- ==================================================================
-- Монітор правил пропів.
--
-- prop_rule_sources  — які сторінки дивимось (фірма, програма, адреса,
--                      опції парсера: вкладки, рендер). Пише лише адмін.
-- prop_rule_snapshots — що побачили: текст, хеш, витяг Gemini. Історія.
-- prop_rule_changes  — знайдена різниця «було / стало» + висновок
--                      Gemini. pending → адмін схвалює або відхиляє.
-- prop_rules         — чинні (схвалені) правила фірма+програма. Звідси
--                      беруть шаблони рахунків, сторінка правил і чекліст.
-- prop_rule_seen     — юзер закрив модалку про зміну.
-- prop_restricted_news — заборонені новини з календарів самих пропів.
--
-- Писати в усе, крім prop_rule_seen, може тільки сервер (service role)
-- і адмін через admin_prop_* функції.
-- ==================================================================

create table if not exists public.prop_rule_sources (
  id uuid primary key default gen_random_uuid(),
  firm text not null,                  -- як у prop_accounts.firm_name: 'FTMO'
  kind text not null default 'rules' check (kind in ('rules', 'news')),
  url text not null,
  options jsonb not null default '{}', -- {"render":true,"tabs":["Zero",…],"min_chars":1500}
  active boolean not null default true,
  last_fetch_at timestamptz,
  last_ok boolean,
  last_via text,
  last_note text,
  last_hash text,
  created_at timestamptz not null default now(),
  unique (firm, kind, url)
);

create table if not exists public.prop_rule_snapshots (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.prop_rule_sources(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  via text,
  text_hash text not null,
  text text not null,
  extracted jsonb
);
create index if not exists prop_rule_snapshots_src on public.prop_rule_snapshots (source_id, fetched_at desc);

create table if not exists public.prop_rules (
  firm text not null,
  program text not null,
  rules jsonb not null,
  approved_at timestamptz not null default now(),
  change_id uuid,
  primary key (firm, program)
);

create table if not exists public.prop_rule_changes (
  id uuid primary key default gen_random_uuid(),
  firm text not null,
  program text not null,
  source_id uuid references public.prop_rule_sources(id) on delete set null,
  old_rules jsonb,                       -- null = перший витяг (новий шаблон)
  new_rules jsonb not null,
  diff jsonb not null default '[]',      -- [{field,label,old,new}]
  conclusion text,                       -- висновок Gemini українською
  severity text not null default 'minor' check (severity in ('minor', 'major')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  excerpt text,                          -- шматок тексту сторінки для звірки
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  notified_at timestamptz
);
create index if not exists prop_rule_changes_status on public.prop_rule_changes (status, created_at desc);
create index if not exists prop_rule_changes_firm on public.prop_rule_changes (firm, created_at desc);

create table if not exists public.prop_rule_seen (
  user_id uuid not null references auth.users(id) on delete cascade,
  change_id uuid not null references public.prop_rule_changes(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, change_id)
);

create table if not exists public.prop_restricted_news (
  firm text not null,
  day date not null,
  currency text not null default '',
  title text not null,
  instruments text,
  fetched_at timestamptz not null default now(),
  primary key (firm, day, currency, title)
);
create index if not exists prop_restricted_news_day on public.prop_restricted_news (day);

-- Програма на рахунку: «2-Step», «Stellar 1-Step»… — щоб знати, які саме
-- правила показувати й з якими звіряти.
alter table public.prop_accounts add column if not exists rules_program text;

-- ---------------- RLS ----------------
alter table public.prop_rule_sources enable row level security;
alter table public.prop_rule_snapshots enable row level security;
alter table public.prop_rules enable row level security;
alter table public.prop_rule_changes enable row level security;
alter table public.prop_rule_seen enable row level security;
alter table public.prop_restricted_news enable row level security;

drop policy if exists prop_rules_read on public.prop_rules;
create policy prop_rules_read on public.prop_rules for select to authenticated using (true);

drop policy if exists prop_restricted_news_read on public.prop_restricted_news;
create policy prop_restricted_news_read on public.prop_restricted_news for select to authenticated using (true);

-- Юзер бачить лише схвалені зміни; адмін — усі.
drop policy if exists prop_rule_changes_read on public.prop_rule_changes;
create policy prop_rule_changes_read on public.prop_rule_changes for select to authenticated
  using (status = 'approved' or public.is_admin());

drop policy if exists prop_rule_sources_admin on public.prop_rule_sources;
create policy prop_rule_sources_admin on public.prop_rule_sources for select to authenticated using (public.is_admin());
drop policy if exists prop_rule_sources_admin_w on public.prop_rule_sources;
create policy prop_rule_sources_admin_w on public.prop_rule_sources for all to authenticated
  using (public.is_admin_writer()) with check (public.is_admin_writer());

drop policy if exists prop_rule_snapshots_admin on public.prop_rule_snapshots;
create policy prop_rule_snapshots_admin on public.prop_rule_snapshots for select to authenticated using (public.is_admin());

drop policy if exists prop_rule_seen_own on public.prop_rule_seen;
create policy prop_rule_seen_own on public.prop_rule_seen for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------- адмінські дії ----------------
-- Схвалити (можна з виправленими правилами) або відхилити зміну.
create or replace function public.admin_prop_change_decide(p_id uuid, p_approve boolean, p_rules jsonb default null, p_severity text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.prop_rule_changes;
begin
  if not public.is_admin_writer() then raise exception 'forbidden'; end if;
  select * into c from public.prop_rule_changes where id = p_id for update;
  if c.id is null then raise exception 'not found'; end if;
  if c.status <> 'pending' then raise exception 'already decided'; end if;

  if p_approve then
    update public.prop_rule_changes set
      status = 'approved', decided_at = now(), decided_by = auth.uid(),
      new_rules = coalesce(p_rules, new_rules),
      severity = coalesce(p_severity, severity),
      -- перший шаблон юзерам не розсилаємо: це не зміна, а знайомство
      notified_at = case when old_rules is null then now() else null end
    where id = p_id;
    insert into public.prop_rules (firm, program, rules, approved_at, change_id)
      values (c.firm, c.program, coalesce(p_rules, c.new_rules), now(), c.id)
      on conflict (firm, program) do update set rules = excluded.rules, approved_at = now(), change_id = excluded.change_id;
  else
    update public.prop_rule_changes set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = p_id;
  end if;

  insert into public.admin_audit (actor, actor_email, action, target, meta)
    values (auth.uid(), auth.jwt() ->> 'email', case when p_approve then 'prop_rules_approve' else 'prop_rules_reject' end, c.firm || ' / ' || c.program, jsonb_build_object('change', p_id));
end $$;
revoke all on function public.admin_prop_change_decide(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.admin_prop_change_decide(uuid, boolean, jsonb, text) to authenticated;

-- Позачергова перевірка: адмін ставить прапорець, сервер підхоплює на найближчому тіку.
alter table public.prop_rule_sources add column if not exists run_requested_at timestamptz;
create or replace function public.admin_prop_run_now()
returns void language sql security definer set search_path = public as $$
  update public.prop_rule_sources set run_requested_at = now() where active and public.is_admin_writer();
$$;
grant execute on function public.admin_prop_run_now() to authenticated;

-- ---------------- стартові джерела ----------------
insert into public.prop_rule_sources (firm, kind, url, options) values
  ('FTMO', 'rules', 'https://ftmo.com/en/trading-objectives/', '{}'),
  ('FundedNext', 'rules', 'https://fundednext.com/en/general-rules/cfds/trading-objectives', '{"render":true}'),
  ('FundedNext', 'rules', 'https://fundednext.com/en/general-rules/cfds/what-is-allowed', '{"render":true}'),
  ('FundedNext', 'rules', 'https://fundednext.com/en/general-rules/cfds/what-is-forbidden', '{"render":true}'),
  ('Funding Pips', 'rules', 'https://fundingpips.com/trading-objectives', '{"tabs":["Zero","1 Step Flex","2 Step Standard","2 Step Flex","2 Step Pro"]}'),
  ('FTMO', 'news', 'https://ftmo.com/en/calendar/', '{"render":true,"min_chars":800}')
on conflict (firm, kind, url) do nothing;

-- Правила проп-фірм (те, що бачить юзер на /prop-rules), з версіями.
-- Пише лише scripts/prop-rules-push.mjs (service_role) через prop_rules_publish.
-- На фірму живуть максимум дві версії: поточна і попередня. Приходить нова —
-- поточна стає попередньою, а стара попередня видаляється.
-- Якщо монітор знайшов зміну в ЧИСЛАХ (ліміти, просадка, етапи), нова версія
-- спершу лягає «на схвалення» (pending): юзери її не бачать, поки адмін не
-- натисне «Схвалити» в адмінці (prop_rules_decide). Тексти без зміни чисел
-- оновлюються на місці без схвалення.

create table if not exists public.prop_rule_versions (
  id bigint generated always as identity primary key,
  firm_id text not null,                 -- id з src/lib/brokers.js: 'ftmo', 'the5ers'…
  firm text not null,                    -- назва для показу
  data jsonb not null,                   -- { structured, rulebook, source, built_at }
  data_hash text not null,
  is_current boolean not null default true,
  pending boolean not null default false,  -- чекає схвалення адміна
  changes jsonb not null default '[]',   -- [{program, field, old, new}] відносно попередньої
  summary text,                          -- що змінилось і що це значить, простою мовою
  built_at timestamptz,
  created_at timestamptz not null default now(),
  checked_at timestamptz not null default now()
);
create unique index if not exists prop_rule_versions_current on public.prop_rule_versions (firm_id) where is_current;
create unique index if not exists prop_rule_versions_pending on public.prop_rule_versions (firm_id) where pending;
create index if not exists prop_rule_versions_firm on public.prop_rule_versions (firm_id, created_at desc);

alter table public.prop_rule_versions enable row level security;
drop policy if exists prop_rule_versions_read on public.prop_rule_versions;
create policy prop_rule_versions_read on public.prop_rule_versions for select to anon, authenticated using (not pending or public.is_admin());

create or replace function public.prop_rules_publish(p_firm_id text, p_firm text, p_data jsonb, p_hash text, p_built_at timestamptz, p_changes jsonb default '[]', p_summary text default null)
returns text language plpgsql security definer set search_path = public as $$
declare cur record;
begin
  select id, data_hash into cur from prop_rule_versions where firm_id = p_firm_id and is_current;
  if found and cur.data_hash = p_hash then
    update prop_rule_versions set checked_at = now() where id = cur.id;
    return 'same';
  end if;
  delete from prop_rule_versions where firm_id = p_firm_id and not is_current and not pending;
  update prop_rule_versions set is_current = false where firm_id = p_firm_id and is_current;
  insert into prop_rule_versions (firm_id, firm, data, data_hash, built_at, changes, summary)
    values (p_firm_id, p_firm, p_data, p_hash, p_built_at, coalesce(p_changes, '[]'), p_summary);
  return case when found then 'new' else 'first' end;
end $$;
revoke all on function public.prop_rules_publish(text, text, jsonb, text, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.prop_rules_publish(text, text, jsonb, text, timestamptz, jsonb, text) to service_role;

-- Зміна в числах від монітора → на схвалення (одна чернетка на фірму).
create or replace function public.prop_rules_stage(p_firm_id text, p_firm text, p_data jsonb, p_hash text, p_built_at timestamptz, p_changes jsonb, p_summary text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from prop_rule_versions where firm_id = p_firm_id and pending;
  insert into prop_rule_versions (firm_id, firm, data, data_hash, built_at, changes, summary, is_current, pending)
    values (p_firm_id, p_firm, p_data, p_hash, p_built_at, coalesce(p_changes, '[]'), p_summary, false, true);
end $$;
revoke all on function public.prop_rules_stage(text, text, jsonb, text, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.prop_rules_stage(text, text, jsonb, text, timestamptz, jsonb, text) to service_role;

-- Адмінка: схвалити (чернетка стає поточною, поточна — попередньою) або відхилити.
create or replace function public.prop_rules_decide(p_firm_id text, p_approve boolean)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_writer() then raise exception 'forbidden'; end if;
  if not exists (select 1 from prop_rule_versions where firm_id = p_firm_id and pending) then return 'none'; end if;
  if not p_approve then
    delete from prop_rule_versions where firm_id = p_firm_id and pending;
    return 'rejected';
  end if;
  delete from prop_rule_versions where firm_id = p_firm_id and not is_current and not pending;
  update prop_rule_versions set is_current = false where firm_id = p_firm_id and is_current;
  update prop_rule_versions set is_current = true, pending = false, created_at = now() where firm_id = p_firm_id and pending;
  return 'approved';
end $$;
revoke all on function public.prop_rules_decide(text, boolean) from public, anon;
grant execute on function public.prop_rules_decide(text, boolean) to authenticated;

-- Джерела для щоденного монітора (_propRules.mjs) по всіх пропах з автоімпорту.
-- Те саме, що качає prop-scraper/crawl_props.py. Уже наявні адреси не дублюються.
insert into public.prop_rule_sources (firm, kind, url, options)
select v.firm, v.kind, v.url, v.options::jsonb from (values
  ('FundingPips', 'index', 'https://help.fundingpips.com/api/v2/help_center/en-us/articles.json?per_page=100', '{"type":"zendesk","exclude":"legacy|bnpl|competition|affiliate|promo"}'),
  ('Alpha Capital', 'index', 'https://help.alphacapitalgroup.uk/en/', '{"type":"intercom","exclude":"competition|promo|free-trial|december|affiliate"}'),
  ('Blue Guardian', 'index', 'https://help.blueguardian.com/en/', '{"type":"intercom","exclude":"competition"}'),
  ('The5ers', 'index', 'https://wp.the5ers.com/wp-json/wp/v2/faqs?_fields=link,title,content', '{"type":"wpjson","exclude":"futures"}'),
  ('The5ers', 'rules', 'https://the5ers.com/high-stakes/', '{"title":"High Stakes"}'),
  ('The5ers', 'rules', 'https://the5ers.com/hyper-growth/', '{"title":"Hyper Growth"}'),
  ('The5ers', 'rules', 'https://the5ers.com/bootcamp/', '{"title":"Bootcamp"}'),
  ('CryptoFundTrader', 'rules', 'https://cryptofundtrader.com/evaluation-rules/', '{"title":"Evaluation rules"}'),
  ('CryptoFundTrader', 'rules', 'https://cryptofundtrader.com/faq/', '{"title":"FAQ"}'),
  ('CryptoFundTrader', 'rules', 'https://cryptofundtrader.com/terms-and-conditions/', '{"title":"Terms"}')
) as v(firm, kind, url, options)
where not exists (select 1 from public.prop_rule_sources s where s.url = v.url
  or (v.kind = 'index' and s.kind = 'index' and s.options->>'type' = v.options::jsonb->>'type'
      and lower(regexp_replace(s.firm, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(v.firm, '[^a-zA-Z0-9]', '', 'g'))));

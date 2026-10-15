-- Нагорода за безкоштовний чекліст: +1 бектест (backtest_quota.bonus).
-- Умови перевіряє база, а не браузер: є план і є угода (вручну чи з MT5).
-- Видається один раз на акаунт.
alter table public.backtest_quota add column if not exists checklist_bonus_at timestamptz;

create or replace function public.claim_checklist_bonus()
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  has_plan boolean;
  has_trade boolean;
  got timestamptz;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select exists(select 1 from public.trading_plans where user_id = uid) into has_plan;
  select exists(select 1 from public.trades where user_id = uid)
      or exists(select 1 from public.mt5_accounts where user_id = uid) into has_trade;
  if not (has_plan and has_trade) then
    return jsonb_build_object('ok', false, 'error', 'not_done', 'plan', has_plan, 'trade', has_trade);
  end if;
  insert into public.backtest_quota (user_id) values (uid) on conflict (user_id) do nothing;
  select checklist_bonus_at into got from public.backtest_quota where user_id = uid for update;
  if got is not null then return jsonb_build_object('ok', true, 'already', true); end if;
  update public.backtest_quota set bonus = bonus + 1, checklist_bonus_at = now(), updated_at = now() where user_id = uid;
  return jsonb_build_object('ok', true, 'already', false);
end
$$;
grant execute on function public.claim_checklist_bonus() to authenticated;

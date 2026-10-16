import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../context/AuthContext';

/* ==================================================================
   Правила пропів для інтерфейсу.

   Звідки дані: монітор на сервері (netlify/functions/_propRules.mjs)
   щодня читає сайти пропів, адмін схвалює — і тільки тоді правила
   потрапляють у prop_rules, а зміни стають видимими (prop_rule_changes,
   status = approved). Заборонені новини — prop_restricted_news, з
   календарів самих пропів.

   Тут — лише читання і зіставлення з рахунками юзера.
================================================================== */

/* Відкрити модалку зміни правил повторно (PropRulesAlert слухає). */
export const PROP_CHANGE_EVENT = 'edge:prop-change';
export const openPropChange = (change) => window.dispatchEvent(new CustomEvent(PROP_CHANGE_EVENT, { detail: change }));

/* «FTMO», «ftmo», «Funding Pips», «FundingPips» — одна фірма. */
export const firmKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* Назва рахунку часто довша за назву фірми: з MT5 приходить
   «FTMO Challenge Swing USD». Тому «містить», а не «дорівнює». */
export const sameFirm = (accountName, firm) => {
  const a = firmKey(accountName); const f = firmKey(firm);
  return !!a && !!f && a.includes(f);
};

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let cache = { uid: null, at: 0, data: null, wait: null };

export async function loadPropContext(uid, force = false) {
  if (!uid) return null;
  if (!force && cache.uid === uid && cache.data && Date.now() - cache.at < 5 * 60_000) return cache.data;
  if (!force && cache.uid === uid && cache.wait) return cache.wait;

  cache.uid = uid;
  cache.wait = (async () => {
    const { data: accs } = await supabase.from('prop_accounts')
      .select('id,firm_name,rules_program,status,created_at,initial_balance')
      .eq('user_id', uid).eq('status', 'Active');
    const accounts = accs || [];
    const firms = [...new Set(accounts.map((a) => a.firm_name).filter(Boolean))];
    if (!firms.length) return { accounts, rules: [], changes: [], news: [], faq: [], status: [], books: [] };

    const from = new Date(); from.setDate(from.getDate() - 1);
    const to = new Date(); to.setDate(to.getDate() + 14);
    const [rules, changes, news, faq, status, books] = await Promise.all([
      supabase.from('prop_rules').select('firm,program,rules,approved_at'),
      supabase.from('prop_rule_changes').select('id,firm,program,diff,conclusion,severity,old_rules,new_rules,decided_at,created_at')
        .eq('status', 'approved').not('old_rules', 'is', null).order('decided_at', { ascending: false }).limit(60),
      supabase.from('prop_restricted_news').select('firm,day,currency,title,instruments')
        .gte('day', ymd(from)).lte('day', ymd(to)),
      supabase.from('prop_faq').select('id,firm,topic,question,answer,programs,source_urls,position,updated_at').order('position'),
      supabase.from('prop_firm_status').select('firm,pages_total,pages_relevant,checked_at,faq_at,last_change_at'),
      supabase.from('prop_rulebook').select('firm,content,updated_at'),
    ]);
    const mine = (r) => firms.some((f) => sameFirm(f, r.firm));
    return {
      accounts,
      rules: (rules.data || []).filter(mine),
      changes: (changes.data || []).filter(mine),
      news: (news.data || []).filter(mine),
      faq: (faq.data || []).filter(mine),
      status: (status.data || []).filter(mine),
      books: (books.data || []).filter(mine),
    };
  })().catch(() => ({ accounts: [], rules: [], changes: [], news: [], faq: [], status: [], books: [] }));

  const data = await cache.wait;
  cache = { uid, at: Date.now(), data, wait: null };
  return data;
}

export function usePropContext() {
  const { user } = useAuth();
  const [ctx, setCtx] = useState(null);
  useEffect(() => {
    let alive = true;
    loadPropContext(user?.id).then((d) => { if (alive) setCtx(d); });
    return () => { alive = false; };
  }, [user?.id]);
  return ctx;
}

export const refreshPropContext = (uid) => loadPropContext(uid, true);

/* Правила, що стосуються рахунку: обрана програма або, якщо не обрана
   і програма в фірми одна, — вона. */
export function rulesForAccount(ctx, acc) {
  if (!ctx || !acc) return null;
  const list = ctx.rules.filter((r) => sameFirm(acc.firm_name, r.firm));
  if (acc.rules_program) return list.find((r) => r.program === acc.rules_program) || null;
  return list.length === 1 ? list[0] : null;
}

export const programsFor = (ctx, accountName) => (ctx?.rules || []).filter((r) => sameFirm(accountName, r.firm)).map((r) => r.program);

/* Подія календаря збігається із забороненою, якщо той самий день
   (±1 через пояси), та сама валюта і назви збігаються на більшість
   слів: у TradingView «Core CPI MoM», у ForexFactory/FTMO «Core CPI m/m». */
/* Назви в TradingView і ForexFactory (звідки календарі пропів) різні:
   «Core Inflation Rate MoM» = «Core CPI m/m», «Non Farm Payrolls» =
   «Non-Farm Employment Change», «Fed Hammack Speech» = «FOMC Member
   Hammack Speaks». Зводимо до спільних слів перед порівнянням. */
const PHRASES = [
  [/inflation rate/g, 'cpi'], [/consumer price index/g, 'cpi'], [/producer price index/g, 'ppi'],
  [/non[- ]?farm (payrolls|employment change)/g, 'nfp'], [/fomc|federal reserve|fed\b/g, 'fed'],
  [/interest rate decision|rate decision|rate statement|cash rate|official bank rate|main refinancing rate/g, 'rate'],
  [/speech|speaks|testifies|testimony/g, 'speak'], [/unemployment claims|initial jobless claims/g, 'claims'],
  [/gross domestic product/g, 'gdp'], [/m\/m/g, 'mom'], [/y\/y/g, 'yoy'], [/q\/q/g, 'qoq'],
];
const STOP = new Set(['the', 'of', 'and', 'member', 'president', 'chair', 'governor', 'gov', 'prelim', 'flash', 'final', 'adv', 'advance', 'sa', 's']);
const words = (t) => {
  let x = String(t || '').toLowerCase();
  PHRASES.forEach(([re, to]) => { x = x.replace(re, to); });
  return x.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
};

function similar(a, b) {
  const A = new Set(words(a)); const B = new Set(words(b));
  if (!A.size || !B.size) return false;
  /* «Core CPI» і «CPI» — різні події, хоча слова майже ті самі. */
  if (A.has('core') !== B.has('core')) return false;
  let hit = 0;
  A.forEach((w) => { if (B.has(w)) hit += 1; });
  /* Від більшого набору: «Fed Warsh Speech» ≠ «Fed Hammack Speaks». */
  return hit / Math.max(A.size, B.size) >= 0.75;
}

export function restrictedFor(ctx, ev) {
  if (!ctx?.news?.length || !ev?.day) return [];
  const d = new Date(`${ev.day}T12:00:00`);
  const days = new Set([-1, 0, 1].map((k) => { const x = new Date(d); x.setDate(x.getDate() + k); return ymd(x); }));
  return [...new Set(ctx.news.filter((n) => days.has(n.day)
    && (!n.currency || n.currency === ev.ccy) && similar(n.title, ev.title)).map((n) => n.firm))];
}

/* Людські назви значень з витягу. */
export const RULE_TEXT = {
  daily_loss_basis: {
    initial_balance: 'від початкового балансу',
    start_of_day_balance: 'від балансу на початок дня',
    start_of_day_equity_or_balance_higher: 'від більшого з балансу/equity на початок дня',
    none: 'немає',
  },
  max_loss_type: {
    static: 'статична', trailing: 'трейлінг', eod_trailing: 'трейлінг по закриттю дня',
    trailing_until_breakeven: 'трейлінг до беззбитку',
  },
  news_trading: {
    allowed: 'дозволена', restricted_funded_only: 'обмежена на funded-рахунку',
    restricted_all: 'обмежена на всіх етапах', not_allowed: 'заборонена',
  },
  weekend_holding: { allowed: 'дозволено', not_allowed: 'заборонено', allowed_swing_only: 'лише на swing-рахунках' },
};

export const ruleText = (field, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'так' : 'ні';
  if (RULE_TEXT[field]?.[v]) return RULE_TEXT[field][v];
  if (Array.isArray(v)) {
    return v.map((x) => (x && typeof x === 'object'
      ? [x.name, x.profit_target_pct != null && `ціль ${x.profit_target_pct}%`, x.min_trading_days != null && `мін. ${x.min_trading_days} дн.`].filter(Boolean).join(' · ')
      : (typeof x === 'number' && x >= 1000 ? `$${(x / 1000).toLocaleString('uk-UA')}K` : String(x)))).join(', ');
  }
  return String(v).replace(/_/g, ' ');
};

/* ==================================================================
   Новини, на яких кожен проп забороняє торгувати.

   Час і назви подій — з нашого календаря (newsStore, TradingView).
   Що саме заборонено — з правил пропа (src/dev/prop-rules, база):
     list — у пропа свій список подій (FTMO позначає їх у своєму
            календарі; ці дні монітор кладе в prop_restricted_news,
            а для тижнів, яких там ще нема, — збіг за назвами з правил);
     high — усі червоні (High) події, за потреби лише деяких валют.
   Вікно (хвилини до і після) — з restricted_news.window_min_* у правилах.
   Для пропів без власного календаря список орієнтовний — так і пишемо.
================================================================== */

const KW = {
  /* Назви подій зі списку FTMO, як їх пише календар. */
  ftmo: {
    USD: /federal funds|fomc|non.?farm|unemployment rate|average hourly|gdp|cpi/i,
    EUR: /refinancing|ecb.*(rate|decision)|deposit (facility )?rate/i,
    GBP: /bank rate|boe.*(rate|decision)|mpc|cpi/i,
    CAD: /overnight rate|boc.*(rate|decision)|cpi|employment change|unemployment rate/i,
    AUD: /cash rate|rba.*(rate|decision)|cpi|employment change|unemployment rate/i,
    NZD: /official cash rate|rbnz|cpi/i,
    CHF: /snb.*(rate|decision)|policy rate/i,
    JPY: /boj.*(rate|decision)|policy rate/i,
  },
};

export const POLICY = {
  ftmo: { mode: 'list', db: 'FTMO', exact: true },
  fundingpips: { mode: 'high', note: 'FundingPips позначає заборонені події у своєму календарі. Тут — усі червоні новини, тож список може бути ширшим за їхній.' },
  the5ers: { mode: 'high' },
  alphacapital: { mode: 'high', extra: /crude oil inventories/i },
  blueguardian: { mode: 'high', ccy: ['USD', 'EUR', 'GBP', 'JPY'] },
  cryptofundtrader: { mode: 'high', note: 'Стосується лише Ascend Evaluation.' },
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function similar(a, b) {
  const x = new Set(norm(a).split(' ').filter((w) => w.length > 2));
  const y = norm(b).split(' ').filter((w) => w.length > 2);
  if (!x.size || !y.length) return false;
  const hit = y.filter((w) => x.has(w)).length;
  return hit / Math.min(x.size, y.length) >= 0.6;
}

export function windowOf(data) {
  const n = data?.structured?.restricted_news || {};
  const before = Number(n.window_min_before) || 2;
  const after = Number(n.window_min_after) || before;
  return { before, after };
}

/* Чи заборонена подія для пропа. dbList — рядки prop_restricted_news цієї фірми. */
export function isRestricted(firmId, ev, dbList = []) {
  const p = POLICY[firmId];
  if (!p || !ev) return false;
  if (p.mode === 'high') {
    if (p.extra && p.extra.test(ev.title)) return true;
    if (ev.impact !== 'High') return false;
    return !p.ccy || p.ccy.includes(ev.ccy);
  }
  if (dbList.some((n) => n.day === ev.day && (!n.currency || n.currency === ev.ccy) && similar(n.title, ev.title))) return true;
  /* Тиждень, якого монітор ще не бачив: збіг за назвами зі списку пропа. */
  const known = dbList.some((n) => n.day === ev.day);
  const re = KW[firmId]?.[ev.ccy];
  return !known && ev.impact === 'High' && !!re && re.test(ev.title);
}

/* Події пропа з вікнами заборони і станом відносно «зараз». */
export function restrictedEvents(firmId, data, rows, dbList, now = Date.now()) {
  const { before, after } = windowOf(data);
  return (rows || []).filter((ev) => ev.at && isRestricted(firmId, ev, dbList)).map((ev) => {
    const t = ev.at.getTime();
    const start = t - before * 60_000;
    const end = t + after * 60_000;
    return { ev, start, end, live: now >= start && now <= end, past: now > end, mins: Math.round((start - now) / 60_000) };
  }).sort((a, b) => a.start - b.start);
}

export const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

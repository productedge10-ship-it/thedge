/* global process */
/* ==================================================================
   Календар новин — серверна частина.

   Vercel піднімає цей файл як функцію на /api/news. Вона потрібна не
   для краси: на faireconomy.media немає заголовка CORS, і браузер не
   дозволяє нашому домену читати відповідь. Це правило самого
   браузера — серверу воно не писане.

   Два режими:
     /api/news?week=this|next|last   — тижневий фід
     /api/news?desc=CPI%20m%2Fm      — опис показника

   ---

   Про описи окремо, бо тут була помилка.

   Спершу описи намагались зішкребти зі сторінки forexfactory.com/
   calendar. Виявилось, що в її HTML їх немає взагалі: FF підвантажує
   текст окремим запитом по внутрішньому id події, а публічний JSON-фід
   таких id не віддає. Тобто той парсер шукав те, чого на сторінці не
   існує, і завжди тихо повертав null — а користувач бачив тільки
   власний словник і думав, що так і задумано.

   Тому джерело змінено. Тепер це Вікіпедія: назва події зводиться до
   економічного поняття («German Flash Manufacturing PMI m/m» →
   Purchasing Managers' Index), і береться перший абзац відповідної
   статті. Це справжній текст із справжнього джерела, з посиланням.

   Таблиця CONCEPTS нижче — це не описи, а адреси: куди йти по опис.
   Різниця принципова. Змінити опис CPI я не можу й не хочу, а от
   знати, що «Core CPI» і «Spanish Flash CPI y/y» — про той самий
   індекс, машина сама не здогадається.
================================================================== */

const FEEDS = {
  last: 'https://nfs.faireconomy.media/ff_calendar_lastweek.json',
  this: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  next: 'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const cache = new Map();
const TTL = 20 * 60 * 1000;
const DESC_TTL = 30 * 24 * 3600 * 1000;   // опис індикатора не псується місяцями

/* ---------- тижневий фід ---------- */

async function feed(week) {
  const url = FEEDS[week] || FEEDS.this;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return { body: hit.body, state: 'hit' };

  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const body = await res.text();
    cache.set(url, { at: Date.now(), body });
    return { body, state: 'miss' };
  } catch (e) {
    /* Фід ліг, а в памʼяті лишилось старе — краще старе, ніж порожній
       екран: календар на тиждень уперед не псується від того, що йому
       двадцять хвилин. */
    if (hit) return { body: hit.body, state: 'stale' };
    throw e;
  }
}

/* ---------- від назви події до поняття ----------

   Порядок має значення: перемагає перший збіг, тому довші й точніші
   ключі стоять вище. «Core PCE» мусить спрацювати раніше за «PCE», а
   «ISM Services PMI» — раніше за «PMI», інакше про індекс послуг
   розкажуть як про PMI взагалі. */
const CONCEPTS = [
  /* Ціни — найвище. Інакше «BOJ Core CPI» ловиться правилом про Банк
     Японії і замість індексу цін людина читає про установу. Назва
     установи в заголовку майже завжди означає лише авторство даних,
     а не тему. */
  [/core pce|pce price/i, 'Personal_consumption_expenditures_price_index'],
  [/trimmed mean cpi|core cpi|\bcpi\b/i, 'Consumer_price_index'],
  [/core ppi|\bppi\b|sppi|producer price/i, 'Producer_price_index'],
  [/inflation expectations/i, 'Inflation_expectations'],
  [/import prices/i, 'Import_price_index'],

  [/non-?farm (employment|payroll)/i, 'Nonfarm_payrolls'],
  [/adp.*employment/i, 'ADP_National_Employment_Report'],
  [/unemployment claims|jobless claims/i, 'Jobless_claims'],
  [/unemployment (rate|change)/i, 'Unemployment'],
  [/average hourly earnings/i, 'Wage'],
  [/employment change|payrolls/i, 'Employment'],

  /* Рішення й протоколи — до назв установ, бо «FOMC Minutes» це про
     засідання, а не про комітет узагалі. */
  [/fomc.*(minutes|accounts)/i, 'Federal_Open_Market_Committee'],
  [/fomc|federal funds rate/i, 'Federal_funds_rate'],
  [/jackson hole/i, 'Jackson_Hole_Economic_Symposium'],
  [/treasury sec/i, 'United_States_Department_of_the_Treasury'],
  [/\becb\b|main refinancing/i, 'European_Central_Bank'],
  [/official bank rate|\bboe\b/i, 'Bank_of_England'],
  [/cash rate|\brba\b/i, 'Reserve_Bank_of_Australia'],
  [/overnight rate|\bboc\b/i, 'Bank_of_Canada'],
  [/\bboj\b/i, 'Bank_of_Japan'],
  [/\bsnb\b|gov board member/i, 'Swiss_National_Bank'],
  [/monetary policy|rate statement|press conference/i, 'Monetary_policy'],

  [/ism (manufacturing|services)? ?pmi/i, 'ISM_report_on_business'],
  [/services pmi|manufacturing pmi|composite pmi|chicago pmi|\bpmi\b/i, "Purchasing_Managers'_Index"],
  [/ifo business climate/i, 'Ifo_Business_Climate_Index'],
  [/zew|economic sentiment/i, 'ZEW_Indicator_of_Economic_Sentiment'],
  [/consumer confidence|consumer climate|consumer sentiment/i, 'Consumer_confidence_index'],

  [/retail sales|realized sales/i, 'Retail'],
  [/consumer spending|household spending|personal spending/i, 'Consumption_(economics)'],
  [/durable goods/i, 'Durable_good'],
  [/gdp|gross domestic/i, 'Gross_domestic_product'],
  [/industrial production/i, 'Industrial_production_index'],
  [/current account/i, 'Current_account'],
  [/trade balance/i, 'Balance_of_trade'],
  [/personal income/i, 'Personal_income'],
  [/corporate profits/i, 'Profit_(accounting)'],
  [/housing starts|building permits|new home sales|existing home sales|\bhpi\b/i, 'Real_estate_economics'],

  [/crude oil inventories/i, 'Petroleum_reserves_in_the_United_States'],
  [/natural gas storage/i, 'Natural_gas_storage'],
  [/bond auction/i, 'Government_bond'],
  [/bank holiday/i, 'Bank_holiday'],
  [/money supply|\bm3\b/i, 'Money_supply'],
  [/leading index|leading indicator/i, 'Leading_indicator'],
  [/business climate|economic expectations|economic barometer/i, 'Business_cycle'],
  [/speaks/i, 'Central_bank'],
];

/* Прибираємо все, що не стосується суті: країну, періодичність,
   стадію публікації. «German Flash Manufacturing PMI m/m» має
   зводитись до «Manufacturing PMI». */
const STRIP = /\b(flash|prelim(inary)?|final|revised|advance|core|trimmed mean|german|french|spanish|italian|belgian|swiss|tokyo|boj|cb|mi|uom|s&p\/cs|nbb|gfk|kof|ubs|api|richmond|composite-20|weekly|monthly|quarterly)\b|[mqy]\/[mqy]|\(.*?\)/gi;

const conceptOf = (title) => {
  const t = String(title || '');
  const hit = CONCEPTS.find(([re]) => re.test(t));
  if (hit) return hit[1];

  /* Немає в таблиці — пробуємо пошуком по очищеній назві. Гірше за
     точну адресу, але краще за порожнечу. */
  const clean = t.replace(STRIP, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > 3 ? { search: clean } : null;
};

/* ---------- Вікіпедія ---------- */

const clip = (s, n = 420) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const dot = cut.lastIndexOf('. ');
  return (dot > n * 0.5 ? cut.slice(0, dot + 1) : `${cut}…`);
};

async function wikiSummary(titleOrSearch) {
  const base = 'https://en.wikipedia.org';
  let title = titleOrSearch;

  if (typeof titleOrSearch === 'object' && titleOrSearch.search) {
    const q = encodeURIComponent(titleOrSearch.search);
    const r = await fetch(`${base}/w/api.php?action=query&list=search&srsearch=${q}&srlimit=1&format=json&origin=*`, {
      headers: { 'User-Agent': UA },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const first = j?.query?.search?.[0]?.title;
    if (!first) return null;
    title = first.replace(/ /g, '_');
  }

  const r = await fetch(`${base}/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!r.ok) return null;
  const j = await r.json();

  /* Сторінка-розвідник («може означати одне з...») користі не несе. */
  if (j?.type === 'disambiguation' || !j?.extract) return null;

  return {
    text: clip(j.extract),
    source: 'Вікіпедія',
    url: j?.content_urls?.desktop?.page || `${base}/wiki/${title}`,
    title: j?.title || null,
  };
}

/* ---------- FRED ----------

   Для американських показників у FRED лежить опис від самої агенції,
   яка ці дані рахує. Точніше за енциклопедію, але тільки для США і
   тільки якщо в оточенні є ключ. */
async function fredNotes(title) {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;

  const q = encodeURIComponent(String(title).replace(STRIP, ' ').replace(/\s+/g, ' ').trim());
  if (!q) return null;

  try {
    const r = await fetch(
      `https://api.stlouisfed.org/fred/series/search?search_text=${q}&limit=1&order_by=popularity&sort_order=desc&file_type=json&api_key=${key}`,
      { headers: { 'User-Agent': UA } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const s = j?.seriess?.[0];
    if (!s?.notes) return null;
    return {
      text: clip(s.notes),
      source: 'FRED',
      url: `https://fred.stlouisfed.org/series/${s.id}`,
      title: s.title || null,
    };
  } catch {
    return null;
  }
}

async function describe(title, ccy) {
  const ck = `d:${ccy}:${title}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < DESC_TTL) return hit.body;

  let out = null;
  try {
    const concept = conceptOf(title);
    if (concept) out = await wikiSummary(concept);
    /* Вікіпедія мовчить — пробуємо FRED, але тільки для доларових
       подій: шукати американську серію під німецький показник
       означає видати чужий опис за свій. */
    if (!out && ccy === 'USD') out = await fredNotes(title);
  } catch {
    out = null;
  }

  cache.set(ck, { at: Date.now(), body: out });
  return out;
}

/* ---------- обробник ---------- */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { week = 'this', desc, ccy = '' } = req.query || {};

  if (desc) {
    const found = await describe(String(desc), String(ccy));
    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).json(found || { text: null });
  }

  try {
    const { body, state } = await feed(String(week));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=1200, stale-while-revalidate=600');
    res.setHeader('X-Cache', state);
    return res.status(200).send(body);
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
}

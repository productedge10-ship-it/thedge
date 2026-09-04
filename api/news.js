/* global process */
/* ==================================================================
   Календар новин — серверна частина.

   Vercel піднімає цей файл як функцію на /api/news. Вона потрібна не
   для краси: на faireconomy.media немає заголовка CORS, і браузер не
   дозволяє нашому домену читати відповідь. Це правило самого
   браузера — серверу воно не писане.

   Два режими:
     /api/news?week=0|-1|2|this|next  — тижневий фід (зсув тижнів)
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

/* Головне джерело — календар TradingView. Він публічний, віддає
   довільний діапазон дат і містить фактичні значення після виходу.

   Раніше тут стояли тижневі файли faireconomy (дзеркало ForexFactory),
   і саме через них календар умів рівно три тижні. Зараз із тих файлів
   живий лише ff_calendar_thisweek.json — решта (lastweek, nextweek,
   thismonth, nextmonth) віддає 404, тому і минулий, і наступний
   тиждень були порожні. Файл поточного тижня лишаємо запасним
   варіантом: якщо TradingView не відповість, сторінка все одно
   покаже хоч цей тиждень. */
const TV = 'https://economic-calendar.tradingview.com/events';
const FF_THIS = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

/* Тільки валюти, якими торгують. Календар TradingView охоплює весь
   світ, включно з подіями, що не рухають нічого, крім локальних
   облігацій. */
const MAJORS = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY']);

/* Єврозона окремо: у TradingView усі її країни йдуть під одним EUR,
   тож без відбору в списку двадцять однакових «GDP Growth Rate YoY»
   від Латвії до Кіпру. Лишаємо загальноєвропейські дані й чотири
   найбільші економіки — те, на що реально дивиться ринок. */
const EURO = new Set(['EU', 'EA', 'DE', 'FR', 'IT', 'ES']);

/* Аукціони облігацій — окрема каста подій: виходять пачками, назви
   різняться лише строком, а на валюту не впливають майже ніяк.

   Категорії 'bnd' для цього замало: частина аукціонів приїжджає під
   'gov' (німецький Bubill, наприклад), тому додатково дивимось на
   назву. Саме через це в списку на 7 вересня висів «DE 9-Month
   Bubill Auction», якого на ForexFactory немає й близько. */
const SKIP_CATEGORY = new Set(['bnd']);
const AUCTION = /auction|bubill|bobl|\bbtf\b|\bbtp\b|\bbill\b|\bgilt\b|\bbund\b|\bschatz\b/i;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const cache = new Map();
const TTL = 20 * 60 * 1000;
const DESC_TTL = 30 * 24 * 3600 * 1000;   // опис індикатора не псується місяцями

/* ---------- тижневий фід ---------- */

/* Зсув тижня від поточного: 0 — цей, -1 — минулий, 2 — через два.
   Рядкові 'last'/'this'/'next' лишились для сумісності зі старими
   посиланнями й кешем у браузерах. */
const offsetOf = (week) => {
  const named = { last: -1, this: 0, next: 1 };
  if (week in named) return named[week];
  const n = parseInt(week, 10);
  /* Обмеження не з примхи: календар не має сенсу на роки вперед, а
     без стелі один зациклений клієнт може ганяти запити нескінченно. */
  return Number.isFinite(n) ? Math.max(-26, Math.min(26, n)) : 0;
};

/* Понеділок потрібного тижня і неділя після нього, в UTC. */
const weekRange = (offset) => {
  const now = new Date();
  const monday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - ((now.getUTCDay() + 6) % 7) + offset * 7,
  );
  return [new Date(monday), new Date(monday + 7 * 86400000)];
};

/* TradingView віддає число і одиницю окремо, ще й у двох виглядах:
   actual — уже зручне для читання (203), actualRaw — справжнє
   (203000). Відношення між ними і є масштаб: саме так 203 стає
   «203K», а не голим числом, яке ні про що не каже. */
const fmt = (v, raw, unit) => {
  if (v === null || v === undefined) return '';

  let suffix = '';
  if (unit === '%') suffix = '%';
  else if (typeof raw === 'number' && v !== 0) {
    const k = Math.round(Math.abs(raw / v));
    if (k >= 1e12) suffix = 'T';
    else if (k >= 1e9) suffix = 'B';
    else if (k >= 1e6) suffix = 'M';
    else if (k >= 1e3) suffix = 'K';
  }

  const num = Math.abs(v) >= 1000 ? Number(v.toFixed(0)) : Number(v.toFixed(2));
  const money = unit && unit !== '%' ? unit : '';
  return `${money}${num}${suffix}`;
};

/* Ваги TradingView: 1 — високий, 0 — середній, решта — низький. */
const impactOfTv = (e) => {
  const name = `${e.indicator || ''} ${e.title || ''}`;
  if (/holiday/i.test(name)) return 'Holiday';
  if (e.importance >= 1) return 'High';
  if (e.importance === 0) return 'Medium';
  return 'Low';
};

/* Назви єврозонних подій без країни нечитабельні: «Inflation Rate
   YoY» тричі поспіль — це Німеччина, Італія та Іспанія, і зрозуміти
   це можна хіба що по часу виходу. */
const titleOf = (e) => {
  const c = e.country;
  const local = e.currency === 'EUR' && c && c !== 'EU' && c !== 'EA';
  return local ? `${c} ${e.title || ''}`.trim() : (e.title || '').trim();
};

async function tvWeek(offset) {
  const [from, to] = weekRange(offset);
  const url = `${TV}?from=${from.toISOString()}&to=${to.toISOString()}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Origin: 'https://www.tradingview.com', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${res.status}`);

  const j = await res.json();
  const list = Array.isArray(j?.result) ? j.result : null;
  if (!list) throw new Error('несподівана відповідь');

  /* Верхню межу TradingView трактує включно, тож понеділок
     наступного тижня приїжджає разом із цим — і потім висить у
     списку днем, якого в стрічці немає. */
  const till = to.getTime();

  return list
    .filter((e) => new Date(e.date).getTime() < till)
    .filter((e) => MAJORS.has(e.currency))
    .filter((e) => !SKIP_CATEGORY.has(e.category))
    .filter((e) => !AUCTION.test(e.title || ''))
    .filter((e) => e.currency !== 'EUR' || EURO.has(e.country))
    .map((e) => ({
      title: titleOf(e),
      country: e.currency,
      date: e.date,
      impact: impactOfTv(e),
      actual: fmt(e.actual, e.actualRaw, e.unit),
      forecast: fmt(e.forecast, e.forecastRaw, e.unit),
      previous: fmt(e.previous, e.previousRaw, e.unit),
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    /* У самому фіді трапляються дублі — та сама подія двома
       записами з різними id (італійський Construction Output,
       засідання ECOFIN). У списку це виглядає як помилка нашого
       календаря, тому прибираємо: час плюс валюта плюс назва
       унікальні для реальної події. */
    .filter((e, i, all) => {
      const same = (x) => `${x.date}|${x.country}|${x.title}`;
      return all.findIndex((x) => same(x) === same(e)) === i;
    });
}

/* Запасний шлях — єдиний живий файл faireconomy. Він знає лише
   поточний тиждень, тому для інших зсувів рятувати нема чим. */
async function ffThisWeek() {
  const res = await fetch(FF_THIS, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('не масив');
  return rows;
}

async function feed(week) {
  const offset = offsetOf(week);
  const key = `w:${offset}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { rows: hit.rows, state: 'hit' };

  let last = null;
  try {
    const rows = await tvWeek(offset);
    cache.set(key, { at: Date.now(), rows });
    return { rows, state: 'miss' };
  } catch (e) {
    last = e;
  }

  if (offset === 0) {
    try {
      const rows = await ffThisWeek();
      cache.set(key, { at: Date.now(), rows });
      return { rows, state: 'fallback' };
    } catch (e) {
      last = e;
    }
  }

  /* Усе впало, але в памʼяті лишилось старе — краще старе, ніж
     порожній екран: календар на тиждень уперед не псується від
     того, що йому двадцять хвилин. */
  if (hit) return { rows: hit.rows, state: 'stale' };

  throw last || new Error('фід недоступний');
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
    const { rows, state } = await feed(String(week));
    res.setHeader('Cache-Control', 's-maxage=1200, stale-while-revalidate=600');
    res.setHeader('X-Cache', state);
    return res.status(200).json(rows);
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
}

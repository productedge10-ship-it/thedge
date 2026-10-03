/* ==================================================================
   Економічний календар.

   Джерело — публічний календар TradingView (запит іде через
   api/news.js, бо з браузера напряму не пустить CORS). Він віддає
   довільний діапазон дат разом із фактичними значеннями, тому тиждень
   тут — це зсув від поточного, а не одне з трьох фіксованих слів.

   Так було не завжди: спершу бралися тижневі файли ForexFactory, і
   календар умів рівно три тижні — минулий, цей, наступний. Потім із
   тих файлів лишився живим тільки поточний тиждень, а решта почала
   віддавати 404, і сусідні тижні мовчки ставали порожніми.

   Чого в жодному фіді немає — пояснення, навіщо ця цифра трейдеру.
   Тому нижче свій словник: він відповідає на «що мені з цього», а не
   переказує методику підрахунку.
================================================================== */

import { t as tx, LOCALE } from './lang';

/* Адреса одна для обох середовищ: у продакшені її обслуговує
   serverless-функція (api/news.js), у розробці — проксі Vite. */
const FN = '/api/news';

/* Скільки тижнів дозволено гортати в кожен бік. Календар на півроку
   вперед нікому не потрібен, а межа рятує від нескінченного гортання
   в порожнечу. */
export const WEEK_SPAN = 26;

export const IMPACTS = [
  { id: 'High', label: tx('Високий', 'High'), color: '#f87171' },
  { id: 'Medium', label: tx('Середній', 'Medium'), color: '#fbbf24' },
  { id: 'Low', label: tx('Низький', 'Low'), color: '#7A7A85' },
  { id: 'Holiday', label: tx('Вихідний', 'Holiday'), color: '#60a5fa' },
];

export const impactOf = (id) => IMPACTS.find((i) => i.id === id) || IMPACTS[2];

/* ---------- кеш ----------
   Календар міняється рідко, а сторінку відкривають часто. Півгодини
   — компроміс: фактичні значення після виходу новини встигають
   доїхати, а зайвих запитів немає. */
const TTL = 30 * 60 * 1000;
const key = (w) => `edge_news_${w}`;

const readCache = (w) => {
  try {
    const raw = localStorage.getItem(key(w));
    if (!raw) return null;
    const { at, rows } = JSON.parse(raw);
    if (Date.now() - at > TTL) return null;
    return rows;
  } catch { return null; }
};

const writeCache = (w, rows) => {
  try { localStorage.setItem(key(w), JSON.stringify({ at: Date.now(), rows })); } catch { /* приватний режим */ }
};

/* ---------- нормалізація ----------

   Час у фіді з зоною (-04:00), тому Date розбирає його правильно і
   показує в місцевому поясі користувача. Це важливо: трейдер живе за
   своїм годинником, а не за нью-йоркським, і перерахунок у голові —
   найпростіший спосіб проґавити новину. */
const toApp = (r, i) => {
  const d = new Date(r.date);
  const bad = Number.isNaN(d.getTime());

  return {
    /* Свій ключ: у фіді немає id, а події повторюються з тижня в
       тиждень. Час плюс назва плюс валюта — унікально. */
    id: `${r.date}|${r.country}|${r.title}|${i}`,
    key: `${r.country}|${r.title}`,
    title: r.title || '',
    ccy: r.country || '',
    impact: r.impact || 'Low',
    at: bad ? null : d,
    day: bad ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: bad ? '' : d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }),
    forecast: r.forecast || '',
    previous: r.previous || '',
    actual: r.actual || '',
  };
};

async function grab(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error(tx('несподівана відповідь', 'unexpected response'));
  return raw;
}

/* force — для кнопки оновлення. Без неї кеш живе пів години, і в
   найважливішому випадку («наступний тиждень FF ще не виклав») людина
   тиснула б оновлення марно: відповідь приходила б зі сховища. */
export async function fetchWeek(week, force = false) {
  const cached = force ? null : readCache(week);
  if (cached) return cached.map((r, i) => ({ ...toApp(r, i) }));

  let raw = null;
  try {
    raw = await grab(`${FN}?week=${week}`);
  } catch (e) {
    throw new Error(tx(
      `Календар не відповів (${e.message}). `
      + 'Дані йдуть через /api/news — у розробці це проксі Vite, '
      + 'у продакшені serverless-функція. Перевір, що dev-сервер '
      + 'перезапущено після зміни vite.config.js.',
      `The calendar didn't respond (${e.message}). `
      + 'Data goes through /api/news — a Vite proxy in development, '
      + 'a serverless function in production. Check that the dev server '
      + 'was restarted after changing vite.config.js.',
    ));
  }

  writeCache(week, raw);
  return raw.map(toApp);
}

/* ---------- опис показника ----------

   Тягнеться з зовнішнього джерела через ту саму функцію: назву події
   зводять до економічного поняття і беруть перший абзац статті про
   нього (Вікіпедія, для доларових — ще й FRED). Повертається разом із
   джерелом і посиланням, бо чужий текст без підпису — погана манера.

   Кешуємо в памʼяті вкладки: описи не змінюються, а розгортати той
   самий рядок двічі за сесію — звичайна справа. */
const descCache = new Map();

export async function fetchDescription(title, ccy) {
  const ck = `${ccy}|${title}`;
  if (descCache.has(ck)) return descCache.get(ck);

  let out = null;
  try {
    const res = await fetch(`${FN}?desc=${encodeURIComponent(title)}&ccy=${encodeURIComponent(ccy || '')}`);
    if (res.ok) {
      const j = await res.json();
      out = j?.text ? { text: j.text, source: j.source || '', url: j.url || '', title: j.title || '' } : null;
    }
  } catch {
    out = null;
  }

  descCache.set(ck, out);
  return out;
}

/* ---------- «що це для трейдера» ----------

   Це НЕ заміна опису й не його дублікат. Опис вище пояснює, що таке
   показник; цей текст відповідає на інше питання — що з цією цифрою
   робити в терміналі. Енциклопедія такого не пише і не має писати.

   Ключі — фрагменти назви. Порядок має значення: довші й точніші
   зверху, бо перемагає перший збіг. «Core CPI» має спрацювати раніше
   за «CPI», інакше про базову інфляцію розкажуть як про загальну. */
const GLOSSARY = [
  /* Назви під новим джерелом (TradingView). Ключі шукаються по
     входженню, тому специфічні мусять стояти вище за загальні:
     «Core Inflation Rate» раніше за «Inflation Rate», інакше про
     базову інфляцію розкажуть як про загальну. */
  ['Non Farm Payrolls', tx('Скільки робочих місць створила економіка США поза сільським господарством. Найгучніша цифра місяця: рух по долару й індексах на секундах може перекрити денний діапазон. Виходить у першу пʼятницю місяця.', 'How many jobs the US economy added outside agriculture. The loudest number of the month: the move in the dollar and indices within seconds can exceed the daily range. Released on the first Friday of the month.')],
  ['Core Inflation Rate', tx('Інфляція без їжі й енергії. Центробанки дивляться саме на неї, бо ці дві категорії стрибають від погоди й нафти, а не від стану економіки.', 'Inflation excluding food and energy. Central banks watch this one, because those two categories jump with the weather and oil, not with the state of the economy.')],
  ['Inflation Rate', tx('Річна інфляція. Головний вхідний параметр для ставки: вища за ціль — розмови про жорсткішу політику й підтримка валюти, нижча — навпаки.', 'Annual inflation. The main input for the rate: above target means talk of tighter policy and support for the currency, below target means the opposite.')],
  ['JOLTs', tx('Скільки вакансій відкрито в США. Показує попит на працю раніше, ніж він доходить до зарплат і безробіття, тому ФРС дивиться на нього уважно.', 'How many job openings there are in the US. Shows demand for labour before it reaches wages and unemployment, so the Fed watches it closely.')],
  ['Interest Rate Decision', tx('Рішення центробанку по ставці. Сама цифра зазвичай очікувана — ринок рухає не вона, а формулювання й тон коментаря після.', 'The central bank\'s rate decision. The number itself is usually expected — what moves the market is the wording and tone of the comments afterwards.')],
  ['Balance of Trade', tx('Різниця експорту й імпорту. Стійкий профіцит підтримує валюту попитом на неї, дефіцит працює проти.', 'Exports minus imports. A steady surplus supports the currency through demand for it; a deficit works against it.')],
  ['Ivey PMI', tx('Канадський індекс ділової активності від Ivey. Вище 50 — економіка розширюється, нижче — стискається.', 'Canada\'s business activity index from Ivey. Above 50 the economy is expanding, below 50 it\'s contracting.')],
  ['Nonfarm Payrolls', tx('Те саме, що Non Farm Payrolls: зайнятість поза сільським господарством США.', 'Same as Non Farm Payrolls: US employment outside agriculture.')],
  ['Non-Farm Employment Change', tx('Скільки робочих місць створила економіка США поза сільським господарством. Найгучніша цифра місяця: рух по долару й індексах на секундах може перекрити денний діапазон. Виходить у першу пʼятницю місяця.', 'How many jobs the US economy added outside agriculture. The loudest number of the month: the move in the dollar and indices within seconds can exceed the daily range. Released on the first Friday of the month.')],
  ['Federal Funds Rate', tx('Рішення ФРС по ставці. Сама цифра зазвичай очікувана — ринок рухає не вона, а формулювання й тон прес-конференції після.', 'The Fed\'s rate decision. The number itself is usually expected — what moves the market is the wording and tone of the press conference afterwards.')],
  ['FOMC Statement', tx('Текст рішення ФРС. Трейдери читають не сенс, а зміни формулювань відносно попереднього разу: одне прибране слово рухає ринок сильніше за саму ставку.', 'The text of the Fed\'s decision. Traders don\'t read it for meaning but for changes in wording since last time: one removed word moves the market more than the rate itself.')],
  ['FOMC Press Conference', tx('Прес-конференція голови ФРС через півгодини після рішення. Найнепередбачуваніші пів години місяця: рух буває більший, ніж на самій ставці.', 'The Fed chair\'s press conference half an hour after the decision. The most unpredictable half hour of the month: the move can be bigger than on the rate itself.')],
  ['FOMC Meeting Minutes', tx('Протокол засідання ФРС, що вийшов через три тижні. Показує, наскільки члени комітету розходились у думках — а отже, чого чекати далі.', 'Minutes of the Fed meeting, released three weeks later. Show how much committee members disagreed — and so what to expect next.')],
  ['Core CPI', tx('Інфляція без їжі й енергії. ФРС дивиться саме на неї, бо ці дві категорії стрибають від погоди й нафти, а не від стану економіки.', 'Inflation excluding food and energy. The Fed watches this one, because those two categories jump with the weather and oil, not with the state of the economy.')],
  ['Core PCE', tx('Улюблений показник інфляції ФРС. Тихіший за CPI, але саме на нього орієнтується політика ставки.', 'The Fed\'s favourite inflation gauge. Quieter than CPI, but it\'s what rate policy is actually steered by.')],
  ['Core PPI', tx('Ціни виробників без їжі й енергії — інфляція на етапі до полиці магазину. Часто випереджає CPI.', 'Producer prices excluding food and energy — inflation before it reaches the store shelf. Often leads CPI.')],
  ['Core Retail Sales', tx('Роздрібні продажі без автомобілів. Авто спотворюють картину великою ціною й рідкими покупками, тому базова цифра чесніша.', 'Retail sales excluding cars. Cars distort the picture with high prices and rare purchases, so the core number is more honest.')],
  ['Retail Sales', tx('Скільки витрачають люди. Дві третини економіки США — це споживання, тому цифра важить більше, ніж здається.', 'How much people spend. Two thirds of the US economy is consumption, so this number matters more than it seems.')],
  ['CPI', tx('Споживча інфляція. Головний вхід у рішення по ставці: висока інфляція означає, що ставку не знизять.', 'Consumer inflation. The main input into the rate decision: high inflation means the rate won\'t be cut.')],
  ['PPI', tx('Інфляція цін виробників. Іде попереду споживчої: те, що подорожчало на фабриці, доїде до магазину.', 'Producer price inflation. It runs ahead of consumer inflation: what got more expensive at the factory will reach the store.')],
  ['Unemployment Claims', tx('Скільки людей уперше подали на допомогу з безробіття. Виходить щотижня — найсвіжіший пульс ринку праці.', 'How many people filed for unemployment benefits for the first time. Released weekly — the freshest pulse of the labour market.')],
  ['Unemployment Rate', tx('Рівень безробіття. Разом із NFP формує картину ринку праці, від якої залежить ставка.', 'The unemployment rate. Together with NFP it shapes the labour market picture the rate depends on.')],
  ['Average Hourly Earnings', tx('Зростання зарплат. Зарплати живлять інфляцію, тому ця цифра всередині NFP часто рухає ринок сильніше за самі робочі місця.', 'Wage growth. Wages feed inflation, so this number inside NFP often moves the market more than the jobs themselves.')],
  ['ADP Non-Farm', tx('Приватна оцінка зайнятості за два дні до NFP. Кореляція слабка, але ринок усе одно реагує — і часто помиляється.', 'A private employment estimate two days before NFP. The correlation is weak, but the market reacts anyway — and is often wrong.')],
  ['GDP', tx('Валовий продукт — швидкість економіки. Виходить із запізненням, тому рухає ринок менше, ніж інфляція чи зайнятість.', 'Gross domestic product — the speed of the economy. Released with a lag, so it moves the market less than inflation or employment.')],
  ['Cash Rate', tx('Рішення Резервного банку Австралії по ставці. Головна подія для австралійця й для пар з ним.', 'The Reserve Bank of Australia\'s rate decision. The main event for the Aussie and its pairs.')],
  ['Official Bank Rate', tx('Рішення Банку Англії по ставці. Разом із протоколом голосування: розклад голосів каже про напрямок більше, ніж сама ставка.', 'The Bank of England\'s rate decision. Comes with the vote split: how the votes line up says more about direction than the rate itself.')],
  ['Main Refinancing Rate', tx('Рішення ЄЦБ по ставці. Прес-конференція через 45 хвилин зазвичай рухає євро сильніше.', 'The ECB\'s rate decision. The press conference 45 minutes later usually moves the euro more.')],
  ['Overnight Rate', tx('Рішення Банку Канади по ставці.', 'The Bank of Canada\'s rate decision.')],
  ['Monetary Policy Statement', tx('Розгорнута заява центробанку про політику. Тон важливіший за цифри.', 'The central bank\'s detailed policy statement. Tone matters more than numbers.')],
  ['Rate Statement', tx('Супровідна заява до рішення по ставці. Читають зміни формулювань.', 'The statement accompanying the rate decision. Traders read the changes in wording.')],
  ['Press Conference', tx('Прес-конференція центробанку. Питання журналістів витягують те, чого немає в тексті — звідси й непередбачуваність.', 'A central bank press conference. Journalists\' questions pull out what isn\'t in the text — hence the unpredictability.')],
  ['Flash Manufacturing PMI', tx('Попередній індекс ділової активності у виробництві. Вище 50 — зростання, нижче — спад. Виходить раніше за фінальний і тому важить більше.', 'Preliminary manufacturing business activity index. Above 50 means growth, below means contraction. Comes out before the final reading, so it matters more.')],
  ['Flash Services PMI', tx('Попередній індекс активності в послугах. Для розвинених економік важливіший за виробничий: послуги — більша частка.', 'Preliminary services activity index. For developed economies it matters more than manufacturing: services are the bigger share.')],
  ['ISM Manufacturing PMI', tx('Індекс ділової активності у виробництві США. Один із найстаріших випереджальних показників.', 'US manufacturing business activity index. One of the oldest leading indicators.')],
  ['ISM Services PMI', tx('Індекс активності у сфері послуг США. Часто рухає ринок сильніше за виробничий.', 'US services activity index. Often moves the market more than the manufacturing one.')],
  ['Manufacturing PMI', tx('Індекс ділової активності у виробництві. Межа 50 розділяє зростання і спад.', 'Manufacturing business activity index. The 50 line separates growth from contraction.')],
  ['Services PMI', tx('Індекс ділової активності в послугах.', 'Services business activity index.')],
  ['Consumer Confidence', tx('Настрій споживачів. Люди, які бояться за роботу, менше витрачають — тому індекс випереджає продажі.', 'Consumer mood. People who fear for their jobs spend less — so the index leads sales.')],
  ['Consumer Sentiment', tx('Оцінка настроїв споживачів від Мічиганського університету. Разом із інфляційними очікуваннями всередині релізу.', 'University of Michigan consumer sentiment survey. Includes inflation expectations inside the release.')],
  ['Inflation Expectations', tx('Якої інфляції чекають самі люди. Центробанки бояться цієї цифри окремо: очікування вміють ставати самоздійсненними.', 'What inflation people themselves expect. Central banks fear this number separately: expectations can become self-fulfilling.')],
  ['Crude Oil Inventories', tx('Запаси нафти в США. Головна щотижнева подія для нафти й пар із канадцем.', 'US crude oil stocks. The main weekly event for oil and for pairs with the Canadian dollar.')],
  ['Natural Gas Storage', tx('Запаси газу в США. Для газу — те саме, що запаси нафти для нафти.', 'US natural gas stocks. For gas it\'s what crude inventories are for oil.')],
  ['Trade Balance', tx('Різниця експорту й імпорту. Впливає на валюту повільно, але стабільно.', 'Exports minus imports. Affects the currency slowly but steadily.')],
  ['Employment Change', tx('Зміна кількості зайнятих. Ринок праці — половина мандату будь-якого центробанку.', 'Change in the number of employed people. The labour market is half of any central bank\'s mandate.')],
  ['Bank Holiday', tx('Вихідний у банків цієї країни. Ліквідність нижча, спреди ширші, рухи рвані — часто краще не торгувати цю сесію взагалі.', 'A bank holiday in this country. Lower liquidity, wider spreads, choppy moves — often better not to trade this session at all.')],
  ['Bond Auction', tx('Аукціон держоблігацій. Ринок дивиться на дохідність і попит; для валюти зазвичай другорядно.', 'A government bond auction. The market watches yields and demand; for the currency it\'s usually secondary.')],
  ['Speaks', tx('Виступ представника центробанку. Може не сказати нічого, а може змінити очікування по ставці однією фразою — тому час варто знати.', 'A speech by a central bank official. May say nothing, or may shift rate expectations with one phrase — so it\'s worth knowing the time.')],
];

export function describe(title) {
  const t = String(title || '');
  const hit = GLOSSARY.find(([k]) => t.toLowerCase().includes(k.toLowerCase()));
  return hit ? hit[1] : null;
}

/* ---------- сповіщення ----------

   Зберігаємо намір: за якими подіями стежимо. Показує їх поки що сам
   браузер за 10 хвилин до початку (див. lib/newsAlerts.js) — це
   працює, доки сайт відкритий хоча б у фоновій вкладці.

   Поле lead лишається на майбутнє: коли зʼявиться бот, у кожної
   події зможе бути свій запас часу. Зараз усі десять хвилин, тому
   вибір інтервалу в інтерфейсі не показуємо — не варто питати про
   те, на що поки не можеш вплинути. */
export const ALERTS_KEY = 'news_alerts';

export function normalizeAlerts(v) {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a) => a && typeof a.id === 'string')
    .map((a) => ({
      id: a.id,
      key: typeof a.key === 'string' ? a.key : '',
      title: typeof a.title === 'string' ? a.title : '',
      ccy: typeof a.ccy === 'string' ? a.ccy : '',
      at: typeof a.at === 'string' ? a.at : '',
      lead: Number.isFinite(a.lead) ? a.lead : 10,
    }))
    .slice(0, 200);
}

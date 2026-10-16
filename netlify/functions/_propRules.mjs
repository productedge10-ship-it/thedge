/* global process */
import crypto from 'node:crypto';
import { admin, sendMail, site } from './_mono.mjs';
import { claimMail, mailPropRules } from './_mails.mjs';

/* ==================================================================
   Монітор правил пропів.

   Раз на добу (або коли адмін натиснув «Перевірити зараз»):
   1. Для кожної фірми тягнемо її сторінки через сервіс prop-scraper
      (curl_cffi, а якщо закрито чи сторінка JS-ова — Scrapling).
   2. Якщо текст жодної сторінки фірми не змінився — далі не йдемо:
      Gemini не смикаємо, нічого не порівнюємо.
   3. Інакше Gemini витягує правила кожної програми в один JSON-формат.
      Не селекторами з HTML, а за змістом — тому зміна верстки нічого
      не ламає.
   4. Порівнюємо з чинними (схваленими) правилами. Різниця → рядок у
      prop_rule_changes зі статусом pending і висновком Gemini.
   5. Юзерам нічого не йде, поки адмін не схвалить. Після схвалення —
      notifyApproved: модалка в застосунку (сама підхоплює схвалене),
      лист і Telegram для серйозних змін.

   Сторінки календарів (kind = 'news') — окремо: звідти беремо список
   новин, заборонених саме цією фірмою, у prop_restricted_news.
================================================================== */

const H = 3600 * 1000;
const EVERY = 24 * H;
/* Модель — зі змінної: Google час від часу вимикає старі моделі для
   нових ключів (2.5-flash уже «no longer available to new users»). */
const MODEL = () => process.env.PROP_GEMINI_MODEL || 'gemini-3.8-flash';
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* Числа й дати, що міняються щодня (лічильники трейдерів, «сьогодні»),
   не повинні будити Gemini. У хеш іде текст без них; сам текст — повний. */
const stableHash = (t) => sha(String(t)
  .replace(/\$?\d[\d,.]*\s*(M|K|k|\+)?\+?\s*(traders|customers|users|paid|reviews|trustpilot)/gi, '')
  .replace(/\s+/g, ' ').trim());

async function scrape(url, options = {}) {
  const base = (process.env.PROP_SCRAPER_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('PROP_SCRAPER_URL не заданий');
  const r = await fetch(`${base}/fetch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.PROP_SCRAPER_TOKEN ? { 'x-token': process.env.PROP_SCRAPER_TOKEN } : {}) },
    body: JSON.stringify({ url, ...options }),
    signal: AbortSignal.timeout(150_000),
  });
  if (!r.ok) throw new Error(`scraper ${r.status}`);
  return r.json();
}

/* Безкоштовна LLM через будь-який OpenAI-сумісний API (Mistral, Groq,
   Cerebras, OpenRouter :free, DeepSeek…). Задається змінними:
   LLM_API_KEY, LLM_BASE_URL (напр. https://api.mistral.ai/v1), LLM_MODEL.
   Якщо LLM_API_KEY є — користуємось ним, Gemini лишається запасним. */
const hasLLM = () => !!process.env.LLM_API_KEY;

let lastLLM = 0;
const modelPause = new Map();
async function openaiChat(prompt, { json = true } = {}) {
  const base = (process.env.LLM_BASE_URL || 'https://api.mistral.ai/v1').replace(/\/+$/, '');
  const models = String(process.env.LLM_MODEL || 'mistral-small-latest').split(',').map((m) => m.trim()).filter(Boolean);
  let last;
  for (const wait of [0, 20_000, 60_000, 120_000]) {
    if (wait) await sleep(wait);
    /* Безкоштовні тарифи мають ліміт запитів на секунду/хвилину —
       тримаємо паузу між викликами. */
    const gap = Number(process.env.LLM_GAP_MS || 4000) - (Date.now() - lastLLM);
    if (gap > 0) await sleep(gap);
    lastLLM = Date.now();
    /* Кілька моделей через кому: у кожної свій добовий ліміт. Беремо першу,
       що не на паузі. */
    const model = models.find((m) => (modelPause.get(m) || 0) < Date.now()) || models[0];
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({
        model, temperature: 0,
        max_tokens: Number(process.env.LLM_MAX_TOKENS || 4000),
        ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}),
        messages: [{ role: 'user', content: json ? `${prompt}\n\nВідповідай ЛИШЕ валідним JSON без пояснень і без markdown.` : prompt }],
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(180_000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
    const body = await r.json().catch(() => ({}));
    if (r.ok) {
      const text = body?.choices?.[0]?.message?.content || '';
      return json ? JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')) : text.trim();
    }
    last = new Error(`llm ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
    const ra = Number(r.headers?.get?.('retry-after'));
    if (r.status === 429 && models.length > 1) {
      /* Ліміт саме цієї моделі — пробуємо наступну без очікування. */
      modelPause.set(model, Date.now() + (ra > 0 ? ra * 1000 : 60_000));
      if (models.some((m) => (modelPause.get(m) || 0) < Date.now())) { continue; }
    }
    if (ra > 0 && ra < 120) await sleep(ra * 1000);
    if (![0, 429, 500, 502, 503, 504].includes(r.status)) break;
  }
  throw last;
}

/* big:true — великі запити (звід правил фірми, календар, порівняння).
   Безкоштовна Groq дає лише 8K токенів на хвилину, тому великі йдуть у
   Gemini (їх мало за добу), а сторінки по одній — у Groq/інший LLM. */
async function gemini(prompt, opts = {}) {
  const { big, ...o } = opts;
  if (big && process.env.GEMINI_API_KEY) return geminiRaw(prompt, o);
  if (hasLLM()) return openaiChat(prompt, o);
  return geminiRaw(prompt, o);
}

async function geminiRaw(prompt, { json = true } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY не заданий');
  /* Безкоштовний Gemini часто відповідає 503 «high demand» або 429.
     Це минає за хвилину-дві, тому кілька спроб з паузою, а не провал
     усього прогону. */
  let last;
  for (const wait of [0, 15_000, 45_000, 90_000]) {
    if (wait) await sleep(wait);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
      signal: AbortSignal.timeout(180_000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
    const body = await r.json().catch(() => ({}));
    if (r.ok) {
      const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      return json ? JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')) : text.trim();
    }
    last = new Error(`gemini ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
    if (![0, 429, 500, 502, 503, 504].includes(r.status)) break;
  }
  throw last;
}

/* ---------- формат правил ---------- */

/* Поля, які порівнюємо, і як їх назвати людині. Порядок = порядок у
   таблиці «було / стало» в адмінці й у модалці. */
export const FIELDS = [
  ['daily_loss_pct', 'Денний ліміт, %', true],
  ['daily_loss_basis', 'Від чого денний ліміт', true],
  ['daily_reset', 'Коли скидається денний', false],
  ['max_loss_pct', 'Загальна просадка, %', true],
  ['max_loss_type', 'Тип загальної просадки', true],
  ['funded_daily_loss_pct', 'Денний ліміт на funded, %', true],
  ['funded_max_loss_pct', 'Загальна просадка на funded, %', true],
  ['phases', 'Етапи (ціль / мін. днів / строк)', false],
  ['news_trading', 'Торгівля на новинах', true],
  ['news_window_min', 'Вікно навколо новин, хв', true],
  ['weekend_holding', 'Перенос через вихідні', true],
  ['ea_allowed', 'Радники (EA)', true],
  ['consistency_rule', 'Правило консистентності', true],
  ['max_leverage_fx', 'Плече FX', false],
  ['profit_split_pct', 'Ділення прибутку, %', false],
  ['payout_frequency_days', 'Виплати, кожні N днів', false],
  ['inactivity_days', 'Неактивність до закриття, днів', false],
  ['account_sizes', 'Розміри рахунків', false],
];
const MAJOR = new Set(FIELDS.filter((f) => f[2]).map((f) => f[0]));

const SCHEMA = `{
  "programs": [{
    "program": "назва програми, як на сайті (напр. \\"2-Step\\", \\"Stellar 1-Step\\")",
    "market": "CFD | Futures",
    "account_sizes": [10000, 25000],
    "phases": [{"name": "Phase 1", "profit_target_pct": 10, "min_trading_days": 4, "time_limit_days": null}],
    "daily_loss_pct": 5,
    "daily_loss_basis": "initial_balance | start_of_day_balance | start_of_day_equity_or_balance_higher | none",
    "daily_reset": "00:00 CE(S)T | 00:00 server time | …",
    "max_loss_pct": 10,
    "max_loss_type": "static | trailing | eod_trailing | trailing_until_breakeven",
    "funded_daily_loss_pct": null,
    "funded_max_loss_pct": null,
    "news_trading": "allowed | restricted_funded_only | restricted_all | not_allowed",
    "news_window_min": 2,
    "weekend_holding": "allowed | not_allowed | allowed_swing_only",
    "ea_allowed": true,
    "consistency_rule": null,
    "max_leverage_fx": "1:100",
    "profit_split_pct": 80,
    "payout_frequency_days": 14,
    "inactivity_days": 30,
    "notes": ["інші важливі обмеження одним рядком, українською"]
  }]
}`;

function extractPrompt(firm, text, known) {
  return `Ти витягуєш правила проп-фірми ${firm} з тексту її сайту.
Поверни ТІЛЬКИ JSON за схемою нижче. Одна програма (тип челенджу) — один об'єкт.
Правила:
- Числа — числами (відсотки без знака %). Чого в тексті немає — null. Нічого не вигадуй.
- Якщо значення для funded/master-рахунку відрізняється від етапів оцінки — заповни funded_*.
- Ліміти, що залежать від опції при купівлі, — бери стандартний варіант, а опцію опиши в notes.
- Не включай ціни челенджів і рекламні цифри.
${known.length ? `- Ці назви програм уже відомі; якщо програма та сама — пиши назву точно так: ${known.map((k) => `"${k}"`).join(', ')}.` : ''}

Схема:
${SCHEMA}

Текст сайту:
"""
${text.slice(0, 120000)}
"""`;
}

const norm = (v) => {
  if (v === undefined || v === '') return null;
  if (typeof v === 'string') return v.trim().toLowerCase();
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => (typeof x === 'object' ? x : x)));
  if (typeof v === 'object' && v) return JSON.stringify(v);
  return v;
};

export function diffRules(oldR, newR) {
  const out = [];
  for (const [field, label] of FIELDS) {
    const a = oldR ? oldR[field] ?? null : null;
    const b = newR ? newR[field] ?? null : null;
    if (norm(a) !== norm(b)) out.push({ field, label, old: a, new: b, major: MAJOR.has(field) });
  }
  return out;
}

async function conclusion(firm, program, diff) {
  const lines = diff.map((d) => `- ${d.label}: було ${JSON.stringify(d.old)} → стало ${JSON.stringify(d.new)}`).join('\n');
  return gemini(`Проп-фірма ${firm}, програма «${program}» змінила правила:
${lines}

Напиши трейдеру українською 2–4 короткі речення: що саме змінилось і що це означає на практиці
(наприклад, «денний ліміт тепер рахується від балансу на початок дня, а не від початкового — після прибуткового дня запас менший»).
Без вступу, без markdown, без порад купувати.`, { json: false });
}

/* Одна відкрита (pending) зміна на фірму+програму: нова знахідка
   оновлює її, а не плодить дублікати, поки адмін не дійшов. */
async function upsertChange(db, { firm, program, sourceId, oldR, newR, diff, excerpt }) {
  const { data: open } = await db.from('prop_rule_changes').select('id,new_rules')
    .eq('firm', firm).eq('program', program).eq('kind', 'program').eq('status', 'pending').maybeSingle();
  if (open && !diffRules(open.new_rules, newR).length) return;

  let text = null;
  if (oldR && diff.length) {
    try { text = await conclusion(firm, program, diff); } catch (e) { console.error('prop rules: висновок', e.message); }
  } else if (!oldR) {
    text = 'Перший витяг правил цієї програми. Перевір значення й схвали — далі зміни рахуватимуться від нього. Юзерам про перший витяг нічого не надсилається.';
  }
  const row = {
    firm, program, source_id: sourceId, old_rules: oldR, new_rules: newR, diff,
    conclusion: text, severity: diff.some((d) => d.major) && oldR ? 'major' : 'minor', excerpt,
  };
  if (open) await db.from('prop_rule_changes').update({ ...row, created_at: new Date().toISOString() }).eq('id', open.id);
  else await db.from('prop_rule_changes').insert(row);
  console.log(`prop rules: зміна ${firm} / ${program} (${diff.length})`);
}

/* ---------- заборонені новини ---------- */

async function runNews(db, s) {
  let res;
  try { res = await scrape(s.url, s.options || {}); } catch (e) { res = { ok: false, notes: [e.message] }; }
  const stamp = new Date().toISOString();
  if (!res.ok || !res.text) {
    await db.from('prop_rule_sources').update({ last_fetch_at: stamp, last_ok: false, last_via: res.via || null, last_note: (res.notes || []).join('; '), run_requested_at: null }).eq('id', s.id);
    return;
  }
  const year = new Date().getUTCFullYear();
  const out = await gemini(`Це економічний календар проп-фірми ${s.firm}. Знайди ВСІ події, позначені як заборонені
(«Restricted event», «restricted», «high impact restricted» тощо) і поверни JSON:
{"events":[{"date":"YYYY-MM-DD","currency":"USD","title":"Core CPI m/m","instruments":"USD + US Indices + XAUUSD"}]}
Дати пиши повністю; рік — ${year}, якщо на сторінці його немає (дні подано як «Monday12/10» = 12 жовтня).
Якщо заборонених подій немає — {"events":[]}.

Текст:
"""
${res.text.slice(0, 80000)}
"""`, { big: true });
  const rows = (out?.events || []).filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e?.date) && e.title)
    .map((e) => ({ firm: s.firm, day: e.date, currency: String(e.currency || '').toUpperCase().slice(0, 8), title: String(e.title).slice(0, 200), instruments: e.instruments || null, fetched_at: stamp }));
  if (rows.length) await db.from('prop_restricted_news').upsert(rows, { onConflict: 'firm,day,currency,title' });
  await db.from('prop_rule_sources').update({ last_fetch_at: stamp, last_ok: true, last_via: res.via, last_note: `${rows.length} заборонених подій`, last_hash: stableHash(res.text), run_requested_at: null }).eq('id', s.id);
}

/* ---------- повідомлення після схвалення ---------- */

async function notifyApproved(db) {
  const { data: changes } = await db.from('prop_rule_changes').select('id,firm,program,diff,conclusion,severity')
    .eq('status', 'approved').is('notified_at', null).limit(20);
  for (const c of changes || []) {
    try {
      if (c.severity === 'major') {
        const { data: accs } = await db.from('prop_accounts').select('user_id,rules_program,firm_name').eq('status', 'Active').ilike('firm_name', `%${c.firm.replace(/[%_]/g, '')}%`);
        const users = [...new Set((accs || []).filter((a) => !a.rules_program || a.rules_program === c.program).map((a) => a.user_id))];
        const { data: tgs } = users.length
          ? await db.from('user_settings').select('user_id,tg_chat_id').in('user_id', users)
          : { data: [] };
        const tg = new Set((tgs || []).filter((t) => t.tg_chat_id).map((t) => t.user_id));
        for (const uid of users) {
          if (!(await claimMail(db, uid, 'proprules', c.id))) continue;
          const { data: u } = await db.auth.admin.getUserById(uid).catch(() => ({ data: null }));
          if (u?.user?.email && process.env.RESEND_API_KEY) {
            const m = mailPropRules(c);
            await sendMail(u.user.email, m.subject, m.html, { kind: 'proprules', userId: uid });
          }
          if (tg.has(uid)) {
            await db.from('tg_alerts').upsert({
              user_id: uid, source: 'prop', source_id: `rules:${c.id}`, pair: c.firm,
              message: `📋 ${c.firm} (${c.program}) змінив правила. ${String(c.conclusion || '').slice(0, 300)} Деталі: ${site()}/prop-rules`,
              alert_time: new Date().toISOString(), is_sent: false,
            }, { onConflict: 'user_id,source,source_id', ignoreDuplicates: true });
          }
        }
      }
      await db.from('prop_rule_changes').update({ notified_at: new Date().toISOString() }).eq('id', c.id);
    } catch (e) {
      console.error('prop rules notify:', c.id, e.message);
    }
  }
}

/* ==================================================================
   Сторінки правил: обхід довідок, факти, порівняння, питання-відповіді.

   Одна сторінка правил — це замало: у пропів правила розкидані по
   десятках статей довідки (новини, вихідні, заборонені стратегії,
   виплати…). Тому:

   1. discover — раз на добу обходимо «індекси» кожної фірми:
      sitemap (FTMO FAQ), Zendesk API (Funding Pips — одразу з текстом
      статей), Intercom-довідку (FundedNext: колекції → статті) і
      окремі сторінки правил. Усе це — рядки prop_rule_pages.
   2. processPages — кожен тік беремо кілька сторінок, які давно не
      перевіряли. Текст не змінився — лише позначка «перевірено».
      Нова сторінка — Gemini витягує з неї ВСІ правила (facts).
      Змінилась — Gemini порівнює стару й нову версію: якщо змінилось
      щось суттєве, це зміна на схвалення в адмінці.
   3. synthesize — коли всі сторінки фірми пройдені і щось змінилось,
      з усіх фактів збираємо картки програм (ліміти — для «Рахунків» і
      контролю правил) і питання-відповіді для юзерів (prop_faq).

   Факти й Q&A — «як написано на сайті, перевірено тоді-то», тож вони
   оновлюються самі. Повідомлення юзерам (модалка, лист, Telegram) —
   лише після схвалення зміни адміном.
================================================================== */

const PAGE_CHARS = () => Number(process.env.LLM_PAGE_CHARS || 30000);
const BATCH_CHARS = () => Number(process.env.LLM_BATCH_CHARS || 60000);
const PAGES_PER_TICK = () => Number(process.env.PROP_PAGES_PER_TICK || 32);
const GAP = 4000; // пауза між викликами Gemini: безкоштовний ліміт ~15 запитів/хв
const DAY = 24 * H;

async function scraper(path, body) {
  const base = (process.env.PROP_SCRAPER_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('PROP_SCRAPER_URL не заданий');
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.PROP_SCRAPER_TOKEN ? { 'x-token': process.env.PROP_SCRAPER_TOKEN } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  });
  if (!r.ok) throw new Error(`scraper ${r.status}`);
  return r.json();
}

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: '–', mdash: '—', hellip: '…', apos: "'" };
export const stripHtml = (h) => String(h || '')
  .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>|<\/(p|li|h\d|tr|div|section|ul|ol|table)>/gi, '\n')
  .replace(/<li[^>]*>/gi, '\n• ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCharCode(Number(e.slice(1))) : ENT[e.toLowerCase()] ?? ' '))
  .replace(/[⁦-⁩‎‏]/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const rx = (s) => (s ? new RegExp(s, 'i') : null);

/* ---------- 1. обхід індексів ---------- */

async function discover(db, src) {
  const o = src.options || {};
  const inc = rx(o.include);
  const exc = rx(o.exclude);
  const found = new Map(); // url → {title, section, text}
  const keep = (url, meta = {}) => {
    if (inc && !inc.test(url)) return;
    if (exc && (exc.test(url) || exc.test(meta.title || '') || exc.test(meta.section || ''))) return;
    found.set(url, { ...(found.get(url) || {}), ...meta });
  };

  if (src.kind === 'rules') {
    found.set(src.url, { title: o.title || null, section: 'Правила' });
  } else if (o.type === 'sitemap') {
    const r = await scraper('/fetch', { url: src.url, raw: true });
    if (!r.ok) throw new Error(`sitemap ${r.status}`);
    for (const m of String(r.raw).matchAll(/<loc>([^<]+)<\/loc>/g)) keep(m[1].trim());
  } else if (o.type === 'zendesk') {
    let next = src.url;
    for (let i = 0; next && i < 10; i += 1) {
      const r = await scraper('/fetch', { url: next, raw: true });
      if (!r.ok) throw new Error(`zendesk ${r.status}`);
      const j = JSON.parse(r.raw);
      for (const a of j.articles || []) {
        if (a.draft) continue;
        keep(a.html_url, { title: a.title, section: a.section_id ? String(a.section_id) : null, text: stripHtml(a.body) });
      }
      next = j.next_page;
    }
  } else if (o.type === 'intercom') {
    const seen = new Set();
    const queue = [src.url];
    while (queue.length && seen.size < 80) {
      const u = queue.shift();
      if (seen.has(u)) continue;
      seen.add(u);
      const r = await scraper('/links', { url: u });
      if (!r.ok) continue;
      const section = (u.match(/collections\/\d+-([^/?#]+)/) || [])[1] || null;
      for (const l of r.links || []) {
        const clean = l.url.split('?')[0];
        if (/\/collections\/\d+/.test(clean) && !seen.has(clean) && !(exc && exc.test(clean))) queue.push(clean);
        else if (/\/articles\/\d+/.test(clean)) keep(clean, { title: l.text || null, section });
      }
    }
  }
  return found;
}

async function runDiscovery(db, src) {
  const stamp = new Date().toISOString();
  let found;
  try {
    found = await discover(db, src);
  } catch (e) {
    await db.from('prop_rule_sources').update({ last_fetch_at: stamp, last_ok: false, last_note: e.message.slice(0, 300), run_requested_at: null }).eq('id', src.id);
    return new Map();
  }
  const { data: have } = await db.from('prop_rule_pages').select('id,url,active').eq('source_id', src.id);
  const known = new Map((have || []).map((p) => [p.url, p]));
  const fresh = [...found.entries()].filter(([u]) => !known.has(u))
    .map(([url, m]) => ({ firm: src.firm, source_id: src.id, url, title: m.title || null, section: m.section || null }));
  for (let i = 0; i < fresh.length; i += 200) {
    await db.from('prop_rule_pages').upsert(fresh.slice(i, i + 200), { onConflict: 'url', ignoreDuplicates: true });
  }
  /* Сторінка зникла з індексу — не видаляємо (історія), лише вимикаємо.
     Порожній результат обходу — це радше збій, ніж «усе видалили». */
  if (found.size) {
    const gone = (have || []).filter((p) => p.active && !found.has(p.url)).map((p) => p.id);
    if (gone.length) await db.from('prop_rule_pages').update({ active: false }).in('id', gone);
    const back = (have || []).filter((p) => !p.active && found.has(p.url)).map((p) => p.id);
    if (back.length) await db.from('prop_rule_pages').update({ active: true }).in('id', back);
  }
  await db.from('prop_rule_sources').update({
    last_fetch_at: stamp, last_ok: found.size > 0, last_note: `${found.size} сторінок, нових ${fresh.length}`, run_requested_at: null,
  }).eq('id', src.id);
  /* Zendesk віддає текст статей разом зі списком — не треба тягнути
     кожну сторінку окремо. */
  const texts = new Map();
  for (const [u, m] of found) if (m.text) texts.set(u, m.text);
  return texts;
}

/* ---------- 2. сторінки ---------- */

const TOPICS = ['Ліміти збитку', 'Цілі та етапи', 'Новини', 'Вихідні та overnight', 'Заборонені стратегії',
  'Радники, копітрейдинг, хедж', 'Плече, лоти, інструменти', 'Консистентність', 'Виплати', 'Неактивність',
  'Масштабування', 'Платформи', 'Порушення і наслідки', 'Інше'];

function comparePrompt(firm, page, oldText, newText) {
  return `Сторінка правил проп-фірми ${firm} «${page.title || ''}» (${page.url}) змінилась.
Порівняй СТАРУ і НОВУ версії й визнач, чи змінились правила для трейдера.
meaningful=false, якщо змінились лише формулювання, оформлення, дати, промо, посилання.
severity="major", якщо змінились ліміти збитку, новини, вихідні, заборонені стратегії, умови виплат чи порушень; інакше "minor".
summary — 2–3 речення українською: що змінилось і що це означає на практиці.
changes — список змін: topic (одне з: ${TOPICS.join(', ')}), before, after (коротко, з числами, українською).
Поверни ТІЛЬКИ JSON: {"meaningful":true,"severity":"major","summary":"...","changes":[{"topic":"...","before":"...","after":"..."}]}

СТАРА ВЕРСІЯ:
"""
${oldText.slice(0, 45000)}
"""

НОВА ВЕРСІЯ:
"""
${newText.slice(0, 45000)}
"""`;
}

const cleanFacts = (out) => ({
  relevant: out?.relevant !== false && Array.isArray(out?.facts) && out.facts.length > 0,
  programs: Array.isArray(out?.programs) ? out.programs.slice(0, 20) : [],
  facts: (Array.isArray(out?.facts) ? out.facts : []).filter((f) => f?.rule).slice(0, 120)
    .map((f) => ({ topic: TOPICS.includes(f.topic) ? f.topic : 'Інше', programs: Array.isArray(f.programs) ? f.programs : [], rule: String(f.rule).slice(0, 500) })),
});

async function processPage(db, page, prefetched, sources) {
  const now = new Date().toISOString();
  let text = prefetched;
  if (!text) {
    const src = sources.get(page.source_id);
    const opts = src?.kind === 'rules' ? (src.options || {}) : {};
    const r = await scraper('/fetch', { url: page.url, min_chars: 300, ...opts, raw: false });
    if (!r.ok || !r.text) throw new Error(`scrape: ${(r.notes || []).join('; ') || r.status}`);
    text = r.text;
  }
  const hash = stableHash(text);
  if (page.text_hash === hash && page.extracted_at) {
    await db.from('prop_rule_pages').update({ checked_at: now, last_error: null }).eq('id', page.id);
    return false;
  }

  if (page.text && page.extracted_at && page.relevant !== false) {
    const cmp = await gemini(comparePrompt(page.firm, page, page.text, text), { big: true });
    await sleep(GAP);
    if (cmp?.meaningful && Array.isArray(cmp.changes) && cmp.changes.length) {
      await db.from('prop_rule_changes').insert({
        kind: 'page', firm: page.firm, program: page.title || page.url, page_id: page.id, page_url: page.url, page_title: page.title,
        source_id: page.source_id, old_rules: { excerpt: page.text.slice(0, 6000) }, new_rules: { excerpt: text.slice(0, 6000) },
        diff: cmp.changes.slice(0, 20).map((c, i) => ({ field: `c${i}`, label: c.topic || 'Зміна', old: c.before || null, new: c.after || null, major: cmp.severity === 'major' })),
        conclusion: cmp.summary || null, severity: cmp.severity === 'major' ? 'major' : 'minor', excerpt: text.slice(0, 4000),
      });
      await db.from('prop_firm_status').upsert({ firm: page.firm, last_change_at: now }, { onConflict: 'firm' });
      console.log('prop rules: зміна сторінки', page.firm, page.url);
    } else {
      /* Косметика: оновлюємо текст і факти не чіпаємо. */
      await db.from('prop_rule_pages').update({ text, text_hash: hash, checked_at: now, last_error: null }).eq('id', page.id);
      return false;
    }
  }

  /* Витяг фактів — пачкою з кількох сторінок (processPages): так
     викликів Gemini в рази менше, а безкоштовна квота — крихітна. */
  return { page, text, hash };
}

/* Квота Gemini вичерпана — до цього часу нічого не просимо, щоб не
   палити сторінки помилками. Скидається з перезапуском процесу. */
let quotaUntil = 0;
/* Gemini free: добова квота → 1 год. Інший LLM: ліміт на хвилину → 10 хв. */
const QUOTA_PAUSE = () => (process.env.LLM_API_KEY ? 10 * 60_000 : H);
const isQuota = (e) => /(gemini|llm) 429/.test(String(e?.message || ''));

function batchPrompt(firm, items) {
  return `Нижче ${items.length} сторінок сайту/довідки проп-фірми ${firm}. Для КОЖНОЇ сторінки окремо витягни ВСІ правила
й умови для трейдера: ліміти збитку і як рахуються, цілі, мінімальні дні, строки, новини, вихідні й overnight,
заборонені стратегії, радники/копітрейдинг/хедж, плече, лоти, інструменти, консистентність, виплати та їх умови,
неактивність, масштабування, платформи, що буде при порушенні.
Кожне правило — окремий пункт: конкретно, з числами, українською, 1 речення. Нічого не вигадуй.
programs — до яких програм пункт стосується (назви як на сайті); [] якщо до всіх.
topic — одне з: ${TOPICS.join(', ')}.
Сторінка без правил трейдингу (реклама, партнерка, оплата, KYC без обмежень) — relevant:false, facts:[].
Поверни ТІЛЬКИ JSON: {"pages":[{"n":1,"relevant":true,"programs":["..."],"facts":[{"topic":"Новини","programs":[],"rule":"..."}]}]}
(n — номер сторінки нижче; по одному об'єкту на КОЖНУ сторінку).

${items.map((it, i) => `### СТОРІНКА ${i + 1}: «${it.page.title || ''}» (${it.page.url})
"""
${it.text.slice(0, PAGE_CHARS())}
"""`).join('\n\n')}`;
}

async function extractBatch(db, firm, items) {
  const out = await gemini(batchPrompt(firm, items));
  await sleep(GAP);
  const now = new Date().toISOString();
  const got = new Map((out?.pages || []).map((p) => [Number(p?.n), p]));
  for (let i = 0; i < items.length; i += 1) {
    const { page, text, hash } = items[i];
    const f = cleanFacts(got.get(i + 1) || { relevant: false, facts: [] });
    await db.from('prop_rule_pages').update({
      text, text_hash: hash, facts: f, relevant: f.relevant, checked_at: now, changed_at: now, extracted_at: now, last_error: null,
    }).eq('id', page.id);
  }
}

async function processPages(db, prefetched, sources) {
  const now = Date.now();
  if (now < quotaUntil) return;
  const { data: pages } = await db.from('prop_rule_pages')
    .select('id,firm,source_id,url,title,text,text_hash,relevant,checked_at,extracted_at')
    .eq('active', true)
    .or(`checked_at.is.null,checked_at.lt."${new Date(now - DAY).toISOString()}"`)
    .order('checked_at', { ascending: true, nullsFirst: true })
    .limit(PAGES_PER_TICK() * 3);
  const due = (pages || []).filter((p) => !p.checked_at || p.relevant !== false
    || now - new Date(p.checked_at).getTime() > 7 * DAY).slice(0, PAGES_PER_TICK());
  const changedFirms = new Set();
  const queue = [];
  const fail = (p, e) => db.from('prop_rule_pages').update({ last_error: e.message.slice(0, 300), checked_at: new Date(Date.now() - DAY + H).toISOString() }).eq('id', p.id);

  for (const p of due) {
    try {
      const r = await processPage(db, p, prefetched.get(p.url), sources);
      if (r) queue.push(r);
    } catch (e) {
      if (isQuota(e)) { quotaUntil = Date.now() + QUOTA_PAUSE(); console.error('prop rules: ліміт LLM, пауза'); break; }
      await fail(p, e);
      console.error('prop page:', p.url, e.message);
    }
  }

  /* Пачки по фірмі: до 8 сторінок і ~60 тис. символів на виклик. */
  const byFirm = new Map();
  queue.forEach((q) => { if (!byFirm.has(q.page.firm)) byFirm.set(q.page.firm, []); byFirm.get(q.page.firm).push(q); });
  for (const [firm, items] of byFirm) {
    let chunk = [];
    let size = 0;
    const flush = async () => {
      if (!chunk.length || Date.now() < quotaUntil) return;
      try {
        await extractBatch(db, firm, chunk);
        changedFirms.add(firm);
      } catch (e) {
        if (isQuota(e)) { quotaUntil = Date.now() + QUOTA_PAUSE(); console.error('prop rules: ліміт LLM, пауза'); }
        else { for (const c of chunk) await fail(c.page, e); console.error('prop batch:', firm, e.message); }
      }
      chunk = []; size = 0;
    };
    for (const it of items) {
      const len = Math.min(it.text.length, PAGE_CHARS());
      if (chunk.length && (chunk.length >= 8 || size + len > BATCH_CHARS())) await flush();
      chunk.push(it); size += len;
    }
    await flush();
  }

  const stamp = new Date().toISOString();
  for (const firm of changedFirms) {
    await db.from('prop_firm_status').upsert({ firm, facts_changed_at: stamp }, { onConflict: 'firm' });
  }
}

/* ---------- 3. картки програм і питання-відповіді ---------- */

function faqPrompt(firm, factsText) {
  return `Нижче — правила проп-фірми ${firm}, зібрані з усіх сторінок її сайту й довідки (у дужках — сторінка-джерело).
Склади для трейдерів ПИТАННЯ-ВІДПОВІДІ українською — те, що люди питають найчастіше:
денний і загальний ліміт (скільки, від чого рахується, коли скидається), цілі та мінімальні дні, строки,
новини (можна чи ні, яке вікно, на яких етапах), вихідні й overnight, заборонені стратегії, радники/копітрейдинг/хедж,
плече й лоти, консистентність, виплати (коли, скільки, умови), неактивність, масштабування, що буде при порушенні.
Відповідь коротка (1–3 речення), конкретна, з числами. Якщо відрізняється між програмами — розпиши по програмах.
Тільки з наведених фактів, нічого не вигадуй; чого немає у фактах — не питай.
30–50 питань. topic — одне з: ${TOPICS.join(', ')}. sources — url сторінок, з яких відповідь.
Поверни ТІЛЬКИ JSON: {"items":[{"topic":"Новини","question":"...","answer":"...","programs":[],"sources":["https://..."]}]}

Факти:
${factsText}`;
}

async function synthesize(db, firm) {
  const { data: pages } = await db.from('prop_rule_pages').select('url,title,facts')
    .eq('firm', firm).eq('active', true).eq('relevant', true);
  const lines = [];
  for (const p of pages || []) {
    const facts = p.facts?.facts || [];
    if (!facts.length) continue;
    lines.push(`## ${p.title || ''} (${p.url})`);
    for (const f of facts) lines.push(`- [${f.topic}]${f.programs?.length ? `[${f.programs.join(', ')}]` : ''} ${f.rule}`);
  }
  if (!lines.length) return;
  const factsText = lines.join('\n').slice(0, 400000);

  /* Картки програм — через той самий потік змін зі схваленням. */
  const { data: current } = await db.from('prop_rules').select('program,rules').eq('firm', firm);
  const known = (current || []).map((r) => r.program);
  const out = await gemini(extractPrompt(firm, factsText, known), { big: true });
  await sleep(GAP);
  const programs = Array.isArray(out?.programs) ? out.programs.filter((p) => p?.program) : [];
  const byProgram = new Map((current || []).map((r) => [r.program, r.rules]));
  for (const p of programs) {
    const program = String(p.program).trim();
    const oldR = byProgram.get(program) || null;
    const diff = diffRules(oldR, p);
    if (oldR && !diff.length) continue;
    await upsertChange(db, { firm, program, sourceId: null, oldR, newR: p, diff, excerpt: factsText.slice(0, 4000) });
  }

  await sleep(GAP);
  const faq = await gemini(faqPrompt(firm, factsText), { big: true });
  await sleep(GAP);
  const items = (faq?.items || []).filter((i) => i?.question && i?.answer).slice(0, 60);
  if (items.length) {
    await db.from('prop_faq').delete().eq('firm', firm);
    await db.from('prop_faq').insert(items.map((i, k) => ({
      firm, topic: TOPICS.includes(i.topic) ? i.topic : 'Інше', question: String(i.question).slice(0, 300),
      answer: String(i.answer).slice(0, 2000), programs: Array.isArray(i.programs) ? i.programs.slice(0, 10) : [],
      source_urls: Array.isArray(i.sources) ? i.sources.filter((u) => /^https?:\/\//.test(u)).slice(0, 5) : [], position: k,
    })));
  }
  let rbItems = 0;
  try { rbItems = await buildRulebook(db, firm, factsText); } catch (e) { console.error('prop rulebook:', firm, e.message); }
  const stamp = new Date().toISOString();
  const { count: total } = await db.from('prop_rule_pages').select('id', { count: 'exact', head: true }).eq('firm', firm).eq('active', true);
  await db.from('prop_firm_status').upsert({
    firm, synth_at: stamp, faq_at: items.length ? stamp : undefined, pages_total: total || 0, pages_relevant: (pages || []).length, checked_at: stamp,
  }, { onConflict: 'firm' });
  console.log(`prop rules: ${firm} — програм ${programs.length}, питань ${items.length}, правил у зводі ${rbItems}`);
}

/* ---------- звід усіх правил («по поличках») ---------- */

const RULEBOOK_SCHEMA = `{
  "programs": ["2-Step", "1-Step"],
  "sections": [{
    "topic": "Ліміти збитку",
    "items": [{
      "title": "Денний ліміт",
      "text": "Пояснення одним-двома реченнями: як рахується, від чого, коли скидається, що буде при порушенні.",
      "programs": [],
      "values": {"2-Step": "5% від початкового балансу", "1-Step": "3%"},
      "sources": ["https://..."]
    }]
  }]
}`;

function rulebookPrompt(firm, factsText) {
  return `Нижче — сирі правила проп-фірми ${firm}, витягнуті з усіх сторінок її сайту й довідки (багато повторів).
Склади ПОВНИЙ ЗВІД ПРАВИЛ «по поличках» українською:
- розділи (topic) лише з цього списку і в цьому порядку: ${TOPICS.join(', ')};
- у кожному розділі — окремі правила (items) без повторів: схожі пункти з різних сторінок об'єднуй в один;
- title — коротка назва правила (2–5 слів), text — суть 1–3 реченнями з числами;
- якщо значення різниться між програмами — заповни values {"назва програми": "значення"}, інакше values {};
- programs — до яких програм стосується правило ([] — до всіх); sources — url сторінок-джерел;
- нічого не вигадуй, не губи жодного правила, яке є у фактах;
- programs на верхньому рівні — повний список програм фірми.
Поверни ТІЛЬКИ JSON за схемою:
${RULEBOOK_SCHEMA}

Факти:
${factsText}`;
}

const cleanRulebook = (rb) => {
  if (!rb || !Array.isArray(rb.sections)) return null;
  const order = new Map(TOPICS.map((t, i) => [t, i]));
  const sections = rb.sections
    .filter((s) => s && Array.isArray(s.items) && s.items.length)
    .map((s) => ({
      topic: String(s.topic || 'Інше').slice(0, 60),
      items: s.items.filter((i) => i && (i.title || i.text)).map((i) => ({
        title: String(i.title || '').slice(0, 120),
        text: String(i.text || '').slice(0, 1500),
        programs: Array.isArray(i.programs) ? i.programs.map(String).slice(0, 12) : [],
        values: i.values && typeof i.values === 'object' && !Array.isArray(i.values)
          ? Object.fromEntries(Object.entries(i.values).slice(0, 12).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 200)])) : {},
        sources: Array.isArray(i.sources) ? i.sources.filter((u) => /^https?:\/\//.test(u)).slice(0, 6) : [],
      })),
    }))
    .sort((a, b) => (order.get(a.topic) ?? 99) - (order.get(b.topic) ?? 99));
  return { programs: Array.isArray(rb.programs) ? rb.programs.map(String).slice(0, 20) : [], sections };
};

async function buildRulebook(db, firm, factsText) {
  const rb = cleanRulebook(await gemini(rulebookPrompt(firm, factsText), { big: true }));
  await sleep(GAP);
  if (!rb || !rb.sections.length) return 0;
  const { data: cur } = await db.from('prop_rulebook').select('firm,edited_at').eq('firm', firm).maybeSingle();
  const stamp = new Date().toISOString();
  /* Адмін уже правив звід руками — не затираємо: нова версія лягає
     чернеткою, і в адмінці її можна переглянути й прийняти. */
  if (cur?.edited_at) await db.from('prop_rulebook').update({ draft: rb, draft_at: stamp }).eq('firm', firm);
  else await db.from('prop_rulebook').upsert({ firm, content: rb, updated_at: stamp, draft: null, draft_at: null }, { onConflict: 'firm' });
  return rb.sections.reduce((n, s) => n + s.items.length, 0);
}

/* Редагування зводу Gemini за інструкцією адміна (з адмінки). */
export async function aiEditRulebook(firm, content, instruction) {
  const out = await gemini(`Ось звід правил проп-фірми ${firm} у JSON. Виконай інструкцію адміністратора
і поверни ВЕСЬ звід у тому самому форматі. Не губи правила, яких інструкція не стосується, і нічого не вигадуй.
Інструкція: ${String(instruction || 'Впорядкуй: об\'єднай повтори, розклади по розділах, зроби формулювання чіткими й однаковими.').slice(0, 2000)}

Формат:
${RULEBOOK_SCHEMA}

Поточний звід:
${JSON.stringify(content).slice(0, 300000)}`, { big: true });
  const rb = cleanRulebook(out);
  if (!rb) throw new Error('Gemini повернув не той формат');
  return rb;
}

async function maybeSynthesize(db) {
  if (Date.now() < quotaUntil) return;
  const { data: st } = await db.from('prop_firm_status').select('firm,facts_changed_at,synth_at');
  for (const s of st || []) {
    if (!s.facts_changed_at || (s.synth_at && new Date(s.synth_at) >= new Date(s.facts_changed_at))) continue;
    /* Перший обхід ще йде — чекаємо, поки всі сторінки фірми пройдуть. */
    const { count: pending } = await db.from('prop_rule_pages').select('id', { count: 'exact', head: true })
      .eq('firm', s.firm).eq('active', true).is('extracted_at', null).is('last_error', null);
    if (pending) continue;
    try { await synthesize(db, s.firm); } catch (e) { console.error('prop synth:', s.firm, e.message); }
  }
}

/* ---------- вхід з server.mjs ---------- */

export async function runPropRulesMonitor() {
  if (process.env.PROP_RULES_OFF === '1') return;
  const db = admin();
  await notifyApproved(db);
  if (!process.env.PROP_SCRAPER_URL || !(process.env.LLM_API_KEY || process.env.GEMINI_API_KEY)) return;

  const { data: list, error } = await db.from('prop_rule_sources').select('*').eq('active', true);
  if (error) { console.error('prop rules:', error.message); return; }
  const now = Date.now();
  const due = (s) => !s.last_fetch_at || now - new Date(s.last_fetch_at).getTime() >= EVERY
    || (s.run_requested_at && new Date(s.run_requested_at) > new Date(s.last_fetch_at));
  const sources = new Map((list || []).map((s) => [s.id, s]));

  /* «Перевірити зараз» з адмінки: усі сторінки фірми — у чергу. */
  const forced = [...new Set((list || []).filter((s) => s.run_requested_at && (!s.last_fetch_at || new Date(s.run_requested_at) > new Date(s.last_fetch_at))).map((s) => s.firm))];
  if (forced.length) await db.from('prop_rule_pages').update({ checked_at: null }).in('firm', forced);

  const prefetched = new Map();
  for (const s of list || []) {
    if (!due(s)) continue;
    if (s.kind === 'news') {
      try {
        await runNews(db, s);
      } catch (e) {
        console.error('prop news:', s.firm, e.message);
        await db.from('prop_rule_sources').update({ last_fetch_at: new Date(Date.now() - EVERY + H).toISOString(), last_ok: false, last_note: e.message.slice(0, 300), run_requested_at: null }).eq('id', s.id);
      }
      continue;
    }
    const texts = await runDiscovery(db, s);
    texts.forEach((t, u) => prefetched.set(u, t));
  }
  await processPages(db, prefetched, sources);
  await maybeSynthesize(db);
}

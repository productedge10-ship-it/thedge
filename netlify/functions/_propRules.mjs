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
const MODEL = () => process.env.PROP_GEMINI_MODEL || 'gemini-2.5-flash';

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

async function gemini(prompt, { json = true } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY не заданий');
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, ...(json ? { responseMimeType: 'application/json' } : {}) },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`gemini ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return json ? JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')) : text.trim();
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

/* ---------- одна фірма ---------- */

async function runFirm(db, firm, sources, force) {
  const texts = [];
  let changed = force;
  for (const s of sources) {
    let res;
    try {
      res = await scrape(s.url, s.options || {});
    } catch (e) {
      res = { ok: false, notes: [e.message] };
    }
    const note = [...(res.notes || []), ...(res.missing_tabs?.length ? [`нема вкладок: ${res.missing_tabs.join(', ')}`] : [])].join('; ') || null;
    if (!res.ok || !res.text) {
      await db.from('prop_rule_sources').update({ last_fetch_at: new Date().toISOString(), last_ok: false, last_via: res.via || null, last_note: note, run_requested_at: null }).eq('id', s.id);
      console.error('prop rules: не вдалось', firm, s.url, note);
      continue;
    }
    const hash = stableHash(res.text);
    if (hash !== s.last_hash) changed = true;
    texts.push({ s, text: res.text, hash, via: res.via, note });
  }
  if (!texts.length) return;

  const stamp = new Date().toISOString();
  const saveSources = () => Promise.all(texts.map((t) => db.from('prop_rule_sources').update({
    last_fetch_at: stamp, last_ok: true, last_via: t.via, last_note: t.note, last_hash: t.hash, run_requested_at: null,
  }).eq('id', t.s.id)));

  if (!changed) { await saveSources(); return; }

  const { data: current } = await db.from('prop_rules').select('program,rules').eq('firm', firm);
  const known = (current || []).map((r) => r.program);
  const joined = texts.map((t) => `### ${t.s.url}\n${t.text}`).join('\n\n');

  let out;
  try {
    out = await gemini(extractPrompt(firm, joined, known));
  } catch (e) {
    /* Gemini впав (ліміт, мережа) — хеш не зберігаємо, щоб наступна
       спроба знову дійшла до витягу; повтор через ~2 год, не щотіку. */
    const retry = new Date(Date.now() - EVERY + 2 * H).toISOString();
    await Promise.all(texts.map((t) => db.from('prop_rule_sources').update({ last_fetch_at: retry, last_ok: false, last_note: `gemini: ${e.message}`.slice(0, 300) }).eq('id', t.s.id)));
    throw e;
  }
  const programs = Array.isArray(out?.programs) ? out.programs.filter((p) => p?.program) : [];

  for (const t of texts) {
    await db.from('prop_rule_snapshots').insert({ source_id: t.s.id, via: t.via, text_hash: t.hash, text: t.text, extracted: out });
  }
  await saveSources();
  if (!programs.length) { console.error('prop rules: Gemini не знайшов програм', firm); return; }

  const byProgram = new Map((current || []).map((r) => [r.program, r.rules]));
  const seen = new Set();
  for (const p of programs) {
    const program = String(p.program).trim();
    seen.add(program);
    const oldR = byProgram.get(program) || null;
    const diff = diffRules(oldR, p);
    if (oldR && !diff.length) continue;
    await upsertChange(db, { firm, program, sourceId: texts[0].s.id, oldR, newR: p, diff, excerpt: joined.slice(0, 4000) });
  }
  /* Програма зникла з сайту — теж зміна, але рішення за адміном:
     це може бути й промах витягу. */
  for (const [program, rules] of byProgram) {
    if (seen.has(program) || rules?.discontinued) continue;
    const newR = { ...rules, discontinued: true };
    await upsertChange(db, { firm, program, sourceId: texts[0].s.id, oldR: rules, newR,
      diff: [{ field: 'discontinued', label: 'Програма', old: 'є на сайті', new: 'не знайдена на сайті', major: true }], excerpt: joined.slice(0, 4000) });
  }
}

/* Одна відкрита (pending) зміна на фірму+програму: нова знахідка
   оновлює її, а не плодить дублікати, поки адмін не дійшов. */
async function upsertChange(db, { firm, program, sourceId, oldR, newR, diff, excerpt }) {
  const { data: open } = await db.from('prop_rule_changes').select('id,new_rules')
    .eq('firm', firm).eq('program', program).eq('status', 'pending').maybeSingle();
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
"""`);
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

/* ---------- вхід з server.mjs ---------- */

export async function runPropRulesMonitor() {
  if (process.env.PROP_RULES_OFF === '1') return;
  const db = admin();
  await notifyApproved(db);
  if (!process.env.PROP_SCRAPER_URL || !process.env.GEMINI_API_KEY) return;

  const { data: sources, error } = await db.from('prop_rule_sources').select('*').eq('active', true);
  if (error) { console.error('prop rules:', error.message); return; }
  const now = Date.now();
  const due = (s) => !s.last_fetch_at || now - new Date(s.last_fetch_at).getTime() >= EVERY
    || (s.run_requested_at && new Date(s.run_requested_at) > new Date(s.last_fetch_at));

  const firms = new Map();
  for (const s of sources || []) {
    if (s.kind === 'news') {
      if (due(s)) { try { await runNews(db, s); } catch (e) { console.error('prop news:', s.firm, e.message); } }
      continue;
    }
    if (!firms.has(s.firm)) firms.set(s.firm, []);
    firms.get(s.firm).push(s);
  }
  for (const [firm, list] of firms) {
    if (!list.some(due)) continue;
    const force = list.some((s) => s.run_requested_at && (!s.last_fetch_at || new Date(s.run_requested_at) > new Date(s.last_fetch_at)));
    try { await runFirm(db, firm, list, force); } catch (e) { console.error('prop rules:', firm, e.message); }
  }
}

/* ==================================================================
   Що можна і що не можна на конкретному рахунку пропа.

   Правила новин, вихідних, консистентності тощо в пропів залежать не
   лише від програми, а й від етапу (оцінка / funded) і варіанту
   (FTMO Standard / Swing, Swing add-on у FundingPips). Тут — ручна,
   звірена з текстом правил (src/dev/prop-rules/*.json) матриця:
   profile → policy. Текст правил лишається джерелом пояснень, а
   рішення «попереджати чи ні» приймає ця таблиця.

   profile = { program, stage: 'eval' | 'funded', variant: 'standard' | 'swing', swingAddon: bool }
================================================================== */

const low = (s) => String(s || '').toLowerCase();

/* Програми, де етапу оцінки нема — рахунок одразу funded. */
const INSTANT = /instant|direct|zero|0-phase/i;
export const isInstant = (program) => INSTANT.test(program || '');

/* Які перемикачі показувати для цієї фірми/програми. */
export function optionsFor(firmId, program) {
  const p = low(program);
  return {
    stage: !isInstant(program),
    variant: firmId === 'ftmo' && /2-step/.test(p),
    swingAddon: firmId === 'fundingpips' && !/zero/.test(p),
  };
}

export const STAGE_LABEL = { eval: 'Оцінка (челендж)', funded: 'Funded' };
export function profileLabel(firmId, profile) {
  if (!profile?.program) return '';
  const o = optionsFor(firmId, profile.program);
  const parts = [profile.program];
  if (o.variant) parts.push(profile.variant === 'swing' ? 'Swing' : 'Standard');
  if (o.swingAddon && profile.swingAddon) parts.push('Swing add-on');
  parts.push(o.stage ? STAGE_LABEL[profile.stage || 'eval'] : 'Funded');
  return parts.join(' · ');
}

/* Угадуємо профіль з назви рахунку / сервера MT5. sure — чи можна не питати. */
export function guessProfile(firmId, programs, text) {
  const t = low(text);
  const names = (programs || []).map((p) => p.program);
  const norm = (s) => low(s).replace(/[^a-z0-9]+/g, ' ').trim();
  const program = names.find((n) => norm(n).split(' ').filter((w) => w.length > 2 || /\d/.test(w)).every((w) => norm(t).includes(w))) || (names.length === 1 ? names[0] : null);
  let stage = null;
  if (/challenge|verification|evaluation|phase|step ?\d|етап|челендж|student|practitioner/.test(t)) stage = 'eval';
  if (/funded|master|qualified|ftmo account|trader|senior|live/.test(t)) stage = 'funded';
  if (program && isInstant(program)) stage = 'funded';
  const variant = /swing/.test(t) ? 'swing' : 'standard';
  return { profile: { program, stage: stage || 'eval', variant, swingAddon: /swing/.test(t) }, sure: !!program && !!stage };
}

/* ---------- матриця по пропах ---------- */

const yes = (note) => ({ allowed: true, note });
const no = (note, hard = false) => ({ allowed: false, note, hard });

function ftmo(p, stage, profile) {
  const instant = /instant/.test(p);
  const swing = profile.variant === 'swing' && /2-step/.test(p);
  const funded = instant || stage === 'funded';
  return {
    news: funded && !swing
      ? { restricted: true, note: 'На FTMO Account (Standard) заборонене будь-яке виконання ордерів — відкриття, закриття, SL/TP, відкладені — за 2 хв до і 2 хв після обраних новин по інструментах цієї валюти.' }
      : { restricted: false, note: swing ? 'На Swing-рахунку FTMO новини дозволені.' : 'На Challenge і Verification FTMO новини дозволені.' },
    weekend: funded && !swing ? no('На Standard FTMO Account позиції треба закрити до перерви ринку довшої за 2 год — зокрема до вихідних.') : yes(swing ? 'Swing: вихідні дозволені.' : 'На оцінці вихідні дозволені.'),
    overnight: yes('Через ніч тримати можна.'),
    consistency: /1-step/.test(p) ? { pct: 50, breach: false, note: 'Найкращий день ≤ 50% прибутку. Це не порушення — просто торгуй далі, поки частка не впаде.' }
      : instant ? { pct: 30, breach: false, note: 'Найкращий день ≤ 30% прибутку для виплати.' } : null,
  };
}

function fundingpips(p, stage, profile) {
  const zero = /zero/.test(p);
  const funded = zero || stage === 'funded';
  const swing = !zero && profile.swingAddon;
  return {
    news: funded
      ? { restricted: true, window: zero ? { before: 10, after: 10 } : null, hard: zero, note: zero ? 'Zero Master: торгівля у вікні ±10 хв навколо новин — одразу закриття рахунку (hard breach).' : 'Master: угоди, відкриті чи закриті у вікні ±5 хв, — прибуток з них списують (soft breach).' }
      : { restricted: false, note: 'На оцінці FundingPips новини дозволені, але навмисно торгувати саме на новинах не можна.' },
    weekend: !funded ? yes('На оцінці вихідні дозволені.') : zero ? no('Zero: через вихідні тримати не можна — hard breach.', true) : swing ? yes('Swing add-on: вихідні дозволені.') : no('Master без Swing add-on: система сама закриє позиції за 15 хв до закриття ринку.'),
    overnight: !funded || swing ? yes('Через ніч тримати можна.') : zero ? no('Zero: перенесення позицій заборонене.', true) : no('Master без Swing add-on: через ніч позиції закриваються.'),
    consistency: zero ? { pct: 15, breach: true, note: 'Найкращий день ≤ 15% загального прибутку.' } : funded ? { pct: 35, breach: false, note: '35% — лише для виплат On Demand.' } : null,
    maxRisk: zero ? { pct: 1, note: 'Відкритий ризик не більше 1%.' } : null,
  };
}

function alphacapital(p, stage) {
  const swing = /swing/.test(p);
  const direct = /direct/.test(p);
  const funded = direct || stage === 'funded';
  return {
    news: funded && !swing
      ? { restricted: true, note: 'Qualified-рахунок: ±5 хв навколо новини не відкривай і не закривай угод на зачеплених інструментах — прибуток анулюють (soft breach).' }
      : { restricted: false, note: swing ? 'Alpha Swing: новини дозволені.' : 'На челенджі Alpha Capital новини не обмежені.' },
    weekend: funded && (/pro/.test(p) || direct) ? no('Qualified Pro / Direct: через вихідні не тримай (soft breach — знімуть прибуток).') : yes('Вихідні дозволені.'),
    overnight: yes('Через ніч тримати можна.'),
    consistency: { pct: direct ? 15 : 40, breach: false, note: `Найкращий день ≤ ${direct ? 15 : 40}% загального прибутку — умова виплати.` },
    maxRisk: direct ? { pct: 1, note: 'Max Risk: до 1% ризику на актив з першої угоди.' } : null,
  };
}

function blueguardian(p, stage) {
  const instant = /instant/.test(p);
  const funded = instant || stage === 'funded';
  const starter = /starter/.test(p);
  const cons = /nano/.test(p) ? (funded || /1 step/.test(p) ? 50 : null) : starter ? 15 : /instant standard/.test(p) ? 20 : /bnpl|pay later/.test(p) && funded ? 20 : null;
  return {
    news: funded && !starter
      ? { restricted: true, note: 'Funded: ±5 хв навколо червоних новин і FOMC прибуток з угод знімають (без порушення рахунку).' }
      : { restricted: false, note: starter ? 'Instant Starter: новини не обмежені.' : 'На оцінці Blue Guardian новини дозволені.' },
    weekend: yes('Вихідні й ніч дозволені на всіх рахунках.'),
    overnight: yes('Через ніч тримати можна.'),
    consistency: cons ? { pct: cons, breach: false, note: `Найкращий день ≤ ${cons}% прибутку — умова виплати.` } : null,
    autoClose: funded ? { pct: instant || /bnpl|pay later/.test(p) ? 1 : (/standard/.test(p) ? 2 : null), note: 'Guardian Shield закриває угоду, коли плаваючий збиток досягає ліміту.' } : null,
  };
}

function the5ers(p, stage) {
  const hs = /high stakes/.test(p);
  return {
    news: hs ? { restricted: true, note: 'High Stakes: не відкривай ордери за 2 хв до і 2 хв після червоних новин — прибуток з таких угод спишуть.' }
      : { restricted: false, note: 'На цій програмі The5ers новини не обмежені.' },
    weekend: yes('Вихідні дозволені (на індексах — високі свопи).'),
    overnight: yes('Через ніч тримати можна.'),
    consistency: hs && stage === 'funded' ? { pct: 50, breach: false, note: 'На funded High Stakes — консистентність 50%.' } : null,
  };
}

function cryptofundtrader(p, stage) {
  const ascend = /ascend/.test(p);
  return {
    news: ascend ? { restricted: true, note: 'Ascend: на червоних новинах не відкривай нових позицій, не додавай обʼєм і не ризикуй більше 2%.' }
      : { restricted: false, note: 'На цій програмі CryptoFundTrader новини дозволені.' },
    weekend: yes('Вихідні й ніч дозволені.'),
    overnight: yes('Через ніч тримати можна.'),
    consistency: /break/.test(p) && stage === 'funded' ? { pct: 40, breach: false, note: 'Final Stage: жоден день не більше 40% прибутку на момент виплати.' } : null,
  };
}

const FIRMS = { ftmo, fundingpips, alphacapital, blueguardian, the5ers, cryptofundtrader };

/* Повна політика рахунку. program — обʼєкт програми з правил. */
export function policyFor(firmId, data, profile) {
  const programs = data?.structured?.programs || [];
  const program = programs.find((x) => x.program === profile?.program) || null;
  if (!program || !FIRMS[firmId]) return null;
  const stage = isInstant(program.program) ? 'funded' : (profile.stage || 'eval');
  const base = FIRMS[firmId](low(program.program), stage, profile || {});
  const n = data?.structured?.restricted_news || {};
  const window = base.news.window || { before: Number(n.window_min_before) || 2, after: Number(n.window_min_after) || Number(n.window_min_before) || 2 };
  const evalPhases = (program.phases || []).filter((f) => f.profit_target_pct);
  return {
    ...base,
    program, stage,
    news: { ...base.news, window },
    minDays: stage === 'eval' ? Math.max(0, ...evalPhases.map((f) => Number(f.min_trading_days) || 0)) || null : null,
    ea: data?.structured?.ea_allowed || null,
  };
}

/* Новинна заборона для фірми з урахуванням профілю: true / false / null (профіль невідомий). */
export function newsApplies(firmId, data, profile) {
  const pol = profile?.program ? policyFor(firmId, data, profile) : null;
  return pol ? pol.news.restricted : null;
}

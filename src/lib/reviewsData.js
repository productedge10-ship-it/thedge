/* ==================================================================
   Дані та математика сторінки розборів.
   Поки що тимчасові — але структура вже така, якою прийде з бази,
   щоб потім лишилось замінити джерело.

   1R = 1% депозиту, як і в бектестах.
================================================================== */

export const MISTAKE_TYPES = {
  early_entry:  { label: 'Ранній вхід',      hint: 'Не дочекався підтвердження' },
  no_plan:      { label: 'Вхід без плану',   hint: 'Угоди не було в плані на день' },
  micromanage:  { label: 'Мікроменеджмент',  hint: 'Руками чіпав позицію без причини' },
  revenge:      { label: 'Відігравання',     hint: 'Вхід одразу після стопу' },
  oversize:     { label: 'Завеликий ризик',  hint: 'Розмір більший за домовлений' },
  late_exit:    { label: 'Пізній вихід',     hint: 'Тримав після сигналу на вихід' },
};

export const EMOTIONS = [
  { id: 'calm',       label: 'Спокій',      good: true },
  { id: 'focus',      label: 'Фокус',       good: true },
  { id: 'patience',   label: 'Терпіння',    good: true },
  { id: 'fomo',       label: 'FOMO',        good: false },
  { id: 'tilt',       label: 'Тільт',       good: false },
  { id: 'fear',       label: 'Страх',       good: false },
  { id: 'greed',      label: 'Жадібність',  good: false },
];

/* Питання, з яких народжується нормальний висновок.
   Порожнє поле «опиши тиждень» люди заповнюють водою — конкретні
   питання дають конкретні відповіді. */
export const PROMPTS = [
  { id: 'worked',  label: 'Що спрацювало', question: 'Які рішення хочеш повторити наступного разу?', placeholder: 'Наприклад: чекав закриття 15m перед входом — жодного раннього стопу.' },
  { id: 'broke',   label: 'Що зламалось',  question: 'Де саме ти вийшов за межі плану і чому?',     placeholder: 'Наприклад: після другого стопу поліз відігравати — мінус ще 1R.' },
  { id: 'pattern', label: 'Закономірність', question: 'Що повторюється з тижня в тиждень?',          placeholder: 'Наприклад: усі мінуси — в азійську сесію.' },
];

const d = (iso) => iso;

/* ---------- тимчасові дані ---------- */

export const DEMO_TRADES = [
  { id: 't1',  date: d('2026-07-20'), pair: 'EURUSD', type: 'LONG',  result: 'WIN',  rr: 2.4, session: 'London',   followedPlan: true,  note: 'Свіп азійського лоу, вхід по ретесту FVG.' },
  { id: 't2',  date: d('2026-07-20'), pair: 'GBPUSD', type: 'SHORT', result: 'LOSS', rr: 1,   session: 'London',   followedPlan: false, note: 'Зайшов до підтвердження, стоп за 6 хвилин.' },
  { id: 't3',  date: d('2026-07-21'), pair: 'XAUUSD', type: 'LONG',  result: 'WIN',  rr: 3.1, session: 'New York', followedPlan: true,  note: 'Реакція на CPI, вхід після першого імпульсу.' },
  { id: 't4',  date: d('2026-07-21'), pair: 'EURUSD', type: 'SHORT', result: 'BE',   rr: 0,   session: 'London',   followedPlan: true,  note: 'Вивів у беззбиток перед новинами.' },
  { id: 't5',  date: d('2026-07-22'), pair: 'BTCUSD', type: 'LONG',  result: 'LOSS', rr: 1,   session: 'Asia',     followedPlan: false, note: 'Нудна азія, поліз від нудьги.' },
  { id: 't6',  date: d('2026-07-22'), pair: 'BTCUSD', type: 'LONG',  result: 'LOSS', rr: 1,   session: 'Asia',     followedPlan: false, note: 'Одразу після стопу — вхід «щоб відбити».' },
  { id: 't7',  date: d('2026-07-23'), pair: 'NAS100', type: 'LONG',  result: 'WIN',  rr: 1.8, session: 'New York', followedPlan: true,  note: 'Класичний ретест OB після BOS.' },
  { id: 't8',  date: d('2026-07-24'), pair: 'EURUSD', type: 'LONG',  result: 'WIN',  rr: 2.2, session: 'London',   followedPlan: true,  note: 'За планом від і до, тримав до денного таргету.' },
  { id: 't9',  date: d('2026-07-24'), pair: 'GBPUSD', type: 'SHORT', result: 'WIN',  rr: 1.3, session: 'London',   followedPlan: false, note: 'Закрив руками раніше часу, злякався відкату.' },
  { id: 't10', date: d('2026-07-25'), pair: 'XAUUSD', type: 'SHORT', result: 'LOSS', rr: 1,   session: 'New York', followedPlan: true,  note: 'Чесний стоп, структура зламалась.' },
];

export const DEMO_PLANS = [
  { id: 'p1', date: d('2026-07-20'), pair: 'EURUSD', narrative: 'Bullish', status: 'Відпрацьовано', text: 'Чекаю зняття азійського мінімуму й повернення в діапазон. Вхід тільки після закриття 15m над FVG.' },
  { id: 'p2', date: d('2026-07-21'), pair: 'XAUUSD', narrative: 'Bullish', status: 'Відпрацьовано', text: 'CPI о 15:30. Не лізу до виходу цифри, працюю з першим відкатом.' },
  { id: 'p3', date: d('2026-07-22'), pair: 'BTCUSD', narrative: 'Neutral', status: 'Пропущено',     text: 'День без сетапу — не торгую. (План порушено.)' },
  { id: 'p4', date: d('2026-07-24'), pair: 'EURUSD', narrative: 'Bullish', status: 'Відпрацьовано', text: 'Продовження тренду від денного OB, ціль — максимум тижня.' },
];

export const DEMO_MISTAKES = [
  { id: 'm1', date: d('2026-07-20'), pair: 'GBPUSD', type: 'early_entry', severity: 'high', description: 'Не дочекався закриття свічки — вхід на емоціях після різкого руху.', cost: -1 },
  { id: 'm2', date: d('2026-07-22'), pair: 'BTCUSD', type: 'no_plan',     severity: 'high', description: 'Азія не входила в план на день, але я все одно відкрив дві угоди.', cost: -1 },
  { id: 'm3', date: d('2026-07-22'), pair: 'BTCUSD', type: 'revenge',     severity: 'high', description: 'Одразу після стопу зайшов назад, щоб відбити — ще один мінус.', cost: -1 },
  { id: 'm4', date: d('2026-07-24'), pair: 'GBPUSD', type: 'micromanage', severity: 'mid',  description: 'Закрив руками на 1.3R замість запланованих 2.5R.', cost: -1.2 },
  { id: 'm5', date: d('2026-07-16'), pair: 'EURUSD', type: 'early_entry', severity: 'mid',  description: 'Знову вхід до підтвердження — тиждень тому те саме.', cost: -1 },
  { id: 'm6', date: d('2026-07-15'), pair: 'BTCUSD', type: 'revenge',     severity: 'high', description: 'Відігравання після стопу в азію.', cost: -1 },
];

export const DEMO_REVIEWS = [
  {
    id: 'r1',
    from: '2026-07-13', to: '2026-07-19',
    score: 3,
    emotions: ['fomo', 'focus'],
    answers: {
      worked: 'Лондон відпрацював чисто: три угоди за планом, усі в плюс. Коли чекаю закриття 15m — результат стабільний.',
      broke: 'Двічі заходив до підтвердження на GBPUSD. Обидва рази стоп протягом 10 хвилин.',
      pattern: 'Мінуси збираються поза лондонською сесією. В азію я торгую від нудьги, а не від сетапу.',
    },
    lesson: 'Наступного тижня — жодної угоди поза London і NY. Азія закрита.',
    promises: [
      { text: 'Не торгувати в азійську сесію', done: false },
      { text: 'Чекати закриття 15m перед кожним входом', done: true },
    ],
    stats: { trades: 8, netR: 2.1, winrate: 50, planRate: 62, mistakes: 3 },
  },
  {
    id: 'r2',
    from: '2026-07-06', to: '2026-07-12',
    score: 4,
    emotions: ['calm', 'patience'],
    answers: {
      worked: 'Тримав ранери до таргету, не чіпав руками. Найкращий тиждень за місяць саме через це.',
      broke: 'Один раз збільшив ризик до 2% — угода вийшла в плюс, але це чиста випадковість.',
      pattern: 'Коли ризик 1%, я виконую план. Коли більше — починаю рухати стоп.',
    },
    lesson: 'Ризик 1% і крапка. Розмір позиції не обговорюється.',
    promises: [
      { text: 'Тримати ризик рівно 1%', done: true },
    ],
    stats: { trades: 6, netR: 5.4, winrate: 67, planRate: 83, mistakes: 1 },
  },
];

/* ---------- математика ---------- */

export const rOf = (t) => (t.result === 'BE' ? 0 : t.result === 'LOSS' ? -Math.abs(t.rr || 1) : Math.abs(t.rr || 0));

export const inRange = (iso, from, to) => (!from || iso >= from) && (!to || iso <= to);

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const dt = new Date(`${iso}T12:00:00`);
  if (isNaN(dt)) return iso;
  return dt.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' }).replace(/\sр\./, '');
};

export const fmtRange = (from, to) => `${fmtDate(from)} — ${fmtDate(to)}`;

export const fmtR = (r) => `${r > 0 ? '+' : ''}${Number(r).toFixed(2)}R`;

export function periodStats(trades, mistakes) {
  const total = trades.length;
  const wins = trades.filter((t) => t.result === 'WIN').length;
  const losses = trades.filter((t) => t.result === 'LOSS').length;
  const decisive = trades.filter((t) => t.result !== 'BE').length;
  const netR = trades.reduce((s, t) => s + rOf(t), 0);
  const byPlan = trades.filter((t) => t.followedPlan).length;

  return {
    total, wins, losses,
    netR: Number(netR.toFixed(2)),
    winrate: decisive ? (wins / decisive) * 100 : 0,
    planRate: total ? (byPlan / total) * 100 : 0,
    mistakes: mistakes.length,
    costOfMistakes: Number(mistakes.reduce((s, m) => s + (m.cost || 0), 0).toFixed(2)),
    bestR: total ? Math.max(...trades.map(rOf)) : 0,
    worstR: total ? Math.min(...trades.map(rOf)) : 0,
  };
}

/* Повторювані помилки: скільки разів тип траплявся в періоді
   і скільки — раніше. Друге й пояснює, чому це болить. */
export function repeatedMistakes(allMistakes, from, to) {
  const inside = allMistakes.filter((m) => inRange(m.date, from, to));
  const before = allMistakes.filter((m) => m.date < from);

  const map = {};
  inside.forEach((m) => {
    map[m.type] = map[m.type] || { type: m.type, now: 0, before: 0, cost: 0, items: [] };
    map[m.type].now += 1;
    map[m.type].cost += m.cost || 0;
    map[m.type].items.push(m);
  });
  before.forEach((m) => {
    if (map[m.type]) map[m.type].before += 1;
  });

  return Object.values(map)
    .map((x) => ({ ...x, cost: Number(x.cost.toFixed(2)), total: x.now + x.before }))
    .sort((a, b) => b.total - a.total || b.now - a.now);
}

/* Останній розбір перед вибраним періодом — щоб було з чим порівняти */
export function previousReview(reviews, from) {
  return [...reviews]
    .filter((r) => !from || r.to < from)
    .sort((a, b) => (a.to < b.to ? 1 : -1))[0] || null;
}

export const SCORE_LABELS = ['', 'Провальний', 'Слабкий', 'Нормальний', 'Добрий', 'Еталонний'];

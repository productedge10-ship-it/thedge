import { t as tx } from '../lang';
import { brokerToUtc, upperBound, tfById } from './agg';

/* ==================================================================
   Індикатори графіка.

   Готової бібліотеки під це немає: Lightweight Charts індикаторів не
   має зовсім, а ICT-речі (сесії, кілзони, FVG, ліквідність) існують
   лише як Pine-скрипти всередині TradingView. Тому все тут — своє.

   Головне правило: розрахунок бачить ТІЛЬКИ ті свічки, що вже є на
   графіку. У реплеї контекст обрізаний по cut, остання свічка —
   недоформована, а «попередній день/тиждень» беремо лише з тих, що
   вже повністю закрились. Жоден індикатор не може підглянути вперед.

   Кожен індикатор: опис полів і compute(ctx, inp), що повертає серії
   (лінії бібліотеки) і фігури для SVG-шару в координатах «індекс
   свічки / ціна». Поля розкладені по вкладках: in — вхідні, st —
   стиль, lb — підписи. Вкладку «Видимість» (таймфрейми) вікно
   налаштувань додає само для кожного індикатора.
================================================================== */

export const CATS = [
  { id: 'ict', uk: 'ICT і сесії', en: 'ICT & sessions' },
  { id: 'levels', uk: 'Рівні', en: 'Levels' },
  { id: 'trend', uk: 'Трендові', en: 'Trend' },
  { id: 'osc', uk: 'Осцилятори', en: 'Oscillators' },
];

const TZ_OPTS = () => [
  ['America/New_York', tx('Нью-Йорк', 'New York')],
  ['Europe/London', tx('Лондон', 'London')],
  ['UTC', 'UTC'],
  ['Europe/Kyiv', tx('Київ', 'Kyiv')],
  ['broker', tx('Брокер (MT5)', 'Broker (MT5)')],
];

/* ---------------- час ---------------- */

const offCache = new Map();
/* Зсув пояса від UTC у хвилинах. Кешуємо по годинах: Intl повільний,
   а свічок у вікні — тисячі. */
function tzOffset(utcSec, tz) {
  if (tz === 'UTC') return 0;
  const key = `${tz}|${Math.floor(utcSec / 3600)}`;
  let v = offCache.get(key);
  if (v != null) return v;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(utcSec * 1000));
    const g = {}; parts.forEach((p) => { g[p.type] = +p.value; });
    const asUtc = Date.UTC(g.year, g.month - 1, g.day, g.hour % 24, g.minute) / 1000;
    v = Math.round((asUtc - Math.floor(utcSec / 60) * 60) / 60);
  } catch { v = 0; }
  if (offCache.size > 50000) offCache.clear();
  offCache.set(key, v);
  return v;
}

/* Місцевий час свічки: секунди від епохи «як UTC» у вибраному поясі. */
export function localSec(brokerSec, tz) {
  if (tz === 'broker') return brokerSec;
  const utc = brokerToUtc(brokerSec);
  return utc + tzOffset(utc, tz) * 60;
}

const parseRange = (s) => {
  const m = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  return [(+m[1]) * 60 + (+m[2]), (+m[3]) * 60 + (+m[4])];
};

/* Чи свічка в сесії і якого «дня» ця сесія (для сесій через північ). */
function inSession(loc, range) {
  const mod = Math.floor(loc / 60) % 1440;
  const day = Math.floor(loc / 86400);
  const [s, e] = range;
  if (s < e) return mod >= s && mod < e ? day : null;
  if (mod >= s) return day;
  if (mod < e) return day - 1;
  return null;
}

/* ---------------- математика ---------------- */

function sma(src, len) {
  const out = new Float64Array(src.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < src.length; i += 1) {
    sum += src[i];
    if (i >= len) sum -= src[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}
function ema(src, len) {
  const out = new Float64Array(src.length).fill(NaN);
  const k = 2 / (len + 1);
  let prev = NaN;
  for (let i = 0; i < src.length; i += 1) {
    if (Number.isNaN(prev)) { if (i >= len - 1) { let s = 0; for (let j = i - len + 1; j <= i; j += 1) s += src[j]; prev = s / len; out[i] = prev; } continue; }
    prev = src[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
function rma(src, len) {
  const out = new Float64Array(src.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < src.length; i += 1) {
    if (Number.isNaN(prev)) { if (i >= len - 1) { let s = 0; for (let j = i - len + 1; j <= i; j += 1) s += src[j]; prev = s / len; out[i] = prev; } continue; }
    prev = (prev * (len - 1) + src[i]) / len;
    out[i] = prev;
  }
  return out;
}
function wma(src, len) {
  const out = new Float64Array(src.length).fill(NaN);
  const den = (len * (len + 1)) / 2;
  for (let i = len - 1; i < src.length; i += 1) {
    let s = 0;
    for (let j = 0; j < len; j += 1) s += src[i - j] * (len - j);
    out[i] = s / den;
  }
  return out;
}
const MA = { EMA: ema, SMA: sma, WMA: wma, RMA: rma };

function stdev(src, len, mean) {
  const out = new Float64Array(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i += 1) {
    let s = 0;
    for (let j = i - len + 1; j <= i; j += 1) s += (src[j] - mean[i]) ** 2;
    out[i] = Math.sqrt(s / len);
  }
  return out;
}

function trueRange(ctx) {
  const { H, L, C, n } = ctx;
  const tr = new Float64Array(n);
  for (let i = 0; i < n; i += 1) tr[i] = i ? Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])) : H[i] - L[i];
  return tr;
}

const line = (ctx, arr, opts = {}) => {
  const data = [];
  for (let i = 0; i < ctx.n; i += 1) data.push(Number.isFinite(arr[i]) ? { time: ctx.T[i], value: arr[i] } : { time: ctx.T[i] });
  return { kind: 'line', data, ...opts };
};

function withA(c, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ---------------- періоди ---------------- */

const periodKey = (t, kind) => {
  const day = Math.floor(t / 86400) * 86400;
  if (kind === 'day') return day;
  if (kind === 'week') { const wd = new Date(day * 1000).getUTCDay(); return day - ((wd + 6) % 7) * 86400; }
  const dd = new Date(day * 1000); return Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth(), 1) / 1000;
};

/* Дні, тижні, місяці як OHLC — з повного D1, але лише до поточного
   моменту. Поточний період недоформований — для «попереднього» його
   ніхто не використовує. */
function periods(ctx, kind) {
  const d1 = ctx.getAgg('D1');
  const dk = Math.min(d1.n - 1, upperBound(d1.s, ctx.lastBase, 0, d1.n) - 1);
  const map = new Map();
  const keys = [];
  for (let k = 0; k <= dk; k += 1) {
    const key = periodKey(d1.t[k], kind);
    const b = k === dk ? ctx.barD1(k) : { open: d1.o[k], high: d1.h[k], low: d1.l[k], close: d1.c[k] };
    let p = map.get(key);
    if (!p) { p = { key, o: b.open, h: b.high, l: b.low, c: b.close }; map.set(key, p); keys.push(key); }
    else { p.h = Math.max(p.h, b.high); p.l = Math.min(p.l, b.low); p.c = b.close; }
  }
  return { map, keys };
}

/* Групи свічок вікна за періодом. */
function groupBy(ctx, keyOf) {
  const out = [];
  let cur = null;
  for (let i = 0; i < ctx.n; i += 1) {
    const key = keyOf(ctx.T[i], i);
    if (!cur || cur.key !== key) { cur = { key, i0: i, i1: i }; out.push(cur); } else cur.i1 = i;
  }
  return out;
}

/* «Показувати: поточний / останні N / усе». */
function pickShown(list, inp) {
  if (inp.show === 'all') return list;
  const n = inp.show === 'current' ? 1 : Math.max(1, Math.round(inp.count || 1));
  return list.slice(-n);
}

/* Перша свічка після from, що дійшла до рівня. */
function sweepIndex(ctx, from, price) {
  for (let j = from; j < ctx.n; j += 1) if (ctx.L[j] <= price && ctx.H[j] >= price) return j;
  return null;
}

/* Текст підпису: власна назва + за бажанням ціна. */
const labelText = (ctx, inp, name, price) => {
  const parts = [];
  if (name) parts.push(name);
  if (inp.labelPrice && price != null) parts.push(ctx.fmt(price));
  return parts.join(' ');
};

const labelStyle = (inp) => ({ labelPos: inp.labelPos, labelSize: inp.labelSize, labelBg: inp.labelBg });

/* ---------------- поля ---------------- */

const f = {
  bool: (key, uk, en, def, sec = 'in', when) => ({ key, type: 'bool', uk, en, def, sec, when }),
  num: (key, uk, en, def, min, max, step = 1, sec = 'in', when) => ({ key, type: 'number', uk, en, def, min, max, step, sec, when }),
  color: (key, uk, en, def, when) => ({ key, type: 'color', uk, en, def, sec: 'st', when }),
  sel: (key, uk, en, def, options, sec = 'in', when) => ({ key, type: 'select', uk, en, def, options, sec, when }),
  range: (key, uk, en, def, sec = 'in', when) => ({ key, type: 'range', uk, en, def, sec, when }),
  text: (key, uk, en, def, sec = 'in', when) => ({ key, type: 'text', uk, en, def, sec, when }),
};
const LS = () => [['solid', tx('Суцільна', 'Solid')], ['dashed', tx('Пунктир', 'Dashed')], ['dotted', tx('Крапки', 'Dotted')]];
const TFMAX = () => [['M5', '5m'], ['M15', '15m'], ['M30', '30m'], ['H1', '1H'], ['H4', '4H']];

const showFields = (def, n, labels) => [
  f.sel('show', 'Показувати', 'Show', def, () => labels || [
    ['current', tx('Тільки поточний', 'Current only')],
    ['last', tx('Останні N', 'Last N')],
    ['all', tx('Усю історію', 'All history')],
  ]),
  f.num('count', '  Скільки останніх', '  How many', n, 1, 2000, 1, 'in', (i) => i.show === 'last'),
];

/* Спільне для підписів — у кожного, де є текст на графіку. */
const labelFields = (on = true, axis = false) => [
  f.bool('labels', 'Підписи на графіку', 'Labels on chart', on, 'lb'),
  f.bool('labelPrice', '  Ціна в підписі', '  Price in label', false, 'lb', (i) => i.labels),
  f.sel('labelPos', '  Положення', '  Position', 'end', () => [['end', tx('Справа, над лінією', 'Right, above line')], ['start', tx('Зліва, над лінією', 'Left, above line')], ['mid', tx('Посередині', 'Middle')], ['below', tx('Справа, під лінією', 'Right, below line')]], 'lb', (i) => i.labels),
  f.num('labelSize', '  Розмір шрифту', '  Font size', 11, 8, 20, 1, 'lb', (i) => i.labels),
  f.bool('labelBg', '  Плашка під текстом', '  Label background', false, 'lb', (i) => i.labels),
  f.bool('axis', 'Мітки ціни на шкалі', 'Price labels on scale', axis, 'lb'),
];

const lineStyleFields = (w = 1, style = 'dashed') => [
  f.num('width', 'Товщина', 'Width', w, 1, 4, 1, 'st'),
  f.sel('style', 'Стиль лінії', 'Line style', style, LS, 'st'),
];

/* ==================================================================
   Сесії й кілзони
================================================================== */

const SESSIONS = [
  { name: 'Asia', range: '00:00-08:00', color: '#9c27b0', on: true },
  { name: 'London', range: '07:00-16:00', color: '#2962ff', on: true },
  { name: 'New York', range: '12:00-21:00', color: '#ff9800', on: true },
];
const KILLZONES = [
  { name: 'Asia KZ', range: '20:00-00:00', color: '#9c27b0', on: true },
  { name: 'London KZ', range: '02:00-05:00', color: '#2962ff', on: true },
  { name: 'NY AM KZ', range: '08:30-11:00', color: '#089981', on: true },
  { name: 'London Close', range: '10:00-12:00', color: '#f23645', on: false },
  { name: 'NY PM KZ', range: '13:30-16:00', color: '#ff9800', on: false },
];

const SESSION_SHOW = () => [
  ['current', tx('Тільки остання сесія', 'Latest session only')],
  ['today', tx('Сесії сьогоднішнього дня', "Today's sessions")],
  ['last', tx('Останні N днів', 'Last N days')],
  ['all', tx('Усю історію', 'All history')],
];

const sessionFields = (list, tz, alpha, mode) => [
  f.sel('tz', 'Часовий пояс', 'Timezone', tz, TZ_OPTS),
  ...showFields(mode === 'bg' ? 'last' : 'last', 3, SESSION_SHOW()),
  ...list.flatMap((s, i) => [
    f.bool(`on${i}`, s.name, s.name, s.on),
    f.text(`name${i}`, '  Назва', '  Name', s.name, 'in', (inp) => inp[`on${i}`]),
    f.range(`range${i}`, '  Час', '  Time', s.range, 'in', (inp) => inp[`on${i}`]),
    f.color(`color${i}`, s.name, s.name, s.color),
  ]),
  f.sel('maxTf', 'Показувати до таймфрейму', 'Show up to timeframe', 'H1', TFMAX),
  f.sel('mode', 'Вигляд', 'Style', mode, () => [['box', tx('Коробка (high/low)', 'Box (high/low)')], ['bg', tx('Фон на всю висоту', 'Full-height background')]], 'st'),
  f.num('alpha', 'Прозорість заливки', 'Fill opacity', alpha, 0, 1, 0.02, 'st'),
  f.bool('border', 'Рамка', 'Border', true, 'st', (i) => i.mode === 'box'),
  f.bool('hl', 'Лінії high / low сесії', 'Session high / low lines', false, 'st'),
  f.sel('extendHL', '  Продовжити high / low', '  Extend high / low', 'none', () => [['none', tx('Ні — лише в межах сесії', 'No — within the session')], ['right', tx('До правого краю', 'To the right edge')], ['swept', tx('До зняття ціною', 'Until swept')]], 'st', (i) => i.hl),
  f.bool('mid', 'Середина сесії', 'Session midline', false, 'st'),
  f.bool('openLine', 'Ціна відкриття сесії', 'Session open price', false, 'st'),
  f.bool('labels', 'Назва сесії', 'Session name', true, 'lb'),
  f.sel('boxLabelPos', '  Де назва', '  Name position', 'tl', () => [['tl', tx('Зверху зліва', 'Top left')], ['tr', tx('Зверху справа', 'Top right')], ['bl', tx('Знизу зліва', 'Bottom left')], ['br', tx('Знизу справа', 'Bottom right')]], 'lb', (i) => i.labels),
  f.bool('hlLabels', 'Підписи high / low', 'High / low labels', false, 'lb', (i) => i.hl),
  f.bool('labelPrice', '  Ціна в підписі', '  Price in label', true, 'lb', (i) => i.hl && i.hlLabels),
  f.num('labelSize', 'Розмір шрифту', 'Font size', 11, 8, 20, 1, 'lb'),
  f.bool('labelBg', 'Плашка під текстом', 'Label background', false, 'lb'),
  f.bool('axis', 'Мітки high / low на шкалі', 'High / low labels on scale', false, 'lb', (i) => i.hl),
];

function sessionBoxes(ctx, inp, list) {
  const shapes = { rects: [], segs: [] };
  if (ctx.sec > tfById(inp.maxTf || 'H1').sec) return { shapes };
  const all = [];
  list.forEach((s, si) => {
    if (!inp[`on${si}`]) return;
    const range = parseRange(inp[`range${si}`]);
    if (!range) return;
    let cur = null;
    for (let i = 0; i < ctx.n; i += 1) {
      const day = inSession(localSec(ctx.T[i], inp.tz), range);
      if (day == null) { cur = null; continue; }
      if (!cur || cur.day !== day) {
        cur = { si, day, i0: i, i1: i, h: ctx.H[i], l: ctx.L[i], o: ctx.O[i] };
        all.push(cur);
      } else { cur.i1 = i; cur.h = Math.max(cur.h, ctx.H[i]); cur.l = Math.min(cur.l, ctx.L[i]); }
    }
  });
  if (!all.length) return { shapes };
  /* Що показувати: остання сесія / сьогоднішні / останні N днів. */
  let shown = all;
  if (inp.show === 'current') {
    const last = all.reduce((a, b) => (b.i1 > a.i1 || (b.i1 === a.i1 && b.i0 > a.i0) ? b : a));
    shown = [last];
  } else if (inp.show !== 'all') {
    const days = [...new Set(all.map((b) => b.day))].sort((a, b) => a - b);
    const keep = new Set(days.slice(-(inp.show === 'today' ? 1 : Math.max(1, Math.round(inp.count || 1)))));
    shown = all.filter((b) => keep.has(b.day));
  }
  const ls = { labelSize: inp.labelSize, labelBg: inp.labelBg };
  shown.forEach((b) => {
    const color = inp[`color${b.si}`];
    const name = inp[`name${b.si}`] || list[b.si].name;
    const a1 = ctx.abs0 + b.i0 - 0.5; const a2 = ctx.abs0 + b.i1 + 0.5;
    const isLast = b.i1 === ctx.n - 1;
    if (inp.mode === 'bg') {
      shapes.rects.push({ a1, a2, p1: Infinity, p2: -Infinity, fill: withA(color, inp.alpha), label: inp.labels ? name : '', labelColor: color, labelPos: inp.boxLabelPos, ...ls });
    } else {
      shapes.rects.push({ a1, a2, p1: b.h, p2: b.l, fill: withA(color, inp.alpha), stroke: inp.border ? withA(color, 0.7) : '', dash: 'dashed', label: inp.labels ? name : '', labelColor: color, labelPos: inp.boxLabelPos, ...ls });
    }
    if (inp.hl) {
      [['H', b.h], ['L', b.l]].forEach(([k, p]) => {
        let end = a2;
        if (inp.extendHL === 'right') end = 'R';
        else if (inp.extendHL === 'swept') { const j = sweepIndex(ctx, b.i1 + 1, p); end = j == null ? 'R' : ctx.abs0 + j; }
        shapes.segs.push({
          a1, a2: end, p, color, width: 1, dash: 'solid',
          label: inp.hlLabels ? labelText(ctx, inp, `${name} ${k}`, p) : '', labelPos: 'end', ...ls,
          axis: inp.axis && (end === 'R' || isLast),
        });
      });
    }
    if (inp.mid) shapes.segs.push({ a1, a2, p: (b.h + b.l) / 2, color, width: 1, dash: 'dotted' });
    if (inp.openLine) shapes.segs.push({ a1, a2, p: b.o, color, width: 1, dash: 'dashed' });
  });
  return { shapes };
}

/* ==================================================================
   Рівні попереднього періоду (PDH/PDL, PWH/PWL, PMH/PML)
================================================================== */

const levelFields = (names, colors, extras = []) => [
  ...showFields('current', 5),
  f.bool('high', names[0], names[0], true),
  f.bool('low', names[1], names[1], true),
  f.bool('mid', `${names[2]} — середина`, `${names[2]} — midpoint`, false),
  f.bool('close', `${names[3]} — закриття`, `${names[3]} — close`, false),
  f.bool('open', `${names[4]} — відкриття`, `${names[4]} — open`, false),
  ...extras,
  f.sel('extend', 'Лінія поточного періоду', 'Current period line', 'right', () => [['period', tx('До останньої свічки', 'To the last candle')], ['right', tx('До правого краю', 'To the right edge')], ['swept', tx('До зняття ціною', 'Until swept')]]),
  f.sel('anchor', 'Починати лінію з', 'Start the line at', 'current', () => [['current', tx('Початку поточного періоду', 'Start of current period')], ['prev', tx('Екстремуму попереднього періоду', 'Extreme of the previous period')]]),
  f.bool('sweptFade', 'Зняті рівні — блідіші', 'Fade swept levels', true, 'st'),
  f.color('colorH', names[0], names[0], colors[0]),
  f.color('colorL', names[1], names[1], colors[1]),
  f.color('colorM', tx('Середина / закриття / відкриття', 'Mid / close / open'), 'Mid / close / open', '#787b86'),
  ...lineStyleFields(1, 'dashed'),
  f.text('nameH', 'Текст для high', 'High text', names[0], 'lb'),
  f.text('nameL', 'Текст для low', 'Low text', names[1], 'lb'),
  f.text('nameM', 'Текст для середини', 'Mid text', names[2], 'lb'),
  f.text('nameC', 'Текст для закриття', 'Close text', names[3], 'lb'),
  f.text('nameO', 'Текст для відкриття', 'Open text', names[4], 'lb'),
  ...labelFields(true, true),
  f.bool('labelsAll', 'Підписи й на минулих періодах', 'Labels on past periods too', false, 'lb', (i) => i.labels),
];

function prevLevels(ctx, inp, kind) {
  const shapes = { segs: [] };
  const span = kind === 'day' ? 86400 : kind === 'week' ? 604800 : 2592000;
  if (ctx.sec >= span) return { shapes };
  const { map, keys } = periods(ctx, kind);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const groups = groupBy(ctx, (t) => periodKey(t, kind));
  const lastG = groups[groups.length - 1];
  const shown = pickShown(groups, inp);
  shown.forEach((g) => {
    const j = idx.get(g.key);
    if (j == null || j < 1) return;
    const prev = map.get(keys[j - 1]);
    const isLast = g === lastG;
    const gi = groups.indexOf(g);
    const prevG = gi > 0 && groups[gi - 1].key === keys[j - 1] ? groups[gi - 1] : null;
    const lines = [
      ['high', prev.h, inp.colorH, inp.nameH, 'h'],
      ['low', prev.l, inp.colorL, inp.nameL, 'l'],
      ['mid', (prev.h + prev.l) / 2, inp.colorM, inp.nameM, null],
      ['close', prev.c, inp.colorM, inp.nameC, null],
      ['open', prev.o, inp.colorM, inp.nameO, null],
    ];
    lines.forEach(([key, p, color, name, ext]) => {
      if (!inp[key]) return;
      /* Початок лінії — або з початку періоду, або з тієї свічки
         минулого періоду, де був сам екстремум (як у ICT-розмітці). */
      let start = g.i0;
      if (inp.anchor === 'prev' && prevG && ext) {
        for (let i = prevG.i0; i <= prevG.i1; i += 1) if ((ext === 'h' ? ctx.H[i] : ctx.L[i]) === p) { start = i; break; }
      }
      let end = ctx.abs0 + g.i1 + 0.5;
      let swept = false;
      if (inp.extend === 'swept') {
        const s = sweepIndex(ctx, g.i0, p);
        if (s != null && s <= g.i1) { end = ctx.abs0 + s; swept = true; } else if (isLast) end = 'R';
      } else if (isLast && inp.extend === 'right') end = 'R';
      const withLabel = inp.labels && (isLast || inp.labelsAll);
      shapes.segs.push({
        a1: ctx.abs0 + start - 0.5, a2: end, p, color,
        width: key === 'high' || key === 'low' ? inp.width : 1,
        dash: key === 'mid' ? 'dotted' : inp.style,
        faded: swept && inp.sweptFade,
        label: withLabel ? labelText(ctx, inp, name, p) : '', ...labelStyle(inp),
        axis: inp.axis && isLast && !swept,
      });
    });
  });
  return { shapes };
}

/* Півоти: k — півот, якщо L свічок з обох боків нижчі (вищі). */
function pivots(ctx, L) {
  const hi = []; const lo = [];
  for (let k = L; k < ctx.n - L; k += 1) {
    let isH = true; let isL = true;
    for (let j = k - L; j <= k + L; j += 1) {
      if (j === k) continue;
      if (ctx.H[j] >= ctx.H[k]) isH = false;
      if (ctx.L[j] <= ctx.L[k]) isL = false;
      if (!isH && !isL) break;
    }
    if (isH) hi.push(k);
    if (isL) lo.push(k);
  }
  return { hi, lo };
}

/* ==================================================================
   Реєстр
================================================================== */

export const INDICATORS = {
  sessions: {
    cat: 'ict', uk: 'Торгові сесії', en: 'Trading sessions',
    dUk: 'Азія, Лондон, Нью-Йорк — коробки з high/low кожної сесії.', dEn: 'Asia, London, New York boxes with session high/low.',
    fields: sessionFields(SESSIONS, 'UTC', 0.08, 'box'),
    compute: (ctx, inp) => sessionBoxes(ctx, inp, SESSIONS),
  },
  killzones: {
    cat: 'ict', uk: 'ICT кілзони', en: 'ICT killzones',
    dUk: 'Asia, London, NY AM/PM за часом Нью-Йорка.', dEn: 'Asia, London, NY AM/PM in New York time.',
    fields: sessionFields(KILLZONES, 'America/New_York', 0.1, 'bg'),
    compute: (ctx, inp) => sessionBoxes(ctx, inp, KILLZONES),
  },
  pdhl: {
    cat: 'levels', uk: 'PDH / PDL', en: 'PDH / PDL',
    dUk: 'Максимум і мінімум попереднього дня (плюс середина, закриття, відкриття).', dEn: 'Previous day high and low (plus mid, close, open).',
    fields: levelFields(['PDH', 'PDL', 'PD EQ', 'PDC', 'PDO'], ['#089981', '#f23645']),
    compute: (ctx, inp) => prevLevels(ctx, inp, 'day'),
  },
  pwhl: {
    cat: 'levels', uk: 'PWH / PWL', en: 'PWH / PWL',
    dUk: 'Максимум і мінімум попереднього тижня.', dEn: 'Previous week high and low.',
    fields: levelFields(['PWH', 'PWL', 'PW EQ', 'PWC', 'PWO'], ['#00bcd4', '#e91e63']),
    compute: (ctx, inp) => prevLevels(ctx, inp, 'week'),
  },
  pmhl: {
    cat: 'levels', uk: 'PMH / PML', en: 'PMH / PML',
    dUk: 'Максимум і мінімум попереднього місяця.', dEn: 'Previous month high and low.',
    fields: levelFields(['PMH', 'PML', 'PM EQ', 'PMC', 'PMO'], ['#ff9800', '#9c27b0']),
    compute: (ctx, inp) => prevLevels(ctx, inp, 'month'),
  },
  opens: {
    cat: 'levels', uk: 'Відкриття дня / тижня / місяця', en: 'Daily / weekly / monthly open',
    dUk: 'Ціна відкриття періоду й опівнічне відкриття Нью-Йорка (ICT).', dEn: 'Period open prices and the New York midnight open (ICT).',
    fields: [
      ...showFields('current', 5),
      f.bool('day', 'Відкриття дня', 'Daily open', true),
      f.bool('week', 'Відкриття тижня', 'Weekly open', true),
      f.bool('month', 'Відкриття місяця', 'Monthly open', false),
      f.bool('ny', 'Опівнічне відкриття NY', 'NY midnight open', false),
      f.bool('ny830', 'Відкриття NY 08:30', 'NY 08:30 open', false),
      f.sel('extend', 'Лінія поточного періоду', 'Current period line', 'right', () => [['period', tx('До останньої свічки', 'To the last candle')], ['right', tx('До правого краю', 'To the right edge')]]),
      f.color('cDay', 'День', 'Day', '#787b86'),
      f.color('cWeek', 'Тиждень', 'Week', '#2962ff'),
      f.color('cMonth', 'Місяць', 'Month', '#9c27b0'),
      f.color('cNy', 'Опівніч NY', 'NY midnight', '#ff9800'),
      f.color('cNy830', 'NY 08:30', 'NY 08:30', '#00bcd4'),
      ...lineStyleFields(1, 'dotted'),
      f.text('nDay', 'Текст: день', 'Text: day', 'DO', 'lb'),
      f.text('nWeek', 'Текст: тиждень', 'Text: week', 'WO', 'lb'),
      f.text('nMonth', 'Текст: місяць', 'Text: month', 'MO', 'lb'),
      f.text('nNy', 'Текст: опівніч NY', 'Text: NY midnight', 'NY 00:00', 'lb'),
      f.text('nNy830', 'Текст: NY 08:30', 'Text: NY 08:30', 'NY 08:30', 'lb'),
      ...labelFields(true, false),
      f.bool('labelsAll', 'Підписи й на минулих періодах', 'Labels on past periods too', false, 'lb', (i) => i.labels),
    ],
    compute: (ctx, inp) => {
      const shapes = { segs: [] };
      const draw = (groups, startOf, color, name) => {
        const shown = pickShown(groups, inp);
        const lastG = groups[groups.length - 1];
        shown.forEach((g) => {
          const s = startOf(g);
          if (s == null) return;
          const last = g === lastG;
          const p = ctx.O[s];
          shapes.segs.push({
            a1: ctx.abs0 + s - 0.5, a2: last && inp.extend === 'right' ? 'R' : ctx.abs0 + g.i1 + 0.5, p, color, width: inp.width, dash: inp.style,
            label: inp.labels && (last || inp.labelsAll) ? labelText(ctx, inp, name, p) : '', ...labelStyle(inp), axis: inp.axis && last,
          });
        });
      };
      if (inp.day && ctx.sec < 86400) draw(groupBy(ctx, (t) => periodKey(t, 'day')), (g) => g.i0, inp.cDay, inp.nDay);
      if (inp.week && ctx.sec < 604800) draw(groupBy(ctx, (t) => periodKey(t, 'week')), (g) => g.i0, inp.cWeek, inp.nWeek);
      if (inp.month && ctx.sec < 2592000) draw(groupBy(ctx, (t) => periodKey(t, 'month')), (g) => g.i0, inp.cMonth, inp.nMonth);
      const nyDays = () => groupBy(ctx, (t) => Math.floor(localSec(t, 'America/New_York') / 86400));
      if (inp.ny && ctx.sec < 86400) draw(nyDays(), (g) => g.i0, inp.cNy, inp.nNy);
      if (inp.ny830 && ctx.sec <= 1800) {
        draw(nyDays(), (g) => {
          for (let i = g.i0; i <= g.i1; i += 1) { const m = Math.floor(localSec(ctx.T[i], 'America/New_York') / 60) % 1440; if (m >= 510) return i; }
          return null;
        }, inp.cNy830, inp.nNy830);
      }
      return { shapes };
    },
  },
  orb: {
    cat: 'ict', uk: 'Діапазон відкриття (ORB)', en: 'Opening range (ORB)',
    dUk: 'High/low перших хвилин сесії, продовжені до її кінця.', dEn: 'High/low of the first minutes of a session, extended to its end.',
    fields: [
      f.sel('tz', 'Часовий пояс', 'Timezone', 'America/New_York', TZ_OPTS),
      f.range('range', 'Діапазон', 'Range', '09:30-10:00'),
      f.range('extend', 'Продовжити до', 'Extend until', '09:30-16:00'),
      ...showFields('current', 5),
      f.bool('mid', 'Середина', 'Midline', true, 'st'),
      f.color('color', 'Колір', 'Color', '#00bcd4'),
      f.num('alpha', 'Прозорість заливки', 'Fill opacity', 0.1, 0, 1, 0.02, 'st'),
      ...lineStyleFields(1, 'solid'),
      f.text('name', 'Назва', 'Name', 'ORB', 'lb'),
      ...labelFields(true, false),
    ],
    compute: (ctx, inp) => {
      const shapes = { rects: [], segs: [] };
      const r = parseRange(inp.range); const ex = parseRange(inp.extend);
      if (!r || !ex || ctx.sec > 3600) return { shapes };
      const map = new Map();
      for (let i = 0; i < ctx.n; i += 1) {
        const loc = localSec(ctx.T[i], inp.tz);
        const dayIn = inSession(loc, r);
        const dayEx = inSession(loc, ex);
        if (dayIn != null) {
          let b = map.get(dayIn);
          if (!b) { b = { i0: i, i1: i, e1: i, h: ctx.H[i], l: ctx.L[i] }; map.set(dayIn, b); }
          b.i1 = i; b.e1 = i; b.h = Math.max(b.h, ctx.H[i]); b.l = Math.min(b.l, ctx.L[i]);
        } else if (dayEx != null && map.has(dayEx)) map.get(dayEx).e1 = i;
      }
      const list = pickShown([...map.values()], inp);
      const lastB = list[list.length - 1];
      list.forEach((b) => {
        const a1 = ctx.abs0 + b.i0 - 0.5; const a2 = ctx.abs0 + b.e1 + 0.5;
        const showLab = inp.labels;
        shapes.rects.push({ a1, a2: ctx.abs0 + b.i1 + 0.5, p1: b.h, p2: b.l, fill: withA(inp.color, inp.alpha), stroke: inp.color, label: showLab ? inp.name : '', labelColor: inp.color, labelPos: 'tl', labelSize: inp.labelSize, labelBg: inp.labelBg });
        shapes.segs.push({ a1, a2, p: b.h, color: inp.color, width: inp.width, dash: inp.style, label: showLab ? labelText(ctx, inp, `${inp.name} H`, b.h) : '', ...labelStyle(inp), axis: inp.axis && b === lastB });
        shapes.segs.push({ a1, a2, p: b.l, color: inp.color, width: inp.width, dash: inp.style, label: showLab ? labelText(ctx, inp, `${inp.name} L`, b.l) : '', ...labelStyle(inp), axis: inp.axis && b === lastB });
        if (inp.mid) shapes.segs.push({ a1, a2, p: (b.h + b.l) / 2, color: inp.color, width: 1, dash: 'dotted' });
      });
      return { shapes };
    },
  },
  fvg: {
    cat: 'ict', uk: 'FVG (імбаланс)', en: 'Fair value gaps',
    dUk: 'Розриви між 1-ю і 3-ю свічкою; тягнуться, доки ціна їх не закриє.', dEn: 'Gaps between candle 1 and 3, extended until price fills them.',
    fields: [
      f.bool('bull', 'Бичачі', 'Bullish', true),
      f.bool('bear', 'Ведмежі', 'Bearish', true),
      f.sel('show', 'Показувати', 'Show', 'active', () => [['active', tx('Тільки незакриті', 'Unfilled only')], ['last', tx('Останні N (і закриті)', 'Last N (incl. filled)')], ['all', tx('Усі', 'All')]]),
      f.num('count', '  Скільки', '  How many', 20, 1, 500, 1, 'in', (i) => i.show !== 'all'),
      f.sel('fill', 'Вважати закритим', 'Filled when', 'full', () => [['touch', tx('Торкнулась', 'Touched')], ['mid', tx('Дійшла до середини', 'Reached 50%')], ['full', tx('Закрила повністю', 'Fully filled')]]),
      f.num('minAtr', 'Мін. розмір, % ATR', 'Min size, % of ATR', 0, 0, 300, 5),
      f.num('bars', 'Довжина відкритих, свічок (0 — до краю)', 'Open gap length, bars (0 = to edge)', 0, 0, 500, 1, 'st'),
      f.bool('mid', 'Середина (CE)', 'Midline (CE)', false, 'st'),
      f.color('cBull', 'Бичачий', 'Bullish', '#089981'),
      f.color('cBear', 'Ведмежий', 'Bearish', '#f23645'),
      f.num('alpha', 'Прозорість заливки', 'Fill opacity', 0.18, 0, 1, 0.02, 'st'),
      f.bool('border', 'Рамка', 'Border', false, 'st'),
      f.text('nBull', 'Текст бичачого', 'Bullish text', 'FVG+', 'lb'),
      f.text('nBear', 'Текст ведмежого', 'Bearish text', 'FVG−', 'lb'),
      f.bool('labels', 'Підписи', 'Labels', false, 'lb'),
      f.bool('labelPrice', '  Розмір гепу в підписі', '  Gap size in label', false, 'lb', (i) => i.labels),
      f.num('labelSize', '  Розмір шрифту', '  Font size', 10, 8, 20, 1, 'lb', (i) => i.labels),
    ],
    compute: (ctx, inp) => {
      const shapes = { rects: [], segs: [] };
      const { H, L, n } = ctx;
      const atr = rma(trueRange(ctx), 14);
      const gaps = [];
      for (let i = 2; i < n; i += 1) {
        const min = (inp.minAtr / 100) * (atr[i] || 0);
        if (inp.bull && L[i] > H[i - 2] && L[i] - H[i - 2] >= min) gaps.push({ bull: true, top: L[i], bot: H[i - 2], i0: i - 1, born: i, end: null });
        if (inp.bear && H[i] < L[i - 2] && L[i - 2] - H[i] >= min) gaps.push({ bull: false, top: L[i - 2], bot: H[i], i0: i - 1, born: i, end: null });
      }
      /* Закриття — лише свічками ПІСЛЯ утворення. */
      gaps.forEach((g) => {
        const lvl = inp.fill === 'touch' ? (g.bull ? g.top : g.bot) : inp.fill === 'mid' ? (g.top + g.bot) / 2 : (g.bull ? g.bot : g.top);
        for (let j = g.born + 1; j < n; j += 1) if (g.bull ? L[j] <= lvl : H[j] >= lvl) { g.end = j; break; }
      });
      let show = inp.show === 'active' ? gaps.filter((g) => g.end == null) : gaps;
      if (inp.show !== 'all') show = show.slice(-Math.max(1, inp.count));
      show.forEach((g) => {
        const c = g.bull ? inp.cBull : inp.cBear;
        const open = g.end == null;
        const a1 = ctx.abs0 + g.i0 - 0.5;
        const a2 = open ? (inp.bars > 0 ? ctx.abs0 + g.i0 + inp.bars : 'R') : ctx.abs0 + g.end + 0.5;
        const name = g.bull ? inp.nBull : inp.nBear;
        shapes.rects.push({
          a1, a2, p1: g.top, p2: g.bot, fill: withA(c, open ? inp.alpha : inp.alpha * 0.45), stroke: inp.border ? withA(c, 0.8) : '',
          label: inp.labels ? `${name}${inp.labelPrice ? ` ${ctx.fmt(g.top - g.bot)}` : ''}` : '', labelColor: c, labelPos: 'inside', labelSize: inp.labelSize,
        });
        if (inp.mid) shapes.segs.push({ a1, a2, p: (g.top + g.bot) / 2, color: c, width: 1, dash: 'dotted' });
      });
      return { shapes };
    },
  },
  liquidity: {
    cat: 'ict', uk: 'Ліквідність (свінги)', en: 'Liquidity (swings)',
    dUk: 'Незняті свінг-хаї та лоу (BSL/SSL); зняті — пунктиром до моменту зняття.', dEn: 'Untaken swing highs/lows (BSL/SSL); swept ones dashed up to the sweep.',
    fields: [
      f.num('len', 'Довжина півота', 'Pivot length', 5, 1, 50, 1),
      f.bool('hi', 'Зверху (BSL)', 'Above (BSL)', true),
      f.bool('lo', 'Знизу (SSL)', 'Below (SSL)', true),
      f.sel('show', 'Показувати', 'Show', 'active', () => [['active', tx('Тільки незняті', 'Untaken only')], ['last', tx('Останні N (і зняті)', 'Last N (incl. swept)')]]),
      f.num('count', '  Скільки з кожного боку', '  How many per side', 10, 1, 200, 1),
      f.color('cHi', 'BSL', 'BSL', '#089981'),
      f.color('cLo', 'SSL', 'SSL', '#f23645'),
      ...lineStyleFields(1, 'solid'),
      f.bool('dots', 'Точка на свінгу', 'Dot at the swing', false, 'st'),
      f.text('nHi', 'Текст зверху', 'Text above', 'BSL', 'lb'),
      f.text('nLo', 'Текст знизу', 'Text below', 'SSL', 'lb'),
      ...labelFields(true, false),
    ],
    compute: (ctx, inp) => {
      const shapes = { segs: [], dots: [] };
      const { hi, lo } = pivots(ctx, inp.len);
      const mk = (list, isHi) => {
        const out = [];
        list.forEach((k) => {
          const p = isHi ? ctx.H[k] : ctx.L[k];
          let end = null;
          for (let j = k + 1; j < ctx.n; j += 1) if (isHi ? ctx.H[j] > p : ctx.L[j] < p) { end = j; break; }
          if (end != null && inp.show === 'active') return;
          out.push({ k, p, end });
        });
        out.slice(-inp.count).forEach((o) => {
          const color = isHi ? inp.cHi : inp.cLo;
          shapes.segs.push({
            a1: ctx.abs0 + o.k, a2: o.end == null ? 'R' : ctx.abs0 + o.end, p: o.p,
            color, width: inp.width, dash: o.end == null ? inp.style : 'dashed', faded: o.end != null,
            label: inp.labels && o.end == null ? labelText(ctx, inp, isHi ? inp.nHi : inp.nLo, o.p) : '', ...labelStyle(inp),
            axis: inp.axis && o.end == null,
          });
          if (inp.dots) shapes.dots.push({ a: ctx.abs0 + o.k, p: o.p, color });
        });
      };
      if (inp.hi) mk(hi, true);
      if (inp.lo) mk(lo, false);
      return { shapes };
    },
  },
  structure: {
    cat: 'ict', uk: 'Структура (BOS / CHoCH)', en: 'Market structure (BOS / CHoCH)',
    dUk: 'Пробій свінгу: BOS — за трендом, CHoCH — зміна характеру.', dEn: 'Swing breaks: BOS with the trend, CHoCH on a change of character.',
    fields: [
      f.num('len', 'Довжина півота', 'Pivot length', 3, 1, 30, 1),
      f.sel('src', 'Пробій', 'Break by', 'close', () => [['close', tx('Закриттям', 'Close')], ['wick', tx('Тінню', 'Wick')]]),
      f.bool('bos', 'BOS', 'BOS', true),
      f.bool('choch', 'CHoCH', 'CHoCH', true),
      f.bool('bull', 'Бичачі', 'Bullish', true),
      f.bool('bear', 'Ведмежі', 'Bearish', true),
      ...showFields('last', 20),
      f.color('cBull', 'Бичачий', 'Bullish', '#089981'),
      f.color('cBear', 'Ведмежий', 'Bearish', '#f23645'),
      f.sel('styleBos', 'Стиль BOS', 'BOS style', 'dashed', LS, 'st'),
      f.sel('styleChoch', 'Стиль CHoCH', 'CHoCH style', 'solid', LS, 'st'),
      f.num('width', 'Товщина', 'Width', 1, 1, 4, 1, 'st'),
      f.text('nBos', 'Текст BOS', 'BOS text', 'BOS', 'lb'),
      f.text('nChoch', 'Текст CHoCH', 'CHoCH text', 'CHoCH', 'lb'),
      f.bool('labels', 'Підписи', 'Labels', true, 'lb'),
      f.num('labelSize', '  Розмір шрифту', '  Font size', 11, 8, 20, 1, 'lb', (i) => i.labels),
      f.bool('labelBg', '  Плашка під текстом', '  Label background', false, 'lb', (i) => i.labels),
    ],
    compute: (ctx, inp) => {
      const shapes = { segs: [] };
      const L = inp.len;
      const { hi, lo } = pivots(ctx, L);
      /* Півот стає відомим лише через L свічок після нього. */
      const hiAt = new Map(hi.map((k) => [k + L, k]));
      const loAt = new Map(lo.map((k) => [k + L, k]));
      let lastH = null; let lastL = null; let trend = 0;
      const ev = [];
      for (let j = 0; j < ctx.n; j += 1) {
        if (hiAt.has(j)) { const k = hiAt.get(j); lastH = { k, p: ctx.H[k], broken: false }; }
        if (loAt.has(j)) { const k = loAt.get(j); lastL = { k, p: ctx.L[k], broken: false }; }
        const up = inp.src === 'wick' ? ctx.H[j] : ctx.C[j];
        const dn = inp.src === 'wick' ? ctx.L[j] : ctx.C[j];
        if (lastH && !lastH.broken && j > lastH.k && up > lastH.p) {
          const type = trend === -1 ? 'CHoCH' : 'BOS';
          trend = 1; lastH.broken = true;
          ev.push({ a1: lastH.k, a2: j, p: lastH.p, bull: true, type });
        }
        if (lastL && !lastL.broken && j > lastL.k && dn < lastL.p) {
          const type = trend === 1 ? 'CHoCH' : 'BOS';
          trend = -1; lastL.broken = true;
          ev.push({ a1: lastL.k, a2: j, p: lastL.p, bull: false, type });
        }
      }
      const kept = ev.filter((e) => (e.type === 'BOS' ? inp.bos : inp.choch) && (e.bull ? inp.bull : inp.bear));
      pickShown(kept, inp).forEach((e) => shapes.segs.push({
        a1: ctx.abs0 + e.a1, a2: ctx.abs0 + e.a2, p: e.p, color: e.bull ? inp.cBull : inp.cBear, width: inp.width,
        dash: e.type === 'CHoCH' ? inp.styleChoch : inp.styleBos,
        label: inp.labels ? (e.type === 'CHoCH' ? inp.nChoch : inp.nBos) : '', labelPos: e.bull ? 'mid' : 'midBelow', labelSize: inp.labelSize, labelBg: inp.labelBg,
      }));
      return { shapes };
    },
  },
  separators: {
    cat: 'levels', uk: 'Розділювачі періодів', en: 'Period separators',
    dUk: 'Вертикальні лінії на початку дня й тижня, з назвами днів.', dEn: 'Vertical lines at the start of each day and week, with day names.',
    fields: [
      f.bool('day', 'Дні', 'Days', true),
      f.bool('week', 'Тижні', 'Weeks', true),
      ...showFields('all', 10),
      f.color('cDay', 'День', 'Day', 'rgba(120,123,134,0.35)'),
      f.color('cWeek', 'Тиждень', 'Week', 'rgba(41,98,255,0.55)'),
      f.sel('style', 'Стиль лінії', 'Line style', 'dashed', LS, 'st'),
      f.bool('labels', 'Назви днів угорі', 'Day names on top', false, 'lb'),
      f.num('labelSize', '  Розмір шрифту', '  Font size', 11, 8, 20, 1, 'lb', (i) => i.labels),
    ],
    compute: (ctx, inp) => {
      const shapes = { vlines: [] };
      const WD = [tx('Нд', 'Sun'), tx('Пн', 'Mon'), tx('Вт', 'Tue'), tx('Ср', 'Wed'), tx('Чт', 'Thu'), tx('Пт', 'Fri'), tx('Сб', 'Sat')];
      const list = [];
      let prevDay = null; let prevWeek = null;
      for (let i = 0; i < ctx.n; i += 1) {
        const d = Math.floor(ctx.T[i] / 86400);
        const w = periodKey(ctx.T[i], 'week');
        const day = new Date(d * 86400000);
        const text = `${WD[day.getUTCDay()]} ${String(day.getUTCDate()).padStart(2, '0')}`;
        if (prevWeek != null && w !== prevWeek && inp.week && ctx.sec < 604800) list.push({ a: ctx.abs0 + i - 0.5, color: inp.cWeek, width: 1, dash: 'solid', label: inp.labels ? text : '', labelSize: inp.labelSize });
        else if (prevDay != null && d !== prevDay && inp.day && ctx.sec < 86400) list.push({ a: ctx.abs0 + i - 0.5, color: inp.cDay, width: 1, dash: inp.style, label: inp.labels ? text : '', labelSize: inp.labelSize });
        prevDay = d; prevWeek = w;
      }
      shapes.vlines = pickShown(list, inp);
      return { shapes };
    },
  },
  round: {
    cat: 'levels', uk: 'Круглі рівні', en: 'Round numbers',
    dUk: 'Психологічні рівні з однаковим кроком (00, 50…).', dEn: 'Psychological levels at a fixed step (00, 50…).',
    fields: [
      f.num('step', 'Крок (0 — авто)', 'Step (0 = auto)', 0, 0, 100000, 0.0001),
      f.color('color', 'Колір', 'Color', 'rgba(255,152,0,0.45)'),
      f.sel('style', 'Стиль лінії', 'Line style', 'dotted', LS, 'st'),
      f.bool('labels', 'Ціна над лінією', 'Price above the line', false, 'lb'),
      f.num('labelSize', '  Розмір шрифту', '  Font size', 10, 8, 20, 1, 'lb', (i) => i.labels),
    ],
    compute: (ctx, inp) => ({ shapes: { round: { step: inp.step, color: inp.color, dash: inp.style, labels: inp.labels, labelSize: inp.labelSize } } }),
  },
  ma: {
    cat: 'trend', uk: 'Ковзні середні (EMA / SMA)', en: 'Moving averages',
    dUk: 'До трьох ліній: EMA, SMA, WMA з будь-якою довжиною.', dEn: 'Up to three lines: EMA, SMA, WMA of any length.',
    fields: [1, 2, 3].flatMap((i) => [
      f.bool(`on${i}`, `Лінія ${i}`, `Line ${i}`, i < 3),
      f.sel(`type${i}`, '  Тип', '  Type', i === 3 ? 'SMA' : 'EMA', () => [['EMA', 'EMA'], ['SMA', 'SMA'], ['WMA', 'WMA'], ['RMA', 'RMA']], 'in', (inp) => inp[`on${i}`]),
      f.num(`len${i}`, '  Довжина', '  Length', [20, 50, 200][i - 1], 1, 1000, 1, 'in', (inp) => inp[`on${i}`]),
      f.sel(`src${i}`, '  Джерело', '  Source', 'close', () => [['close', 'Close'], ['open', 'Open'], ['hl2', '(H+L)/2'], ['hlc3', '(H+L+C)/3']], 'in', (inp) => inp[`on${i}`]),
      f.color(`color${i}`, `Лінія ${i}`, `Line ${i}`, ['#2962ff', '#ff9800', '#e91e63'][i - 1]),
    ]).concat([
      f.num('width', 'Товщина', 'Width', 1, 1, 4, 1, 'st'),
      f.bool('axis', 'Значення на шкалі цін', 'Value on price scale', false, 'lb'),
      f.bool('title', '  Назва біля значення', '  Name next to value', false, 'lb', (i) => i.axis),
    ]),
    compute: (ctx, inp) => {
      const series = [];
      const SRC = { close: ctx.C, open: ctx.O, hl2: ctx.H.map((h, i) => (h + ctx.L[i]) / 2), hlc3: ctx.H.map((h, i) => (h + ctx.L[i] + ctx.C[i]) / 3) };
      [1, 2, 3].forEach((i) => {
        if (!inp[`on${i}`]) return;
        const fn = MA[inp[`type${i}`]] || ema;
        series.push(line(ctx, fn(SRC[inp[`src${i}`]] || ctx.C, Math.max(1, Math.round(inp[`len${i}`]))), {
          key: `l${i}`, color: inp[`color${i}`], width: inp.width, axis: inp.axis, title: inp.title ? `${inp[`type${i}`]} ${inp[`len${i}`]}` : '',
        }));
      });
      return { series };
    },
  },
  vwap: {
    cat: 'trend', uk: 'VWAP', en: 'VWAP',
    dUk: 'Середня ціна, зважена за обсягом, з перезапуском щодня, щотижня чи щомісяця.', dEn: 'Volume-weighted average price, anchored daily, weekly or monthly.',
    fields: [
      f.sel('anchor', 'Перезапуск', 'Anchor', 'day', () => [['day', tx('День', 'Day')], ['week', tx('Тиждень', 'Week')], ['month', tx('Місяць', 'Month')]]),
      f.bool('bands', 'Смуги ±σ', '±σ bands', false),
      f.num('m1', '  Множник 1', '  Multiplier 1', 1, 0.1, 5, 0.1, 'in', (i) => i.bands),
      f.num('m2', '  Множник 2 (0 — немає)', '  Multiplier 2 (0 = off)', 2, 0, 5, 0.1, 'in', (i) => i.bands),
      f.color('color', 'VWAP', 'VWAP', '#2962ff'),
      f.color('cBand', 'Смуги', 'Bands', '#089981'),
      f.num('width', 'Товщина', 'Width', 1, 1, 4, 1, 'st'),
      f.bool('axis', 'Значення на шкалі цін', 'Value on price scale', true, 'lb'),
      f.bool('title', '  Назва «VWAP» біля значення', '  “VWAP” next to value', true, 'lb', (i) => i.axis),
    ],
    compute: (ctx, inp) => {
      const { n, H, L, C, V, T } = ctx;
      const vw = new Float64Array(n); const sd = new Float64Array(n);
      let pv = 0; let vv = 0; let pv2 = 0; let key = null;
      const breaks = new Set();
      for (let i = 0; i < n; i += 1) {
        const k = periodKey(T[i], inp.anchor);
        if (k !== key) { key = k; pv = 0; vv = 0; pv2 = 0; if (i) breaks.add(i); }
        const tp = (H[i] + L[i] + C[i]) / 3;
        const v = V ? V[i] || 1 : 1;
        pv += tp * v; vv += v; pv2 += tp * tp * v;
        vw[i] = pv / vv;
        sd[i] = Math.sqrt(Math.max(0, pv2 / vv - vw[i] * vw[i]));
      }
      /* Розрив лінії на перезапуску: точку початку нового періоду
         фарбуємо прозорим — інакше бібліотека зʼєднала б кінець
         вчорашнього VWAP із початком сьогоднішнього. */
      const mk = (arr, key2, color, width, dash, extra = {}) => {
        const data = [];
        for (let i = 0; i < n; i += 1) data.push(breaks.has(i) ? { time: T[i], value: arr[i], color: 'rgba(0,0,0,0)' } : { time: T[i], value: arr[i] });
        return { kind: 'line', data, key: key2, color, width, dash, ...extra };
      };
      const series = [mk(vw, 'vwap', inp.color, inp.width, 'solid', { axis: inp.axis, title: inp.title ? 'VWAP' : '' })];
      if (inp.bands) {
        [inp.m1, inp.m2].forEach((m, idx) => {
          if (!(m > 0)) return;
          series.push(mk(vw.map((x, i) => x + m * sd[i]), `u${idx}`, inp.cBand, 1, idx ? 'dashed' : 'solid'));
          series.push(mk(vw.map((x, i) => x - m * sd[i]), `d${idx}`, inp.cBand, 1, idx ? 'dashed' : 'solid'));
        });
      }
      return { series, note: V ? '' : 'novol' };
    },
  },
  bb: {
    cat: 'trend', uk: 'Bollinger Bands', en: 'Bollinger Bands',
    dUk: 'SMA і смуги на N стандартних відхилень.', dEn: 'SMA with bands N standard deviations away.',
    fields: [
      f.num('len', 'Довжина', 'Length', 20, 2, 500, 1),
      f.num('mult', 'Множник', 'Multiplier', 2, 0.1, 10, 0.1),
      f.bool('basis', 'Середня лінія', 'Basis line', true, 'st'),
      f.color('cBasis', 'Середня', 'Basis', '#ff9800'),
      f.color('cBand', 'Смуги', 'Bands', '#2962ff'),
      f.bool('fillOn', 'Заливка', 'Fill', true, 'st'),
      f.color('fill', 'Заливка', 'Fill', 'rgba(41,98,255,0.06)'),
      f.bool('axis', 'Значення на шкалі цін', 'Values on price scale', false, 'lb'),
    ],
    compute: (ctx, inp) => {
      const basis = sma(ctx.C, inp.len);
      const dev = stdev(ctx.C, inp.len, basis);
      const up = basis.map((b, i) => b + inp.mult * dev[i]);
      const dn = basis.map((b, i) => b - inp.mult * dev[i]);
      const series = [
        line(ctx, up, { key: 'u', color: inp.cBand, width: 1, axis: inp.axis }),
        line(ctx, dn, { key: 'd', color: inp.cBand, width: 1, axis: inp.axis }),
      ];
      if (inp.basis) series.unshift(line(ctx, basis, { key: 'b', color: inp.cBasis, width: 1, axis: inp.axis }));
      return { series, shapes: inp.fillOn ? { band: { abs0: ctx.abs0, up, dn, fill: inp.fill } } : null };
    },
  },
  volume: {
    cat: 'osc', uk: 'Обсяг (тіковий)', en: 'Volume (tick)',
    dUk: 'Тіковий обсяг з MT5 знизу графіка.', dEn: 'MT5 tick volume at the bottom of the chart.',
    fields: [
      f.color('up', 'Зростання', 'Up', 'rgba(8,153,129,0.5)'),
      f.color('down', 'Падіння', 'Down', 'rgba(242,54,69,0.5)'),
      f.num('height', 'Висота, % графіка', 'Height, % of chart', 20, 5, 60, 1, 'st'),
    ],
    compute: (ctx, inp) => {
      if (!ctx.V) return { series: [], note: 'novol' };
      const data = [];
      for (let i = 0; i < ctx.n; i += 1) data.push({ time: ctx.T[i], value: ctx.V[i], color: ctx.C[i] >= ctx.O[i] ? inp.up : inp.down });
      return { series: [{ kind: 'hist', key: 'v', data, overlay: true, height: inp.height }] };
    },
  },
  rsi: {
    cat: 'osc', pane: true, uk: 'RSI', en: 'RSI',
    dUk: 'Індекс відносної сили з рівнями 70 / 30.', dEn: 'Relative strength index with 70 / 30 levels.',
    fields: [
      f.num('len', 'Довжина', 'Length', 14, 2, 200, 1),
      f.num('ob', 'Перекупленість', 'Overbought', 70, 50, 100, 1),
      f.num('os', 'Перепроданість', 'Oversold', 30, 0, 50, 1),
      f.bool('midLine', 'Лінія 50', 'Line 50', true),
      f.color('color', 'RSI', 'RSI', '#7e57c2'),
      f.num('width', 'Товщина', 'Width', 1, 1, 4, 1, 'st'),
    ],
    compute: (ctx, inp) => {
      const { C, n } = ctx;
      const g = new Float64Array(n); const l = new Float64Array(n);
      for (let i = 1; i < n; i += 1) { const d = C[i] - C[i - 1]; g[i] = Math.max(0, d); l[i] = Math.max(0, -d); }
      const ag = rma(g, inp.len); const al = rma(l, inp.len);
      const rsi = ag.map((x, i) => (al[i] === 0 ? 100 : 100 - 100 / (1 + x / al[i])));
      return { series: [line(ctx, rsi, { key: 'r', color: inp.color, width: inp.width, levels: [inp.ob, ...(inp.midLine ? [50] : []), inp.os], precision: 2, axis: true })] };
    },
  },
  atr: {
    cat: 'osc', pane: true, uk: 'ATR', en: 'ATR',
    dUk: 'Середній істинний діапазон — скільки ціна ходить за свічку.', dEn: 'Average true range — how far price moves per candle.',
    fields: [
      f.num('len', 'Довжина', 'Length', 14, 1, 500, 1),
      f.color('color', 'ATR', 'ATR', '#f23645'),
      f.num('width', 'Товщина', 'Width', 1, 1, 4, 1, 'st'),
    ],
    compute: (ctx, inp) => ({ series: [line(ctx, rma(trueRange(ctx), inp.len), { key: 'a', color: inp.color, width: inp.width, axis: true })] }),
  },
  macd: {
    cat: 'osc', pane: true, uk: 'MACD', en: 'MACD',
    dUk: 'Різниця двох EMA, сигнальна лінія й гістограма.', dEn: 'Difference of two EMAs with signal line and histogram.',
    fields: [
      f.num('fast', 'Швидка', 'Fast', 12, 1, 200, 1),
      f.num('slow', 'Повільна', 'Slow', 26, 1, 400, 1),
      f.num('sig', 'Сигнальна', 'Signal', 9, 1, 200, 1),
      f.bool('hist', 'Гістограма', 'Histogram', true),
      f.color('cMacd', 'MACD', 'MACD', '#2962ff'),
      f.color('cSig', 'Сигнал', 'Signal', '#ff6d00'),
      f.color('up', 'Гістограма +', 'Histogram +', 'rgba(8,153,129,0.6)'),
      f.color('down', 'Гістограма −', 'Histogram −', 'rgba(242,54,69,0.6)'),
    ],
    compute: (ctx, inp) => {
      const a = ema(ctx.C, inp.fast); const b = ema(ctx.C, inp.slow);
      const m = a.map((x, i) => x - b[i]);
      const firstOk = m.findIndex((x) => Number.isFinite(x));
      const sig = new Float64Array(ctx.n).fill(NaN);
      if (firstOk >= 0) { const s = ema(m.slice(firstOk), inp.sig); sig.set(s, firstOk); }
      const series = [
        line(ctx, m, { key: 'm', color: inp.cMacd, width: 1, axis: true }),
        line(ctx, sig, { key: 's', color: inp.cSig, width: 1, axis: true }),
      ];
      if (inp.hist) {
        const hist = [];
        for (let i = 0; i < ctx.n; i += 1) {
          const h = m[i] - sig[i];
          hist.push(Number.isFinite(h) ? { time: ctx.T[i], value: h, color: h >= 0 ? inp.up : inp.down } : { time: ctx.T[i] });
        }
        series.unshift({ kind: 'hist', key: 'h', data: hist });
      }
      return { series };
    },
  },
};

export const indName = (id) => (INDICATORS[id] ? tx(INDICATORS[id].uk, INDICATORS[id].en) : id);
export const indDesc = (id) => (INDICATORS[id] ? tx(INDICATORS[id].dUk, INDICATORS[id].dEn) : '');

export function defaultInputs(id) {
  const o = {};
  (INDICATORS[id]?.fields || []).forEach((fl) => { o[fl.key] = fl.def; });
  return o;
}

export const inputsOf = (cfg) => ({ ...defaultInputs(cfg.id), ...(cfg.inputs || {}) });

/* Короткі параметри для легенди зліва вгорі — як «EMA 20 close» у TV. */
const tzShort = (tz) => (!tz || tz === 'UTC' ? 'UTC' : String(tz).split('/').pop().replace(/_/g, ' '));
export function indBrief(id, inp) {
  switch (id) {
    case 'sessions': case 'killzones': case 'orb': return tzShort(inp.tz);
    case 'ma': return [1, 2, 3].filter((i) => inp[`on${i}`]).map((i) => `${inp[`type${i}`]} ${inp[`len${i}`]}`).join('  ');
    case 'bb': return `${inp.len} ${inp.mult}`;
    case 'rsi': case 'atr': case 'liquidity': case 'structure': return String(inp.len);
    case 'macd': return `${inp.fast} ${inp.slow} ${inp.sig}`;
    case 'vwap': return ({ day: tx('День', 'Session'), week: tx('Тиждень', 'Week'), month: tx('Місяць', 'Month') })[inp.anchor] || '';
    default: return '';
  }
}

/* Швидкі набори — щоб не шукати по одному. */
export const PRESETS = [
  { id: 'ict', uk: 'ICT', en: 'ICT', items: ['killzones', 'pdhl', 'fvg', 'liquidity', 'structure'] },
  { id: 'levels', uk: 'Рівні дня', en: 'Day levels', items: ['sessions', 'pdhl', 'opens', 'separators'] },
  { id: 'classic', uk: 'Класика', en: 'Classic', items: ['ma', 'vwap', 'rsi'] },
];

/* Двигун графіка живе в ref сторінки: гаряча заміна модуля лишила б
   старий екземпляр зі старим кодом. Тому при зміні — повне оновлення. */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

import { t as tx } from '../lang';

/* ==================================================================
   Інструменти малювання — набір і поведінка з лівої панелі
   TradingView. Тут лише опис: що це за інструмент, скільки точок
   ставити, які налаштування за замовчуванням. Малювання й мишка —
   у DrawingManager.

   Точка малюнка — {t, p}: час у секундах (час брокера, як у свічок)
   і ціна. Не індекс свічки: тоді лінія стоїть на тому самому місці
   на будь-якому таймфреймі.
================================================================== */

export const BLUE = '#2962ff';

/* Рівні Фібоначчі й кольори — як у TV за замовчуванням. */
export const FIB_LEVELS = [
  { v: 0, c: '#787b86', on: true },
  { v: 0.236, c: '#f23645', on: true },
  { v: 0.382, c: '#ff9800', on: true },
  { v: 0.5, c: '#4caf50', on: true },
  { v: 0.618, c: '#089981', on: true },
  { v: 0.786, c: '#00bcd4', on: true },
  { v: 1, c: '#787b86', on: true },
  { v: 1.618, c: '#2962ff', on: true },
  { v: 2.618, c: '#f23645', on: true },
  { v: 3.618, c: '#9c27b0', on: true },
  { v: 4.236, c: '#e91e63', on: true },
];

const line = (over = {}) => ({ color: BLUE, width: 2, lineStyle: 'solid', extendLeft: false, extendRight: false, showPrice: false, ...over });

/* points: скільки кліків ставить фігуру (0 — тягнути мишкою, -1 —
   скільки завгодно, подвійний клік завершує). */
export const TOOLS = {
  /* Лінії */
  trend: { uk: 'Трендова лінія', en: 'Trend line', points: 2, hot: 'Alt+T', style: line() },
  ray: { uk: 'Промінь', en: 'Ray', points: 2, style: line({ extendRight: true }) },
  info: { uk: 'Інфо-лінія', en: 'Info line', points: 2, style: line({ showInfo: true }) },
  extended: { uk: 'Розширена лінія', en: 'Extended line', points: 2, style: line({ extendLeft: true, extendRight: true }) },
  angle: { uk: 'Трендовий кут', en: 'Trend angle', points: 2, style: line({ showAngle: true }) },
  hline: { uk: 'Горизонтальна лінія', en: 'Horizontal line', points: 1, hot: 'Alt+H', style: line({ width: 1, showPrice: true }) },
  hray: { uk: 'Горизонтальний промінь', en: 'Horizontal ray', points: 1, hot: 'Alt+J', style: line({ width: 1, showPrice: true }) },
  vline: { uk: 'Вертикальна лінія', en: 'Vertical line', points: 1, hot: 'Alt+V', style: line({ width: 1, showTime: true }) },
  cross: { uk: 'Перехрестя', en: 'Cross line', points: 1, hot: 'Alt+C', style: line({ width: 1, showPrice: true, showTime: true }) },
  channel: { uk: 'Паралельний канал', en: 'Parallel channel', points: 3, style: line({ fill: 'rgba(41,98,255,0.2)', showMiddle: true }) },
  regression: { uk: 'Регресійний тренд', en: 'Regression trend', points: 2, style: line({ width: 1, fill: 'rgba(41,98,255,0.1)', dev: 2 }) },
  flat: { uk: 'Плоский верх/низ', en: 'Flat top/bottom', points: 3, style: line({ color: '#ff9800', fill: 'rgba(255,152,0,0.2)' }) },
  disjoint: { uk: 'Роз\u02bcєднаний канал', en: 'Disjoint channel', points: 4, style: line({ color: '#089981', fill: 'rgba(8,153,129,0.2)' }) },
  pitchfork: { uk: 'Вила Ендрюса', en: 'Pitchfork', points: 3, style: line({ width: 1, fill: 'rgba(41,98,255,0.12)' }) },
  schiff: { uk: 'Вила Шиффа', en: 'Schiff pitchfork', points: 3, style: line({ width: 1, color: '#ff9800', fill: 'rgba(255,152,0,0.12)' }) },
  modschiff: { uk: 'Модифіковані вила Шиффа', en: 'Modified Schiff pitchfork', points: 3, style: line({ width: 1, color: '#089981', fill: 'rgba(8,153,129,0.12)' }) },
  inside: { uk: 'Внутрішні вила', en: 'Inside pitchfork', points: 3, style: line({ width: 1, color: '#9c27b0', fill: 'rgba(156,39,176,0.12)' }) },

  /* Фібоначчі */
  fib: {
    uk: 'Корекція Фібоначчі', en: 'Fib retracement', points: 2, hot: 'Alt+F',
    style: { color: '#787b86', width: 1, lineStyle: 'solid', extendLeft: false, extendRight: false, levels: FIB_LEVELS, fillLevels: true, fillAlpha: 0.2, showLevels: true, showPrices: true, reverse: false },
  },
  fibext: {
    uk: 'Розширення Фібоначчі за трендом', en: 'Trend-based fib extension', points: 3,
    style: { color: '#787b86', width: 1, lineStyle: 'solid', extendLeft: false, extendRight: false, levels: FIB_LEVELS, fillLevels: true, fillAlpha: 0.2, showLevels: true, showPrices: true, reverse: false },
  },

  fibchannel: { uk: 'Канал Фібоначчі', en: 'Fib channel', points: 3, style: { color: '#787b86', width: 1, lineStyle: 'solid', extendLeft: false, extendRight: false, levels: FIB_LEVELS, fillLevels: true, fillAlpha: 0.12, showLevels: true, showPrices: false, reverse: false } },
  fibtime: { uk: 'Часові зони Фібоначчі', en: 'Fib time zone', points: 2, style: { color: '#787b86', width: 1, lineStyle: 'solid' } },
  fibcircles: { uk: 'Кола Фібоначчі', en: 'Fib circles', points: 2, style: { color: '#787b86', width: 1, lineStyle: 'solid', extendLeft: false, extendRight: false, levels: FIB_LEVELS, fillLevels: true, fillAlpha: 0.12, showLevels: true, showPrices: false, reverse: false } },
  fibfan: { uk: 'Віяло швидкості опору', en: 'Fib speed resistance fan', points: 2, style: { color: '#787b86', width: 1, lineStyle: 'solid' } },
  gannbox: { uk: 'Коробка Ганна', en: 'Gann box', points: 2, style: { color: '#787b86', width: 1, lineStyle: 'solid' } },
  gannfan: { uk: 'Віяло Ганна', en: 'Gann fan', points: 2, style: { color: '#787b86', width: 1, lineStyle: 'solid' } },

  /* Прогнози й виміри */
  long: { uk: 'Довга позиція', en: 'Long position', points: 1, style: { tp: 'rgba(8,153,129,0.2)', sl: 'rgba(242,54,69,0.2)', color: '#787b86', width: 1, lineStyle: 'solid', showInfo: true } },
  short: { uk: 'Коротка позиція', en: 'Short position', points: 1, style: { tp: 'rgba(8,153,129,0.2)', sl: 'rgba(242,54,69,0.2)', color: '#787b86', width: 1, lineStyle: 'solid', showInfo: true } },
  prange: { uk: 'Діапазон ціни', en: 'Price range', points: 2, style: { color: BLUE, width: 1, lineStyle: 'solid', fill: 'rgba(41,98,255,0.2)', showInfo: true } },
  drange: { uk: 'Діапазон дат', en: 'Date range', points: 2, style: { color: BLUE, width: 1, lineStyle: 'solid', fill: 'rgba(41,98,255,0.2)', showInfo: true } },
  dprange: { uk: 'Діапазон дат і ціни', en: 'Date and price range', points: 2, style: { color: BLUE, width: 1, lineStyle: 'solid', fill: 'rgba(41,98,255,0.2)', showInfo: true } },

  /* Фігури */
  brush: { uk: 'Пензель', en: 'Brush', points: 0, style: { color: BLUE, width: 2, lineStyle: 'solid' } },
  highlighter: { uk: 'Маркер', en: 'Highlighter', points: 0, style: { color: 'rgba(242,54,69,0.25)', width: 14, lineStyle: 'solid' } },
  rect: { uk: 'Прямокутник', en: 'Rectangle', points: 2, hot: 'Alt+Shift+R', style: { color: '#9c27b0', width: 1, lineStyle: 'solid', fill: 'rgba(156,39,176,0.2)', extendLeft: false, extendRight: false, showMiddle: false } },
  ellipse: { uk: 'Еліпс', en: 'Ellipse', points: 2, style: { color: '#ff9800', width: 1, lineStyle: 'solid', fill: 'rgba(255,152,0,0.2)' } },
  rotrect: { uk: 'Повернутий прямокутник', en: 'Rotated rectangle', points: 3, style: { color: '#9c27b0', width: 1, lineStyle: 'solid', fill: 'rgba(156,39,176,0.2)' } },
  path: { uk: 'Ламана', en: 'Path', points: -1, style: line() },
  circle: { uk: 'Коло', en: 'Circle', points: 2, style: { color: '#089981', width: 1, lineStyle: 'solid', fill: 'rgba(8,153,129,0.2)' } },
  polyline: { uk: 'Полілінія', en: 'Polyline', points: -1, style: { color: '#2962ff', width: 1, lineStyle: 'solid', fill: 'rgba(41,98,255,0.2)' } },
  triangle: { uk: 'Трикутник', en: 'Triangle', points: 3, style: { color: '#f23645', width: 1, lineStyle: 'solid', fill: 'rgba(242,54,69,0.2)' } },
  arc: { uk: 'Дуга', en: 'Arc', points: 3, style: { color: '#e91e63', width: 1, lineStyle: 'solid', fill: 'rgba(233,30,99,0.2)' } },
  curve: { uk: 'Крива', en: 'Curve', points: 2, style: line() },
  dcurve: { uk: 'Подвійна крива', en: 'Double curve', points: 2, style: line() },
  arrowm: { uk: 'Стрілка-маркер', en: 'Arrow marker', points: 2, style: { color: '#2962ff', width: 1, lineStyle: 'solid' } },
  arrow: { uk: 'Стрілка', en: 'Arrow', points: 2, style: line() },

  /* Підписи */
  text: { uk: 'Текст', en: 'Text', points: 1, style: { textColor: BLUE, fontSize: 14, bold: false, italic: false, bg: '', border: '' }, text: true },
  plabel: { uk: 'Ціновий підпис', en: 'Price label', points: 1, style: { color: BLUE, textColor: '#ffffff', fontSize: 12 } },
  note: { uk: 'Виноска', en: 'Callout', points: 2, style: { color: BLUE, textColor: '#ffffff', fontSize: 13, bold: false, italic: false }, text: true },
  pin: { uk: 'Пін', en: 'Pin', points: 1, style: { color: '#f23645', textColor: '#ffffff', fontSize: 13 }, text: true },
  flag: { uk: 'Прапорець', en: 'Flag mark', points: 1, style: { color: '#2962ff' } },
  signpost: { uk: 'Вказівник', en: 'Signpost', points: 1, style: { color: '#2962ff', textColor: '#ffffff', fontSize: 12 }, text: true },
  pricenote: { uk: 'Цінова нотатка', en: 'Price note', points: 2, style: { color: '#2962ff', textColor: '#ffffff', fontSize: 12, width: 1, lineStyle: 'solid' } },
  arrowup: { uk: 'Стрілка вгору', en: 'Arrow mark up', points: 1, style: { color: '#089981' } },
  arrowdown: { uk: 'Стрілка вниз', en: 'Arrow mark down', points: 1, style: { color: '#f23645' } },

  /* Службові (не зберігаються) */
  measure: { uk: 'Лінійка', en: 'Measure', points: 2, temp: true, style: {} },
  zoom: { uk: 'Збільшити ділянку', en: 'Zoom in', points: 2, temp: true, style: {} },
};

export const toolName = (id) => (TOOLS[id] ? tx(TOOLS[id].uk, TOOLS[id].en) : id);

/* Групи лівої панелі. Перший у списку — інструмент групи за
   замовчуванням; далі кнопка групи памʼятає останній вибраний. */
export const GROUPS = [
  { id: 'cursor', items: ['cur-cross', 'cur-dot', 'cur-arrow', 'eraser'] },
  { id: 'lines', items: ['trend', 'ray', 'info', 'extended', 'angle', 'hline', 'hray', 'vline', 'cross', 'channel', 'regression', 'flat', 'disjoint', 'pitchfork', 'schiff', 'modschiff', 'inside'] },
  { id: 'fib', items: ['fib', 'fibext', 'fibchannel', 'fibtime', 'fibcircles', 'fibfan', 'gannbox', 'gannfan'] },
  { id: 'forecast', items: ['long', 'short', 'prange', 'drange', 'dprange'] },
  { id: 'shapes', items: ['brush', 'highlighter', 'rect', 'rotrect', 'circle', 'ellipse', 'triangle', 'path', 'polyline', 'arc', 'curve', 'dcurve', 'arrowm', 'arrow'] },
  { id: 'annot', items: ['text', 'note', 'pricenote', 'plabel', 'pin', 'signpost', 'flag', 'arrowup', 'arrowdown'] },
];

export const CURSORS = {
  'cur-cross': { uk: 'Хрест', en: 'Cross' },
  'cur-dot': { uk: 'Крапка', en: 'Dot' },
  'cur-arrow': { uk: 'Стрілка', en: 'Arrow' },
  eraser: { uk: 'Гумка', en: 'Eraser' },
};

export const itemName = (id) => (CURSORS[id] ? tx(CURSORS[id].uk, CURSORS[id].en) : toolName(id));

/* Які налаштування має кожен тип — від цього залежать вкладки й
   кнопки плаваючої панелі. */
export function caps(type) {
  const s = TOOLS[type]?.style || {};
  return {
    color: 'color' in s,
    width: 'width' in s && type !== 'long' && type !== 'short',
    lineStyle: 'lineStyle' in s && type !== 'long' && type !== 'short',
    fill: 'fill' in s,
    extend: 'extendLeft' in s,
    text: !!TOOLS[type]?.text || type === 'plabel',
    textStyle: 'textColor' in s,
    fib: 'levels' in s,
    position: type === 'long' || type === 'short',
    showPrice: 'showPrice' in s,
  };
}

export function newDrawing(type, pts, defaults = {}) {
  const def = TOOLS[type];
  const style = JSON.parse(JSON.stringify({ ...def.style, ...(defaults[type] || {}) }));
  return {
    id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type, pts, style,
    text: def.text ? '' : undefined,
    locked: false,
    vis: null,
  };
}

/* ---------------- збереження ---------------- */

const key = (uid, symbol) => `edge_chart_draw_${uid || 'anon'}_${symbol}`;

export function loadDrawings(uid, symbol) {
  try {
    const raw = localStorage.getItem(key(uid, symbol));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((d) => d && TOOLS[d.type] && Array.isArray(d.pts)) : [];
  } catch { return []; }
}

export function saveDrawings(uid, symbol, list) {
  try { localStorage.setItem(key(uid, symbol), JSON.stringify(list)); } catch { /* приватний режим або повне сховище */ }
}

const dkey = (uid) => `edge_chart_draw_defaults_${uid || 'anon'}`;
export function loadDefaults(uid) {
  try { return JSON.parse(localStorage.getItem(dkey(uid)) || '{}') || {}; } catch { return {}; }
}
export function saveDefaults(uid, v) {
  try { localStorage.setItem(dkey(uid), JSON.stringify(v)); } catch { /* ок */ }
}

/* ---------------- геометрія ---------------- */

export function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1; const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx; const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/* Продовження відрізка до країв області (для променя й розширеної). */
export function extendSeg(x1, y1, x2, y2, W, left, right) {
  const dx = x2 - x1; const dy = y2 - y1;
  let ax = x1; let ay = y1; let bx = x2; let by = y2;
  if (Math.abs(dx) < 1e-6) {
    if (right) by = dy >= 0 ? 1e5 : -1e5;
    if (left) ay = dy >= 0 ? -1e5 : 1e5;
    return [ax, ay, bx, by];
  }
  const k = dy / dx;
  if (right) { bx = dx >= 0 ? W : 0; by = y1 + k * (bx - x1); }
  if (left) { ax = dx >= 0 ? 0 : W; ay = y1 + k * (ax - x1); }
  return [ax, ay, bx, by];
}

export const DASH = { solid: '', dashed: '6 4', dotted: '1.5 3.5' };

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

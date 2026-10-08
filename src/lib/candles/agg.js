/* ==================================================================
   Таймфрейми з хвилинок і все, що реплею треба рахувати по індексах.

   Зберігаємо тільки найдрібніший таймфрейм файлу (зазвичай M1), а
   M5…D1 збираємо з нього на льоту. Так реплей на H1 знає, що саме
   відбулось усередині години, і стоп/тейк спрацьовують у правильному
   порядку, а не «десь у межах свічки».

   Межі свічок — від півночі часу брокера (як у MT5), тому H4 і D1
   збігаються з терміналом трейдера.
================================================================== */

/* Усі таймфрейми, як у списку TradingView. id старих (M1…D1) не
   міняємо — вони лежать у збережених налаштуваннях. Тиждень і місяці —
   календарні (тиждень з понеділка, місяць з 1-го), а sec для них —
   лише приблизна тривалість для відступів і розрахунків ширини. */
export const TFS = [
  { id: 'M1', sec: 60, label: '1m', group: 'min', uk: '1 хвилина', en: '1 minute' },
  { id: 'M2', sec: 120, label: '2m', group: 'min', uk: '2 хвилини', en: '2 minutes' },
  { id: 'M3', sec: 180, label: '3m', group: 'min', uk: '3 хвилини', en: '3 minutes' },
  { id: 'M5', sec: 300, label: '5m', group: 'min', uk: '5 хвилин', en: '5 minutes' },
  { id: 'M10', sec: 600, label: '10m', group: 'min', uk: '10 хвилин', en: '10 minutes' },
  { id: 'M15', sec: 900, label: '15m', group: 'min', uk: '15 хвилин', en: '15 minutes' },
  { id: 'M30', sec: 1800, label: '30m', group: 'min', uk: '30 хвилин', en: '30 minutes' },
  { id: 'M45', sec: 2700, label: '45m', group: 'min', uk: '45 хвилин', en: '45 minutes' },
  { id: 'H1', sec: 3600, label: '1H', group: 'hour', uk: '1 година', en: '1 hour' },
  { id: 'H2', sec: 7200, label: '2H', group: 'hour', uk: '2 години', en: '2 hours' },
  { id: 'H3', sec: 10800, label: '3H', group: 'hour', uk: '3 години', en: '3 hours' },
  { id: 'H4', sec: 14400, label: '4H', group: 'hour', uk: '4 години', en: '4 hours' },
  { id: 'D1', sec: 86400, label: 'D', group: 'day', uk: '1 день', en: '1 day' },
  { id: 'W1', sec: 604800, label: 'W', group: 'day', cal: 'W', uk: '1 тиждень', en: '1 week' },
  { id: 'MN1', sec: 2629800, label: 'M', group: 'day', cal: 'M', n: 1, uk: '1 місяць', en: '1 month' },
  { id: 'MN3', sec: 7889400, label: '3M', group: 'day', cal: 'M', n: 3, uk: '3 місяці', en: '3 months' },
  { id: 'MN6', sec: 15778800, label: '6M', group: 'day', cal: 'M', n: 6, uk: '6 місяців', en: '6 months' },
  { id: 'MN12', sec: 31557600, label: '12M', group: 'day', cal: 'M', n: 12, uk: '12 місяців', en: '12 months' },
];

/* Обрані за замовчуванням — ті самі, що були кнопками раніше. */
export const DEFAULT_TF_FAV = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

export const tfById = (id) => TFS.find((x) => x.id === id) || TFS[0];

/* Початок календарної свічки: понеділок тижня або 1-ше число
   (кожного n-го) місяця. Рахуємо лише при зміні дня — інакше Date на
   мільйонах хвилинок помітно гальмував би. */
function calBucketFn(tf) {
  let lastDay = null; let lastB = 0;
  return (t) => {
    const day = Math.floor(t / 86400);
    if (day === lastDay) return lastB;
    lastDay = day;
    if (tf.cal === 'W') {
      const dow = (day + 3) % 7; // 01.01.1970 — четвер; понеділок = 0
      lastB = (day - dow) * 86400;
    } else {
      const d = new Date(day * 86400000);
      const m = d.getUTCFullYear() * 12 + d.getUTCMonth();
      const m0 = m - (m % (tf.n || 1));
      lastB = Date.UTC(Math.floor(m0 / 12), m0 % 12, 1) / 1000;
    }
    return lastB;
  };
}

/**
 * Збирає свічки таймфрейму з базових. tf — секунди або запис із TFS
 * (для тижня й місяців потрібен саме запис). s[k] — індекс першої
 * базової свічки k-ї свічки таймфрейму; s[n] = base.n — щоб «кінець»
 * не був окремим випадком.
 */
export function aggregate(base, tf) {
  const tfSec = typeof tf === 'number' ? tf : tf.sec;
  const cal = typeof tf === 'object' && tf.cal ? calBucketFn(tf) : null;
  const N = base.n;
  if (!cal && tfSec <= base.baseSec) {
    const s = new Int32Array(N + 1);
    for (let i = 0; i <= N; i += 1) s[i] = i;
    return { t: base.t, o: base.o, h: base.h, l: base.l, c: base.c, v: base.v, s, n: N, sec: base.baseSec };
  }
  const t = new Int32Array(N); const o = new Float64Array(N); const h = new Float64Array(N);
  const l = new Float64Array(N); const c = new Float64Array(N); const s = new Int32Array(N + 1);
  const bv = base.v; const v = bv ? new Float64Array(N) : null;
  let n = -1;
  let cur = -Infinity;
  for (let i = 0; i < N; i += 1) {
    const b = cal ? cal(base.t[i]) : base.t[i] - (base.t[i] % tfSec);
    if (b !== cur) {
      n += 1; cur = b;
      t[n] = b; o[n] = base.o[i]; h[n] = base.h[i]; l[n] = base.l[i]; c[n] = base.c[i]; s[n] = i;
      if (v) v[n] = bv[i];
    } else {
      if (v) v[n] += bv[i];
      if (base.h[i] > h[n]) h[n] = base.h[i];
      if (base.l[i] < l[n]) l[n] = base.l[i];
      c[n] = base.c[i];
    }
  }
  n += 1;
  s[n] = N;
  return { t: t.slice(0, n), o: o.slice(0, n), h: h.slice(0, n), l: l.slice(0, n), c: c.slice(0, n), v: v ? v.slice(0, n) : null, s: s.slice(0, n + 1), n, sec: tfSec };
}

/* Перший індекс, де arr[i] > v (arr відсортований). */
export function upperBound(arr, v, lo = 0, hi = arr.length) {
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (arr[m] <= v) lo = m + 1; else hi = m;
  }
  return lo;
}

/* Перший індекс, де arr[i] >= v. */
export function lowerBound(arr, v, lo = 0, hi = arr.length) {
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (arr[m] < v) lo = m + 1; else hi = m;
  }
  return lo;
}

/* Свічка таймфрейму, до якої належить базова свічка i. s має n+1
   елементів, тому шукаємо лише серед перших n. */
export const tfIndexOfBase = (agg, i) => upperBound(agg.s, i, 0, agg.n) - 1;

/**
 * Свічка k, якою її видно, коли показано лише базові [0, cut).
 * Якщо k ще формується — збираємо з того, що вже «сталося»: на
 * графіку не має бути жодного тіку з майбутнього.
 */
export function barAt(agg, base, k, cut) {
  const from = agg.s[k];
  const to = Math.min(agg.s[k + 1], cut);
  if (to >= agg.s[k + 1]) {
    return { time: agg.t[k], open: agg.o[k], high: agg.h[k], low: agg.l[k], close: agg.c[k] };
  }
  let hi = base.h[from]; let lo = base.l[from];
  for (let i = from + 1; i < to; i += 1) {
    if (base.h[i] > hi) hi = base.h[i];
    if (base.l[i] < lo) lo = base.l[i];
  }
  return { time: agg.t[k], open: base.o[from], high: hi, low: lo, close: base.c[to - 1] };
}

/* Обсяг свічки k так, як його видно при cut (для недоформованої —
   лише вже «сталі» хвилинки). */
export function volAt(agg, base, k, cut) {
  if (!base.v) return 0;
  const from = agg.s[k];
  const to = cut == null ? agg.s[k + 1] : Math.min(agg.s[k + 1], cut);
  if (to >= agg.s[k + 1] && agg.v) return agg.v[k];
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += base.v[i];
  return sum;
}

/* ATR(14) на видимих свічках — від нього ставимо стоп за замовчуванням,
   щоб на золоті й на євро він був однаково «розумний». */
export function atr(agg, base, lastK, cut, period = 14) {
  const from = Math.max(1, lastK - period + 1);
  let sum = 0; let n = 0;
  for (let k = from; k <= lastK; k += 1) {
    const b = barAt(agg, base, k, cut);
    const pc = agg.c[k - 1];
    sum += Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
    n += 1;
  }
  return n ? sum / n : 0;
}

/* ------------------------------------------------------------------
   Сесія угоди.
   Час у файлі — час сервера брокера. У більшості MT5-брокерів це
   UTC+2 взимку й UTC+3 влітку (перехід разом зі США — так у них
   закриття дня збігається з 17:00 Нью-Йорка). Від цього рахуємо UTC
   і кладемо угоду в Asia / London / New York так само, як у журналі.
------------------------------------------------------------------ */
function usDst(utcSec) {
  const d = new Date(utcSec * 1000);
  const y = d.getUTCFullYear();
  const nthSunday = (month, nth) => {
    const first = new Date(Date.UTC(y, month, 1));
    const day = 1 + ((7 - first.getUTCDay()) % 7) + (nth - 1) * 7;
    return Date.UTC(y, month, day, 7) / 1000;
  };
  return utcSec >= nthSunday(2, 2) && utcSec < nthSunday(10, 1);
}

/* Час брокера → UTC (секунди). */
export const brokerToUtc = (brokerSec) => brokerSec - (usDst(brokerSec) ? 3 : 2) * 3600;

export function sessionOf(brokerSec) {
  const utcH = new Date(brokerToUtc(brokerSec) * 1000).getUTCHours();
  if (utcH >= 7 && utcH < 13) return 'London';
  if (utcH >= 13 && utcH < 21) return 'New York';
  return 'Asia';
}

/* «2026-10-06» з часу брокера. */
export const isoDay = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);

export const fmtTime = (sec) => {
  const d = new Date(sec * 1000).toISOString();
  return `${d.slice(0, 10).split('-').reverse().join('.')} ${d.slice(11, 16)}`;
};

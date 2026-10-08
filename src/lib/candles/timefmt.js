import { isEn } from '../lang';
import { brokerToUtc } from './agg';

/* ==================================================================
   Час на шкалі й під перехрестям.

   Свічки лежать у часі сервера брокера. Часовий пояс у налаштуваннях
   міняє лише ПІДПИСИ: межі свічок (де починається день чи H4)
   лишаються брокерськими — так само робить і TradingView, коли
   перемикаєш пояс: бари не перебудовуються, змінюються лише мітки.
================================================================== */

export const TIMEZONES = [
  { id: 'broker', uk: 'Час брокера (MT5)', en: 'Broker time (MT5)' },
  { id: 'UTC', uk: 'UTC', en: 'UTC' },
  { id: 'Europe/Kyiv', uk: 'Київ', en: 'Kyiv' },
  { id: 'Europe/London', uk: 'Лондон', en: 'London' },
  { id: 'America/New_York', uk: 'Нью-Йорк', en: 'New York' },
  { id: 'Asia/Tokyo', uk: 'Токіо', en: 'Tokyo' },
];

export const DATE_FORMATS = ["dd MMM 'yy", 'dd.MM.yyyy', 'yyyy-MM-dd', 'MM/dd/yy'];

const MON_UK = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD_UK = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_IDX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const fmtCache = new Map();
function zoneFmt(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23', weekday: 'short',
    }));
  }
  return fmtCache.get(tz);
}

/* Розкласти мітку графіка на поля в обраному поясі. */
export function partsOf(sec, tz = 'broker') {
  if (tz === 'broker' || tz === 'UTC') {
    const d = new Date((tz === 'UTC' ? brokerToUtc(sec) : sec) * 1000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() };
  }
  try {
    const out = {};
    for (const x of zoneFmt(tz).formatToParts(new Date(brokerToUtc(sec) * 1000))) out[x.type] = x.value;
    return { y: +out.year, mo: +out.month - 1, d: +out.day, h: +out.hour % 24, mi: +out.minute, s: +out.second, wd: WD_IDX[out.weekday] ?? 0 };
  } catch {
    return partsOf(sec, 'broker');
  }
}

const p2 = (n) => String(n).padStart(2, '0');

export function fmtDate(q, fmt) {
  const mon = (isEn ? MON_EN : MON_UK)[q.mo];
  switch (fmt) {
    case 'dd.MM.yyyy': return `${p2(q.d)}.${p2(q.mo + 1)}.${q.y}`;
    case 'yyyy-MM-dd': return `${q.y}-${p2(q.mo + 1)}-${p2(q.d)}`;
    case 'MM/dd/yy': return `${p2(q.mo + 1)}/${p2(q.d)}/${String(q.y).slice(2)}`;
    default: return `${p2(q.d)} ${mon} '${String(q.y).slice(2)}`;
  }
}

export function fmtClock(q, timeFmt) {
  if (timeFmt === '12') {
    const h = q.h % 12 || 12;
    return `${h}:${p2(q.mi)} ${q.h < 12 ? 'AM' : 'PM'}`;
  }
  return `${p2(q.h)}:${p2(q.mi)}`;
}

/* Підпис під перехрестям: «пн 06 жов '26  14:15». */
export function fmtChartTime(sec, p) {
  const q = partsOf(sec, p.tz);
  const wd = p.weekday ? `${(isEn ? WD_EN : WD_UK)[q.wd]} ` : '';
  return `${wd}${fmtDate(q, p.dateFmt)}  ${fmtClock(q, p.timeFmt)}`;
}

/* Мітки шкали часу. type — TickMarkType бібліотеки:
   0 рік, 1 місяць, 2 день, 3 час, 4 час із секундами. */
export function fmtTick(sec, type, p) {
  const q = partsOf(sec, p.tz);
  if (type === 0) return String(q.y);
  if (type === 1) return (isEn ? MON_EN : MON_UK)[q.mo];
  if (type === 2) return String(q.d);
  return fmtClock(q, p.timeFmt);
}

/* Для панелей сторінки — той самий формат, що й на графіку. */
export function fmtStamp(sec, p) {
  const q = partsOf(sec, p.tz);
  return `${fmtDate(q, p.dateFmt)} ${fmtClock(q, p.timeFmt)}`;
}

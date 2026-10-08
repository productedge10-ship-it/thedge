import { brokerToUtc } from './agg';

/* ==================================================================
   Новини для графіка бектесту.

   Економічний календар за минулі місяці (з фактичними значеннями)
   приходить через ту саму функцію /api/news, що й сторінка новин,
   тільки діапазоном: ?from=…&to=… — по місяцю за раз.

   Минуле не змінюється, тож місяць, що вже закінчився, тримаємо в
   браузері назавжди. Поточний — лише в пам'яті сторінки.

   Час події в календарі — UTC, а свічки з MT5 — у часі брокера
   (UTC+2, влітку за США UTC+3). Тому кожну подію одразу переводимо в
   час брокера: так вона стає рівно на свою свічку.
================================================================== */

const FN = '/api/news';
const LKEY = (ym) => `edge_bt_news_${ym}`;
const mem = new Map();
const busy = new Map();

export const IMPACT_RANK = { High: 3, Medium: 2, Low: 1, Holiday: 0 };
export const IMPACT_COLOR = { High: '#f23645', Medium: '#ff9800', Low: '#787b86', Holiday: '#2962ff' };

/* Валюти, новини яких рухають інструмент. */
const INDEX_CCY = {
  GER30: 'EUR', GER40: 'EUR', DE30: 'EUR', DE40: 'EUR', DAX: 'EUR', FRA40: 'EUR', EU50: 'EUR', STOXX50: 'EUR',
  UK100: 'GBP', FTSE100: 'GBP', JP225: 'JPY', JPN225: 'JPY', NIKKEI: 'JPY', AUS200: 'AUD',
  NDX100: 'USD', NAS100: 'USD', USTEC: 'USD', SPX500: 'USD', US500: 'USD', US30: 'USD', DJ30: 'USD',
};
const FIAT = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY']);

export function newsCcys(symbol) {
  const s = String(symbol || '').toUpperCase().replace(/^SRV:/, '').replace(/[^A-Z0-9]/g, '');
  if (INDEX_CCY[s]) return INDEX_CCY[s] === 'USD' ? ['USD'] : [INDEX_CCY[s], 'USD'];
  const m = s.match(/^([A-Z]{3})([A-Z]{3})/);
  if (m) {
    const out = [m[1], m[2]].filter((c) => FIAT.has(c));
    return out.length ? out : ['USD'];
  }
  return ['USD'];
}

export const utcToBroker = (u) => {
  const b3 = u + 3 * 3600;
  return brokerToUtc(b3) === u ? b3 : u + 2 * 3600;
};

const ymOf = (brokerSec) => new Date(brokerSec * 1000).toISOString().slice(0, 7);
const nextYm = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/* Компактний рядок: [час брокера, валюта, вага, назва, факт, прогноз, попереднє]. */
const pack = (r) => {
  const u = Math.floor(new Date(r.date).getTime() / 1000);
  return [utcToBroker(u), r.country, r.impact, r.title, r.actual || '', r.forecast || '', r.previous || ''];
};
const unpack = (a, i) => ({ id: `${a[0]}|${a[1]}|${i}`, t: a[0], ccy: a[1], impact: a[2], title: a[3], actual: a[4], forecast: a[5], previous: a[6] });

const readLocal = (ym) => {
  try { const raw = localStorage.getItem(LKEY(ym)); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
const writeLocal = (ym, rows) => {
  try { localStorage.setItem(LKEY(ym), JSON.stringify(rows)); } catch {
    /* Місце скінчилось — звільняємо найстаріші місяці й пробуємо ще раз. */
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('edge_bt_news_')).sort();
      keys.slice(0, Math.ceil(keys.length / 2)).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(LKEY(ym), JSON.stringify(rows));
    } catch { /* лишається в пам'яті */ }
  }
};

/* Місяць новин (за UTC-місяцем; краї з запасом закриває сусідній). */
export function loadMonth(ym) {
  if (mem.has(ym)) return Promise.resolve(mem.get(ym));
  if (busy.has(ym)) return busy.get(ym);
  const done = new Date(`${nextYm(ym)}-01T00:00:00Z`).getTime() < Date.now() - 2 * 86400000;
  const cached = done ? readLocal(ym) : null;
  if (cached) {
    const list = cached.map(unpack);
    mem.set(ym, list);
    return Promise.resolve(list);
  }
  const p = fetch(`${FN}?from=${ym}-01T00:00:00Z&to=${nextYm(ym)}-01T00:00:00Z`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((rows) => {
      const packed = (Array.isArray(rows) ? rows : []).map(pack).filter((a) => Number.isFinite(a[0]));
      if (done) writeLocal(ym, packed);
      const list = packed.map(unpack);
      mem.set(ym, list);
      return list;
    })
    .catch(() => {
      /* Мережа впала — не кешуємо порожнечу, спробуємо згодом. */
      setTimeout(() => busy.delete(ym), 30000);
      return [];
    })
    .finally(() => { if (mem.has(ym)) busy.delete(ym); });
  busy.set(ym, p);
  return p;
}

/* Новини за проміжок часу брокера (секунди). */
export async function newsBetween(fromSec, toSec) {
  const months = [];
  let ym = ymOf(fromSec - 86400 * 2);
  const last = ymOf(toSec + 86400);
  for (let i = 0; i < 24; i += 1) {
    months.push(ym);
    if (ym === last) break;
    ym = nextYm(ym);
  }
  const lists = await Promise.all(months.map(loadMonth));
  const seen = new Set();
  const out = [];
  lists.flat().forEach((e) => {
    if (e.t < fromSec || e.t > toSec) return;
    const k = `${e.t}|${e.ccy}|${e.title}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(e);
  });
  return out.sort((a, b) => a.t - b.t);
}

/* Факт краще/гірше прогнозу — для кольору. null — не порівняти. */
export function surprise(e) {
  const n = (v) => { const x = parseFloat(String(v).replace(/[^0-9.+-]/g, '')); return Number.isFinite(x) ? x : null; };
  const a = n(e.actual); const f = n(e.forecast ?? '') ?? n(e.previous);
  if (a == null || f == null || a === f) return null;
  return a > f ? 1 : -1;
}

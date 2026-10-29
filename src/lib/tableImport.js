/* ==================================================================
   Імпорт журналу з власної таблиці: Notion, Google Sheets, Excel.

   На відміну від звітів брокера (tradeImport.js), тут кожна людина
   називає колонки по-своєму і зберігає в них що завгодно. Тому
   колонку визначаємо двома способами разом:
   • за назвою — словник синонімів укр/рос/англ;
   • за самими значеннями — 90% схожі на дати → дата, посилання на
     TradingView → скріни, Long/Short/BUY/SELL → напрям, Yes/No →
     результат, числа з % → ризик чи прибуток.
   Людина бачить, що ми вгадали, і виправляє. Нічого не губиться:
   колонка, якій не знайшлось поля, іде в опис угоди з назвою.

   Notion віддає експорт zip-ом (буває zip у zip-і), всередині CSV
   і, якщо в таблиці є «Files & media», самі картинки. Zip читаємо
   тут же, без бібліотек: DecompressionStream уміє deflate-raw.

   Модуль без React і без DOM — тестується звичайним node.
================================================================== */

import { decodeFile, toNum } from './tradeImport';

const clean = (s) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/^\ufeff/, '').trim();
const lc = (s) => clean(s).toLowerCase();
/* Назву колонки зводимо до літер і цифр: «Risk. %» → «risk», «P&L $» → «pl». */
const hkey = (s) => lc(s).replace(/[^a-zа-яіїєґё0-9]+/gi, ' ').trim();

/* ------------------------------------------------------------------
   CSV
------------------------------------------------------------------ */

export function csvRows(text) {
  const src = String(text || '').replace(/^\ufeff/, '');
  /* Роздільник — за першим рядком, але без того, що в лапках. */
  const first = (src.split(/\r?\n/).find((l) => l.trim()) || '').replace(/"[^"]*"/g, '');
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let cur = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { cur.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      cur.push(cell); rows.push(cur); cur = []; cell = '';
    } else cell += c;
  }
  if (cell || cur.length) { cur.push(cell); rows.push(cur); }
  return rows.filter((r) => r.some((c) => clean(c)));
}

function tableFromRows(name, rows) {
  if (rows.length < 2) return null;
  const headers = rows[0].map((h, i) => clean(h) || `#${i + 1}`);
  const body = rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] ?? ''; });
    return o;
  });
  return { name, headers, rows: body };
}

/* ------------------------------------------------------------------
   ZIP (лише читання: stored і deflate)
------------------------------------------------------------------ */

async function inflate(data) {
  if (typeof DecompressionStream === 'undefined') throw new Error('NO_ZIP');
  const ds = new DecompressionStream('deflate-raw');
  const out = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function unzip(buf) {
  const b = new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 70000); i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('BAD_ZIP');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const files = [];
  for (let k = 0; k < count; k += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const lnl = dv.getUint16(off + 26, true);
    const lxl = dv.getUint16(off + 28, true);
    const start = off + 30 + lnl + lxl;
    const raw = b.subarray(start, start + csize);
    files.push({ name, read: () => (method === 0 ? Promise.resolve(raw.slice()) : inflate(raw)) });
  }
  return files;
}

/* ------------------------------------------------------------------
   Файли → таблиці + картинки з архіву
------------------------------------------------------------------ */

const IMG_EXT = /\.(png|jpe?g|webp|gif)$/i;
const TABLE_EXT = /\.(csv|tsv|txt)$/i;
const baseName = (p) => decodeURIComponent(String(p).split('/').pop() || '').toLowerCase();

/* files — масив { name, buf } (у браузері це File.arrayBuffer()).
   Повертає таблиці й мапу картинок «імʼя файлу → Blob». */
export async function readSources(files) {
  const tables = [];
  const images = new Map();
  const walk = async (name, buf, depth) => {
    if (/\.zip$/i.test(name)) {
      if (depth > 3) return;
      const inner = await unzip(buf);
      for (const f of inner) {
        if (/\.zip$/i.test(f.name) || TABLE_EXT.test(f.name) || IMG_EXT.test(f.name)) {
          await walk(f.name, await f.read(), depth + 1);
        }
      }
    } else if (TABLE_EXT.test(name)) {
      const t = tableFromRows(name.split('/').pop(), csvRows(decodeFile(buf)));
      if (t) tables.push(t);
    } else if (IMG_EXT.test(name)) {
      const ext = name.split('.').pop().toLowerCase().replace('jpg', 'jpeg');
      images.set(baseName(name), new Blob([buf], { type: `image/${ext}` }));
    }
  };
  for (const f of files) await walk(f.name, f.buf, 0);
  return { tables: pickTables(tables), images };
}

/* Notion кладе дві копії бази: «X.csv» (з фільтрами виду) і
   «X_all.csv» (усі рядки). Беремо _all, коли він є. */
function pickTables(tables) {
  const names = new Set(tables.map((t) => t.name.toLowerCase()));
  return tables.filter((t) => {
    const n = t.name.toLowerCase();
    return n.endsWith('_all.csv') || !names.has(n.replace(/\.csv$/, '_all.csv'));
  });
}

/* Кілька таблиць (місяць = окрема база в Notion) зливаємо в одну:
   колонки — обʼєднання за назвою. */
export function mergeTables(tables) {
  const headers = [];
  const seen = new Set();
  const rows = [];
  for (const t of tables) {
    for (const h of t.headers) if (!seen.has(h)) { seen.add(h); headers.push(h); }
    for (const r of t.rows) rows.push({ ...r, __src: t.name });
  }
  return { headers, rows };
}

/* ------------------------------------------------------------------
   Дати
------------------------------------------------------------------ */

const MONTHS = [
  ['jan', 'січ', 'янв'], ['feb', 'лют', 'фев'], ['mar', 'берез', 'мар'], ['apr', 'квіт', 'апр'],
  ['may', 'трав', 'мая', 'май'], ['jun', 'черв', 'июн'], ['jul', 'лип', 'июл'], ['aug', 'серп', 'авг'],
  ['sep', 'верес', 'сен'], ['oct', 'жовт', 'окт'], ['nov', 'листоп', 'ноя'], ['dec', 'груд', 'дек'],
];
const monthOf = (w) => {
  const s = lc(w);
  for (let i = 0; i < 12; i += 1) if (MONTHS[i].some((p) => s.startsWith(p))) return i + 1;
  return null;
};
const p2 = (x) => String(x).padStart(2, '0');

function timeOf(s) {
  const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[4]) { const pm = /pm/i.test(m[4]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  if (h > 23) return null;
  return `${p2(h)}:${m[2]}:${p2(m[3] || 0)}`;
}

/* «September 11, 2026», «11 вересня 2026 р.», «11 сентября 2026»,
   «2026-09-11», «11.09.2026», «09/11/2026», діапазон Notion
   «September 11, 2026 → September 12, 2026» (беремо початок),
   з часом «10:30 AM» або без. */
export function parseDateAny(v) {
  const s0 = clean(v).split('→')[0].trim();
  if (!s0) return null;
  const time = timeOf(s0);
  let m = s0.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return ok(m[1], m[2], m[3], time);
  m = s0.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = `20${y}`;
    /* Спершу день (так пишуть у нас); «місяць/день», якщо інакше не виходить. */
    const [d, mo] = Number(b) > 12 ? [b, a] : [a, b];
    return ok(y, mo, d, time);
  }
  /* Словесний місяць: «Month D, YYYY» або «D Month YYYY». */
  m = s0.match(/([A-Za-zА-Яа-яІіЇїЄєҐґЁё]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m && monthOf(m[1])) return ok(m[3], monthOf(m[1]), m[2], time);
  m = s0.match(/(\d{1,2})\s+([A-Za-zА-Яа-яІіЇїЄєҐґЁё]{3,})\.?,?\s+(\d{4})/);
  if (m && monthOf(m[2])) return ok(m[3], monthOf(m[2]), m[1], time);
  return null;
}
function ok(y, mo, d, time) {
  const Y = Number(y); const M = Number(mo); const D = Number(d);
  if (!(Y > 1990 && Y < 2100 && M >= 1 && M <= 12 && D >= 1 && D <= 31)) return null;
  return { date: `${Y}-${p2(M)}-${p2(D)}`, time };
}

/* ------------------------------------------------------------------
   Поля, у які можна покласти колонку
------------------------------------------------------------------ */

/* multi — кілька колонок можуть іти в одне поле. */
export const TARGETS = [
  { key: 'date', uk: 'Дата', en: 'Date' },
  { key: 'pair', uk: 'Актив', en: 'Asset' },
  { key: 'dir', uk: 'Напрям (Long / Short)', en: 'Direction (Long / Short)' },
  { key: 'rr', uk: 'RR (результат у R)', en: 'RR (result in R)' },
  { key: 'result', uk: 'Результат (Win / Loss)', en: 'Result (Win / Loss)' },
  { key: 'profit', uk: 'Прибуток, $', en: 'Profit, $' },
  { key: 'profitPct', uk: 'Прибуток, %', en: 'Profit, %' },
  { key: 'risk', uk: 'Ризик (% або $)', en: 'Risk (% or $)' },
  { key: 'session', uk: 'Сесія', en: 'Session' },
  { key: 'entryTime', uk: 'Час входу', en: 'Entry time' },
  { key: 'exitTime', uk: 'Час виходу', en: 'Exit time' },
  { key: 'description', uk: 'Опис угоди', en: 'Trade description' },
  { key: 'note', uk: 'Додати в опис', en: 'Add to description', multi: true },
  { key: 'images', uk: 'Скріни', en: 'Screenshots', multi: true },
  { key: 'mistake', uk: 'Помилка', en: 'Mistake' },
  { key: 'id', uk: 'Номер угоди', en: 'Trade number' },
  { key: 'skip', uk: 'Не переносити', en: 'Don’t import', multi: true },
];
const SINGLE = TARGETS.filter((t) => !t.multi).map((t) => t.key);

const SYN = {
  date: ['date', 'дата', 'day', 'день', 'trade date', 'open date', 'entry date', 'opened', 'created', 'when'],
  pair: ['pair', 'symbol', 'asset', 'instrument', 'ticker', 'market', 'актив', 'пара', 'інструмент', 'инструмент', 'символ', 'тікер', 'тикер', 'coin'],
  dir: ['direction', 'side', 'type', 'position', 'long short', 'buy sell', 'order type', 'напрям', 'напрямок', 'направление', 'позиція', 'позиция', 'тип', 'сторона'],
  rr: ['rr', 'r', 'r r', 'rrr', 'risk reward', 'r multiple', 'result r', 'r result', 'realized r', 'рр', 'r результат'],
  result: ['result', 'outcome', 'win', 'win loss', 'w l', 'status', 'результат', 'итог', 'підсумок', 'тейк стоп', 'tp sl'],
  profit: ['profit', 'pnl', 'p l', 'pl', 'net', 'net pnl', 'profit usd', 'прибуток', 'профіт', 'прибыль', 'профит'],
  risk: ['risk', 'risk %', 'ризик', 'риск', 'risk usd', 'risk per trade'],
  session: ['session', 'сесія', 'сессия', 'killzone', 'kill zone', 'kz'],
  entryTime: ['entry time', 'time in', 'open time', 'time', 'час входу', 'время входа', 'час', 'время', 'вхід', 'вход'],
  exitTime: ['exit time', 'close time', 'time out', 'час виходу', 'время выхода'],
  description: ['notes', 'note', 'comment', 'comments', 'description', 'argument', 'arguments', 'reason', 'why', 'idea', 'analysis', 'review',
    'нотатки', 'нотатка', 'коментар', 'опис', 'причина', 'аргумент', 'аргументи', 'комментарий', 'описание', 'заметки', 'аналіз', 'анализ'],
  mistake: ['mistake', 'mistakes', 'error', 'errors', 'помилка', 'помилки', 'ошибка', 'ошибки'],
  images: ['screenshot', 'screenshots', 'screen', 'chart', 'image', 'images', 'htf', 'ltf', 'mtf', 'before', 'after', 'files media', 'attachments',
    'скрін', 'скрин', 'скріни', 'скрины', 'графік', 'график', 'tradingview', 'tv'],
  id: ['number', 'no', 'id', 'trade', 'trade id', 'trade no', 'номер', 'n'],
};
const WEAK_DIR = ['bias', 'htf bias', 'daily bias', 'біас', 'баяс', 'напрям ринку'];

const DIR_RE = /^(long|short|buy|sell|лонг|шорт|купівля|продаж|покупка|продажа|bull|bear|bullish|bearish)$/i;
const RES_WIN = /^(yes|y|win|won|w|tp|take|take profit|profit|true|✅|✔|✓|так|да|плюс|профіт|профит|тейк|\+)$/i;
const RES_LOSS = /^(no|n|loss|lose|lost|l|sl|stop|stop loss|false|❌|✖|✗|ні|нет|мінус|минус|стоп|-)$/i;
const RES_BE = /^(be|b\/e|breakeven|break even|беззбиток|безубыток|бу|0)$/i;
const SESS = [
  ['Asia', /^(asia|asian|tokyo|sydney|азія|азия|токіо|токио)/i],
  ['Frankfurt', /^(frank|fra|ffm|франкф)/i],
  ['London', /^(london|lon|ldn|лондон|eu|europe)/i],
  ['New York', /^(ny|n\.y|new york|nyc|us|usa|нью|ny am|ny pm|нy)/i],
  ['All day', /^(all|all day|весь день|цілий день)/i],
];
export const SESSIONS = SESS.map((s) => s[0]);
const URL_RE = /^https?:\/\//i;
const TV_RE = /tradingview\.com\/x\//i;

const splitMulti = (v) => clean(v).split(/\s*,\s*(?=\S)/).filter(Boolean);

function profileCol(h, rows) {
  const vals = rows.map((r) => clean(r[h])).filter(Boolean);
  const n = vals.length;
  const share = (fn) => (n ? vals.filter(fn).length / n : 0);
  const nums = vals.map(toNum);
  return {
    n,
    sample: vals.find((v) => v.length > 0) || '',
    distinct: new Set(vals.map((v) => v.toLowerCase())).size,
    avgLen: n ? vals.reduce((s, v) => s + v.length, 0) / n : 0,
    url: share((v) => splitMulti(v).every((x) => URL_RE.test(x))),
    img: share((v) => splitMulti(v).every((x) => TV_RE.test(x) || IMG_EXT.test(x.split('?')[0]))),
    date: share((v) => !!parseDateAny(v) && !/^\d+([.,]\d+)?$/.test(v)),
    dir: share((v) => DIR_RE.test(v)),
    res: share((v) => RES_WIN.test(v) || RES_LOSS.test(v) || RES_BE.test(v)),
    num: share((v) => toNum(v.replace('%', '')) != null),
    pct: share((v) => /%$/.test(v)),
    money: share((v) => /[$€£₴]/.test(v)),
    int: n && nums.every((x) => x != null && Number.isInteger(x)),
    sess: share((v) => SESS.some(([, re]) => re.test(v))),
    time: share((v) => /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i.test(v)),
    ticker: share((v) => /^[A-Za-z0-9/._&!:-]{2,14}$/.test(v) && !DIR_RE.test(v) && !RES_WIN.test(v) && !RES_LOSS.test(v) && toNum(v) == null),
  };
}

function headerScore(h, key) {
  const k = hkey(h);
  const list = SYN[key] || [];
  if (list.includes(k)) return 3;
  /* «Risk. %» → «risk», «Profit. %» → «profit» — збіг першого слова. */
  const words = k.split(' ');
  if (list.some((s) => s.length > 2 && words.includes(s))) return 2;
  if (list.some((s) => s.length > 3 && k.includes(s))) return 1;
  return 0;
}

function scoreAll(h, p) {
  const k = hkey(h);
  const s = {};
  for (const key of Object.keys(SYN)) s[key] = headerScore(h, key);
  s.profitPct = 0;
  if (!p.n) return s;
  if (p.date >= 0.8) s.date += 4;
  if (p.img >= 0.6 || (s.images >= 2 && p.url >= 0.6)) s.images += 5; else if (p.url >= 0.8) s.images += 1;
  if (p.dir >= 0.8) s.dir += WEAK_DIR.includes(k) ? 1 : 3;
  if (WEAK_DIR.includes(k)) s.dir = Math.min(s.dir, 2);
  if (p.res >= 0.8) s.result += 3;
  if (p.sess >= 0.6) s.session += 4;
  if (p.ticker >= 0.8 && p.distinct <= Math.max(30, p.n * 0.6)) s.pair += 2;
  if (p.time >= 0.8) { s.entryTime += 3; s.exitTime += 1; }
  if (p.avgLen >= 25 && p.url < 0.5) s.description += 3;
  if (p.num >= 0.9) {
    if (p.pct >= 0.5) {
      /* Відсотки: ризик або прибуток — вирішує назва. */
      if (s.risk > 0) s.risk += 3;
      else if (s.profit > 0 || s.result > 0 || /return|дохід|доход/.test(k)) { s.profitPct = s.profit + 3; s.profit = 0; s.result = 0; }
    } else if (p.money >= 0.5) {
      if (s.risk > 0) s.risk += 3; else s.profit += 2;
    } else {
      if (s.rr > 0) s.rr += 3;
      if (s.risk > 0) s.risk += 2;
      if (p.int && s.id > 0) s.id += 2;
    }
  } else {
    s.rr = 0; s.profit = 0; s.risk = Math.min(s.risk, 1); s.id = 0;
  }
  if (p.num < 0.9 && s.result > 0 && p.res < 0.5) s.result = 1;
  return s;
}

/* Мапа «колонка → поле». saved — збережена мапа з минулого імпорту
   (якщо назви колонок ті самі, беремо її як є). */
export function suggestMapping(headers, rows) {
  const prof = Object.fromEntries(headers.map((h) => [h, profileCol(h, rows)]));
  const scores = Object.fromEntries(headers.map((h) => [h, scoreAll(h, prof[h])]));
  const map = {};
  const cand = [];
  for (const h of headers) for (const key of SINGLE) {
    const sc = scores[h][key] || 0;
    if (sc >= 3) cand.push([sc, h, key]);
  }
  cand.sort((a, b) => b[0] - a[0]);
  const taken = new Set();
  for (const [, h, key] of cand) {
    if (map[h] || taken.has(key)) continue;
    map[h] = key; taken.add(key);
  }
  for (const h of headers) {
    if (map[h]) continue;
    const p = prof[h];
    if (!p.n) map[h] = 'skip';
    else if (scores[h].images >= 5) map[h] = 'images';
    else if (!taken.has('description') && p.avgLen >= 25 && p.url < 0.5) { map[h] = 'description'; taken.add('description'); } else map[h] = 'note';
  }
  return { map, prof };
}

export const headerSig = (headers) => headers.map(hkey).sort().join('|');

/* ------------------------------------------------------------------
   Значення, які варто показати людині
------------------------------------------------------------------ */

const CCY = { EUR: 'EURUSD', GBP: 'GBPUSD', AUD: 'AUDUSD', NZD: 'NZDUSD', JPY: 'USDJPY', CAD: 'USDCAD', CHF: 'USDCHF', XAU: 'XAUUSD', XAG: 'XAGUSD' };
export const normPair = (v) => {
  const s = clean(v).toUpperCase().replace(/\s+/g, '');
  return CCY[s] || s;
};
const dirWord = (v) => {
  const s = lc(v);
  if (/^(short|sell|шорт|продаж|продажа|bear|bearish)$/.test(s)) return 'Short';
  if (/^(long|buy|лонг|купівля|покупка|bull|bullish)$/.test(s)) return 'Long';
  return null;
};
const resWord = (v) => {
  const s = clean(v);
  if (RES_WIN.test(s)) return 'Win';
  if (RES_LOSS.test(s)) return 'Lose';
  if (RES_BE.test(s)) return 'BE';
  return null;
};
const sessWord = (v) => {
  const s = clean(v);
  const hit = SESS.find(([, re]) => re.test(s));
  return hit ? hit[0] : s;
};

const colOf = (map, key) => Object.keys(map).find((h) => map[h] === key);

/* Унікальні значення активу, сесії, напряму й результату з
   підставленою відповіддю. Людина правит лише те, що не так. */
export function valueChoices(map, rows) {
  const uniq = (h) => [...new Set(rows.map((r) => clean(r[h])).filter(Boolean))];
  const out = {};
  const pc = colOf(map, 'pair');
  if (pc) out.pair = uniq(pc).map((raw) => ({ raw, to: normPair(raw) }));
  const sc = colOf(map, 'session');
  if (sc) out.session = uniq(sc).map((raw) => ({ raw, to: sessWord(raw) }));
  const dc = colOf(map, 'dir');
  if (dc) out.dir = uniq(dc).map((raw) => ({ raw, to: dirWord(raw) || 'Long' }));
  const rc = colOf(map, 'result');
  if (rc) out.result = uniq(rc).map((raw) => ({ raw, to: resWord(raw) || 'BE' }));
  return out;
}

/* ------------------------------------------------------------------
   Рядки → угоди
------------------------------------------------------------------ */

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
};
const MISTAKE_RE = /(помилк[аи]?|ошибк[аи]?|mistakes?|errors?)\s*[:\-–—]/i;

export function hasMistakeText(text) { return MISTAKE_RE.test(String(text || '')); }

/* opts: { values: { pair: {raw: to}, … }, account, mistakesFromText } */
export function buildTrades(rows, map, opts = {}) {
  const V = opts.values || {};
  const col = (key) => colOf(map, key);
  const cols = (key) => Object.keys(map).filter((h) => map[h] === key);
  const c = {
    date: col('date'), pair: col('pair'), dir: col('dir'), rr: col('rr'), result: col('result'),
    profit: col('profit'), profitPct: col('profitPct'), risk: col('risk'), session: col('session'),
    entryTime: col('entryTime'), exitTime: col('exitTime'), description: col('description'),
    mistake: col('mistake'), id: col('id'),
  };
  const notes = cols('note');
  const images = cols('images');
  /* Інші колонки, схожі на напрям (Bias проти Position) — для попередження. */
  const otherDir = Object.keys(map).filter((h) => h !== c.dir && rows.filter((r) => dirWord(r[h])).length >= rows.length * 0.8);

  const trades = [];
  const skipped = [];
  let dirConflicts = 0;
  rows.forEach((r, i) => {
    const g = (h) => (h ? clean(r[h]) : '');
    const when = parseDateAny(g(c.date));
    if (!when) { skipped.push({ i, why: 'date' }); return; }
    const pairRaw = g(c.pair);
    if (!pairRaw) { skipped.push({ i, why: 'pair' }); return; }
    const pair = V.pair?.[pairRaw] || normPair(pairRaw);

    const dRaw = g(c.dir);
    const dir = V.dir?.[dRaw] || dirWord(dRaw) || 'Long';
    if (otherDir.some((h) => dirWord(r[h]) && dirWord(r[h]) !== dir)) dirConflicts += 1;

    const riskRaw = g(c.risk);
    const riskNum = toNum(riskRaw.replace('%', ''));
    const riskIsPct = /%/.test(riskRaw) || (riskNum != null && !/[$€£₴]/.test(riskRaw) && riskNum <= 10);
    const profit = toNum(g(c.profit));
    const profitPct = toNum(g(c.profitPct).replace('%', ''));

    let rr = toNum(g(c.rr));
    if (rr == null && profitPct != null && riskIsPct && riskNum > 0) rr = Math.round((profitPct / riskNum) * 100) / 100;
    if (rr == null && profit != null && !riskIsPct && riskNum > 0) rr = Math.round((profit / riskNum) * 100) / 100;

    /* RR — найнадійніше: Win=No при RR 0 — це беззбиток, а не мінус. */
    let result;
    if (rr != null) result = rr > 0 ? 'Win' : rr < 0 ? 'Lose' : 'BE';
    else if (c.result && g(c.result)) result = V.result?.[g(c.result)] || resWord(g(c.result)) || 'BE';
    else if (profit != null) result = profit > 0 ? 'Win' : profit < 0 ? 'Lose' : 'BE';
    else if (profitPct != null) result = profitPct > 0 ? 'Win' : profitPct < 0 ? 'Lose' : 'BE';
    else result = 'Not Selected';
    /* У базі RR без знака, знак — у result. */
    if (rr != null && result === 'Lose' && rr > 0) rr = -rr;

    const shots = [];
    const files = [];
    const extraLinks = [];
    for (const h of images) {
      for (const x of splitMulti(r[h])) {
        if (TV_RE.test(x) || (URL_RE.test(x) && IMG_EXT.test(x.split('?')[0]))) shots.push(x);
        else if (!URL_RE.test(x) && IMG_EXT.test(x)) files.push(baseName(x));
        else if (URL_RE.test(x)) extraLinks.push(`${h}: ${x}`);
      }
    }

    let desc = g(c.description);
    const lines = notes.map((h) => (g(h) ? `${h}: ${g(h)}` : null)).filter(Boolean).concat(extraLinks);
    if (lines.length) desc = [desc, lines.join('\n')].filter(Boolean).join('\n\n');

    let mistake = g(c.mistake);
    if (!mistake && opts.mistakesFromText && hasMistakeText(g(c.description))) {
      const m = g(c.description).match(MISTAKE_RE);
      mistake = g(c.description).slice(m.index).replace(MISTAKE_RE, '').trim() || g(c.description);
    }

    const num = g(c.id);
    const ext = `tbl:${when.date}:${pair}:${num || hash(`${dir}|${rr}|${g(c.description).slice(0, 60)}|${i}`)}`;

    const risk = riskNum == null ? null : riskIsPct ? `${riskNum}%` : `$${riskNum}`;
    trades.push({
      source: 'import',
      external_id: ext.slice(0, 200),
      plan_date: when.date,
      plan_pair: pair,
      account_name: opts.account || null,
      type: dir,
      result,
      rr: rr == null ? null : Math.abs(rr),
      risk,
      risk_money: riskNum != null && !riskIsPct ? riskNum : null,
      profit_money: profit,
      session: c.session && g(c.session) ? (V.session?.[g(c.session)] || sessWord(g(c.session))) : null,
      entry_time: timeOf(g(c.entryTime)) || when.time || null,
      exit_time: timeOf(g(c.exitTime)) || null,
      trade_description: desc || null,
      trade_image: shots[0] || null,
      trade_images: shots.length ? shots : null,
      has_mistake: mistake ? true : null,
      mistake_description: mistake || null,
      __files: files,
      __r: rr,
    });
  });
  return { trades, skipped, dirConflicts, otherDir };
}

/* Підсумок для екрана перевірки. */
export function summarize(trades) {
  const w = trades.filter((t) => t.result === 'Win').length;
  const l = trades.filter((t) => t.result === 'Lose').length;
  const be = trades.filter((t) => t.result === 'BE').length;
  const sumR = trades.reduce((s, t) => s + (t.__r || 0), 0);
  const dates = trades.map((t) => t.plan_date).sort();
  return {
    n: trades.length, w, l, be,
    wr: w + l ? Math.round((w / (w + l)) * 100) : null,
    sumR: Math.round(sumR * 100) / 100,
    from: dates[0], to: dates[dates.length - 1],
  };
}

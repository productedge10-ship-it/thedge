/* ==================================================================
   Розбір файлу свічок у типізовані масиви.

   Головне джерело — «Експортувати бари» з MT5: табуляція, окремо
   дата й час, далі OHLC, тікові обсяги, обсяг, спред. Але люди
   принесуть і MT4 (коми, час без секунд), і Dukascopy (день першим,
   «03.01.2023 01:05:00.000»), і власні CSV з крапкою з комою. Тому
   формат не вгадуємо за заголовком — кожен рядок читаємо однаково:
   спершу дата й час (в одному полі чи у двох), потім чотири числа.
   Рядок, який так не читається (заголовок, порожній), просто
   пропускаємо.

   Час лишаємо таким, як у файлі, і записуємо його «як UTC». Графік
   показує UTC-мітки без зсуву, тож трейдер бачить рівно ті години,
   що й у своєму терміналі, а угоди з журналу (теж у часі брокера)
   лягають на ті самі свічки.

   Масиви, а не обʼєкти: мільйон обʼєктів {time, open, …} — це
   сотні мегабайтів і секунди збирання сміття; пʼять масивів — 45 МБ.
================================================================== */

const DELIMS = ['\t', ';', ','];

function pickDelim(sample) {
  let best = '\t';
  let bestN = 0;
  for (const d of DELIMS) {
    const n = sample.split(d).length;
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}

/* Дата: «2023.01.03», «2023-01-03», «2023/01/03» або «03.01.2023». */
function parseDate(s) {
  const m = /^(\d{1,4})[.\-/](\d{1,2})[.\-/](\d{1,4})/.exec(s);
  if (!m) return null;
  let y = +m[1]; const mo = +m[2]; let d = +m[3];
  if (m[1].length <= 2 && m[3].length === 4) { const t = y; y = d; d = t; }
  if (y < 1970 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return Date.UTC(y, mo - 1, d) / 1000;
}

/* Час: «01:05», «01:05:00», «01:05:00.000». */
function parseTime(s) {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (m[3] ? +m[3] : 0);
}

function decimalsOf(s) {
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/* Декодування: MT5 на частині збірок пише UTF-16 з BOM. */
export function decodeBuffer(buf) {
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  return new TextDecoder('utf-8').decode(buf);
}

/**
 * @param {string} text
 * @param {(p:number)=>void} [onProgress] 0..1
 * @returns {{t:Int32Array,o:Float64Array,h:Float64Array,l:Float64Array,c:Float64Array,n:number,digits:number,baseSec:number,skipped:number}}
 */
export function parseCandles(text, onProgress) {
  const len = text.length;
  /* Верхня оцінка кількості рядків — щоб виділити масиви один раз. */
  let cap = 1;
  for (let i = 0; i < len; i += 1) if (text.charCodeAt(i) === 10) cap += 1;

  const t = new Int32Array(cap);
  const o = new Float64Array(cap);
  const h = new Float64Array(cap);
  const l = new Float64Array(cap);
  const c = new Float64Array(cap);
  /* Тікові обсяги (MT5: TICKVOL). Для VWAP і гістограми обсягу. */
  const v = new Float64Array(cap);
  let hasVol = false;

  let delim = null;
  let n = 0;
  let skipped = 0;
  let digits = 0;
  let sorted = true;
  /* Той самий день повторюється ~1400 разів поспіль — кешуємо. */
  let lastDayStr = '';
  let lastDay = 0;

  let pos = 0;
  let line = 0;
  const step = Math.max(1, Math.floor(cap / 50));

  while (pos < len) {
    let end = text.indexOf('\n', pos);
    if (end < 0) end = len;
    let raw = text.slice(pos, end);
    pos = end + 1;
    line += 1;
    if (onProgress && line % step === 0) onProgress(Math.min(0.99, line / cap));
    if (raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1);
    if (!raw) continue;
    if (delim === null) {
      if (!/\d/.test(raw)) { skipped += 1; continue; }
      delim = pickDelim(raw);
    }
    const f = raw.split(delim);
    if (f.length < 5) { skipped += 1; continue; }

    /* Дата + час: або в першому полі через пробіл/«T», або у двох. */
    let first = f[0].trim();
    let k;
    let dayStr;
    let tod;
    const sp = first.search(/[ T]/);
    if (sp > 0 && first.indexOf(':') > sp) {
      dayStr = first.slice(0, sp);
      tod = parseTime(first.slice(sp + 1));
      k = 1;
    } else if (f[1] && f[1].indexOf(':') >= 0) {
      dayStr = first;
      tod = parseTime(f[1]);
      k = 2;
    } else if (/^\d{9,13}$/.test(first)) {
      /* Unix-час у секундах або мілісекундах. */
      const v = +first;
      dayStr = null;
      tod = v > 1e11 ? Math.floor(v / 1000) : v;
      k = 1;
    } else {
      skipped += 1;
      continue;
    }

    let ts;
    if (dayStr === null) ts = tod;
    else {
      if (dayStr !== lastDayStr) {
        const d = parseDate(dayStr);
        if (d === null) { skipped += 1; continue; }
        lastDayStr = dayStr;
        lastDay = d;
      }
      if (tod === null) { skipped += 1; continue; }
      ts = lastDay + tod;
    }

    const so = f[k]; const sh = f[k + 1]; const sl = f[k + 2]; const sc = f[k + 3];
    const vo = +so; const vh = +sh; const vl = +sl; const vc = +sc;
    if (!(vo > 0 && vh > 0 && vl > 0 && vc > 0)) { skipped += 1; continue; }

    if (n < 3000) {
      const dd = Math.max(decimalsOf(so), decimalsOf(sh), decimalsOf(sl), decimalsOf(sc));
      if (dd > digits) digits = dd;
    }
    if (n > 0 && ts <= t[n - 1]) sorted = false;
    t[n] = ts; o[n] = vo; h[n] = Math.max(vh, vo, vc); l[n] = Math.min(vl, vo, vc); c[n] = vc;
    const vv = f[k + 4] != null ? +f[k + 4] : NaN;
    if (vv > 0) { v[n] = vv; hasVol = true; }
    n += 1;
  }

  let out = { t, o, h, l, c, v };
  if (!sorted) out = sortDedupe(out, n);
  n = out.n ?? n;

  const res = {
    t: out.t.slice(0, n), o: out.o.slice(0, n), h: out.h.slice(0, n), l: out.l.slice(0, n), c: out.c.slice(0, n),
    n, digits: Math.min(digits, 8), skipped,
  };
  if (hasVol) res.v = out.v.slice(0, n);
  res.baseSec = detectStep(res.t, n);
  if (onProgress) onProgress(1);
  return res;
}

/* Деякі експорти йдуть від нових до старих або з дублями на стику
   двох вивантажень. Сортуємо індексами й лишаємо останній з дублів. */
function sortDedupe(a, n) {
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i += 1) idx[i] = i;
  idx.sort((x, y) => a.t[x] - a.t[y] || x - y);
  const r = { t: new Int32Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n) };
  let m = 0;
  for (let j = 0; j < n; j += 1) {
    const i = idx[j];
    if (m > 0 && r.t[m - 1] === a.t[i]) m -= 1;
    r.t[m] = a.t[i]; r.o[m] = a.o[i]; r.h[m] = a.h[i]; r.l[m] = a.l[i]; r.c[m] = a.c[i]; r.v[m] = a.v[i];
    m += 1;
  }
  r.n = m;
  return r;
}

/* Таймфрейм файлу — найчастіший крок між сусідніми свічками. Медіана
   тут не годиться: у хвилинках на кожні вихідні припадає дірка. */
function detectStep(t, n) {
  const counts = new Map();
    const lim = Math.min(n, 5000);
  for (let i = n - lim + 1; i < n; i += 1) {
    const d = t[i] - t[i - 1];
    if (d > 0) counts.set(d, (counts.get(d) || 0) + 1);
  }
  let best = 60; let bestN = 0;
  counts.forEach((v, k) => { if (v > bestN) { best = k; bestN = v; } });
  return best;
}

/* «XAUUSD_M1_202301030105_202610061532.csv» → «XAUUSD». */
export function symbolFromName(name) {
  const base = String(name || '').replace(/\.[^.]+$/, '');
  const first = base.split(/[_\s]/)[0] || base;
  return first.replace(/[^A-Za-z0-9.#!-]/g, '').toUpperCase().slice(0, 24) || 'SYMBOL';
}

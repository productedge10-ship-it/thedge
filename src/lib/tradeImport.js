/* ==================================================================
   Імпорт історії угод з файлу.

   Три формати, які реально є в трейдерів:
   • звіт MT5/MT4 «Історія → Звіт → HTML» (MT5 пише його в UTF-16);
   • CSV з cTrader, TradeLocker, Match-Trader чи власної таблиці;
   • Excel — через «Зберегти як CSV» (окрема бібліотека для xlsx
     важила б більше, ніж увесь імпорт).

   Колонки впізнаємо за назвами (укр/англ, різні платформи), а не за
   позицією. Результат — однаковий список угод; у базу він іде з
   source = 'import' і external_id, тож повторний імпорт того самого
   файлу не дублює угод (унікальний індекс user_id+source+external_id).
================================================================== */

const clean = (s) => String(s ?? '').replace(/\u00a0/g, ' ').trim();
const lc = (s) => clean(s).toLowerCase();

export function decodeFile(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  /* UTF-16 без BOM: кожен другий байт нульовий. */
  let zeros = 0;
  for (let i = 1; i < Math.min(b.length, 400); i += 2) if (b[i] === 0) zeros += 1;
  if (zeros > 100) return new TextDecoder('utf-16le').decode(b);
  return new TextDecoder('utf-8').decode(b);
}

export function toNum(v) {
  let s = clean(v).replace(/[\s$€£₴]/g, '');
  if (!s) return null;
  /* «1 234,56» і «1,234.56» — обидва бувають. */
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* Дата й час з будь-чого розумного: 2026.10.14 12:30:01, 14/10/2026,
   2026-10-14T12:30, 10/14/2026 (якщо день > 12 — очевидно). */
export function parseWhen(v) {
  const s = clean(v);
  if (!s) return null;
  let m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  let y; let mo; let d; let hh; let mm; let ss;
  if (m) { [, y, mo, d, hh, mm, ss] = m; } else {
    m = s.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    let a; let b2;
    [, a, b2, y, hh, mm, ss] = m;
    /* Спершу день (так пишуть у нас і в Європі); якщо «день» > 12 у
       другій позиції — це американський формат. */
    if (Number(b2) > 12) { mo = a; d = b2; } else { d = a; mo = b2; }
  }
  const p2 = (x) => String(x).padStart(2, '0');
  return {
    date: `${y}-${p2(mo)}-${p2(d)}`,
    time: hh != null ? `${p2(hh)}:${mm}:${ss ? p2(ss) : '00'}` : null,
  };
}

const SYN = {
  symbol: ['symbol', 'item', 'instrument', 'pair', 'asset', 'market', 'ticker', 'символ', 'інструмент', 'пара', 'актив'],
  type: ['type', 'direction', 'side', 'opening direction', 'action', 'buy/sell', 'тип', 'напрям', 'напрямок'],
  open: ['open time', 'opening time', 'time', 'open date', 'entry time', 'date', 'opened', 'дата', 'час відкриття', 'відкриття'],
  close: ['close time', 'closing time', 'close date', 'exit time', 'closed', 'час закриття', 'закриття'],
  entry: ['price', 'open price', 'entry price', 'entry', 'ціна відкриття'],
  exit: ['close price', 'closing price', 'exit price', 'ціна закриття'],
  profit: ['profit', 'net profit', 'net $', 'net', 'pnl', 'p&l', 'p/l', 'net p/l', 'realized pnl', 'gross $', 'result $', 'прибуток', 'профіт', 'результат $'],
  rr: ['r', 'rr', 'r-multiple', 'r multiple', 'r:r', 'result r'],
  result: ['result', 'outcome', 'win/loss', 'результат'],
  volume: ['volume', 'size', 'lots', 'quantity', 'closing quantity', 'обсяг', 'лот'],
  sl: ['s / l', 's/l', 'sl', 'stop loss', 'stop'],
  tp: ['t / p', 't/p', 'tp', 'take profit'],
  commission: ['commission', 'комісія'],
  swap: ['swap', 'своп'],
  id: ['position', 'ticket', 'order', 'deal', 'position id', 'id', 'тікет'],
};

/* Індекси колонок за назвами. Дві «Time» і дві «Price» у звіті MT5 —
   перша про вхід, друга про вихід. */
function mapHeader(cells) {
  const h = cells.map(lc);
  const col = {};
  const used = new Set();
  const take = (key, names) => {
    for (const n of names) {
      const i = h.findIndex((x, k) => !used.has(k) && x === n);
      if (i >= 0) { col[key] = i; used.add(i); return; }
    }
  };
  take('id', SYN.id);
  take('symbol', SYN.symbol);
  take('type', SYN.type);
  take('volume', SYN.volume);
  take('sl', SYN.sl);
  take('tp', SYN.tp);
  take('commission', SYN.commission);
  take('swap', SYN.swap);
  take('profit', SYN.profit);
  take('rr', SYN.rr);
  take('close', SYN.close);
  take('exit', SYN.exit);
  take('open', SYN.open);
  take('entry', SYN.entry);
  /* Друга «time»/«price» без явного «close» — це закриття. */
  if (col.close == null) { const i = h.findIndex((x, k) => !used.has(k) && x === 'time'); if (i >= 0) { col.close = i; used.add(i); } }
  if (col.exit == null) { const i = h.findIndex((x, k) => !used.has(k) && x === 'price'); if (i >= 0) { col.exit = i; used.add(i); } }
  take('result', SYN.result);
  return col;
}

const isHeader = (col) => col.symbol != null && (col.profit != null || col.rr != null || col.result != null);

function rowToTrade(cells, col) {
  const get = (k) => (col[k] != null ? cells[col[k]] : '');
  const symbol = clean(get('symbol')).toUpperCase().replace(/\s+/g, '');
  if (!symbol || /^(BALANCE|DEPOSIT|WITHDRAWAL|CREDIT|БАЛАНС)$/.test(symbol)) return null;
  const t = lc(get('type'));
  if (/balance|deposit|withdraw|credit|баланс/.test(t)) return null;
  const dir = /sell|short|прод/.test(t) ? 'Short' : /buy|long|купів/.test(t) ? 'Long' : null;
  const whenClose = parseWhen(get('close'));
  const whenOpen = parseWhen(get('open'));
  const when = whenClose || whenOpen;
  if (!when) return null;
  const profitRaw = toNum(get('profit'));
  const comm = toNum(get('commission')) || 0;
  const swap = toNum(get('swap')) || 0;
  /* У MT5 «Profit» — без комісії й свопу; чистий результат — сума. */
  const profit = profitRaw == null ? null : Math.round((profitRaw + comm + swap) * 100) / 100;
  const rr = toNum(get('rr'));
  const res = lc(get('result'));
  return {
    id: clean(get('id')) || null,
    symbol,
    dir,
    date: when.date,
    entryTime: whenOpen?.time || null,
    exitTime: whenClose?.time || null,
    entry: toNum(get('entry')),
    exit: toNum(get('exit')),
    sl: toNum(get('sl')) || null,
    tp: toNum(get('tp')) || null,
    volume: toNum(get('volume')),
    commission: comm || null,
    swap: swap || null,
    profit,
    rr,
    resultHint: /win|тейк|profit|прибут/.test(res) ? 'Win' : /loss|lose|стоп|збит/.test(res) ? 'Lose' : /be|break|беззб/.test(res) ? 'BE' : null,
  };
}

function fromRows(rows) {
  const out = [];
  let col = null;
  for (const cells of rows) {
    const maybe = mapHeader(cells);
    if (isHeader(maybe)) { col = maybe; continue; }
    if (!col) continue;
    /* Порожній рядок або заголовок іншої секції звіту («Orders»,
       «Deals») — кінець таблиці позицій. */
    if (cells.filter((c) => clean(c)).length <= 1) {
      if (out.length && /orders|deals|ордер|угоди/i.test(cells.join(' '))) col = null;
      continue;
    }
    const tr = rowToTrade(cells, col);
    if (tr) out.push(tr);
  }
  return out;
}

export function parseHtmlReport(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const rows = [...doc.querySelectorAll('tr')].map((tr) => [...tr.children].flatMap((td) => {
    const span = Number(td.getAttribute('colspan')) || 1;
    const v = clean(td.textContent);
    /* colspan розкладаємо, щоб індекси колонок збігались із заголовком. */
    return [v, ...Array(Math.max(0, span - 1)).fill('')];
  }));
  /* У звіті MT5 після «Positions» йдуть «Orders» і «Deals» з тими ж
     назвами колонок — беремо лише першу таблицю позицій. */
  const stop = rows.findIndex((r, i) => i > 0 && /^(orders|ордери)$/i.test(clean(r.join(''))));
  return fromRows(stop > 0 ? rows.slice(0, stop) : rows);
}

export function parseCsv(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = [';', '\t', ','].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let cur = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { cur.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      cur.push(cell); rows.push(cur); cur = []; cell = '';
    } else cell += c;
  }
  if (cell || cur.length) { cur.push(cell); rows.push(cur); }
  return fromRows(rows);
}

export function parseTradesFile(name, buf) {
  const text = decodeFile(buf);
  const html = /\.html?$/i.test(name) || /<table/i.test(text.slice(0, 5000));
  return { kind: html ? 'html' : 'csv', trades: html ? parseHtmlReport(text) : parseCsv(text) };
}

/* Типовий ризик — медіана збиткових угод. Не ідеально (стоп буває
   неповний), але краще, ніж питати людину про те, чого вона не памʼятає. */
export function guessRisk(trades) {
  const losses = trades.map((t) => t.profit).filter((p) => p != null && p < 0).map((p) => -p).sort((a, b) => a - b);
  if (!losses.length) return null;
  return Math.round(losses[Math.floor(losses.length / 2)]);
}

export function toRows(trades, { account, riskUsd }) {
  return trades.map((t) => {
    let rr = t.rr;
    /* Є вхід і стоп — R з ціни, це точніше за «типовий ризик». Стоп у
       беззбитку (дистанція ~0) нічого не каже — тоді падаємо на ризик. */
    if (rr == null && t.entry && t.exit && t.sl && t.dir) {
      const dist = t.dir === 'Short' ? t.sl - t.entry : t.entry - t.sl;
      const move = t.dir === 'Short' ? t.entry - t.exit : t.exit - t.entry;
      if (dist > Math.abs(t.entry) * 0.00005) rr = Math.round((move / dist) * 100) / 100;
    }
    if (rr == null && t.profit != null && riskUsd > 0) rr = Math.round((t.profit / riskUsd) * 100) / 100;
    let result = t.resultHint;
    if (!result) {
      const v = t.profit ?? rr;
      result = v == null ? 'BE' : v > 0 ? 'Win' : v < 0 ? 'Lose' : 'BE';
    }
    const ext = t.id ? `${t.symbol}:${t.id}` : `${t.date}T${t.exitTime || t.entryTime || ''}:${t.symbol}:${t.dir || ''}:${t.profit ?? rr ?? ''}`;
    return {
      source: 'import',
      external_id: ext.slice(0, 200),
      plan_date: t.date,
      plan_pair: t.symbol,
      account_name: account || null,
      type: t.dir || 'Long',
      result,
      rr: rr == null ? null : Math.abs(rr),
      risk: riskUsd > 0 ? `$${riskUsd}` : null,
      risk_money: riskUsd > 0 ? riskUsd : null,
      profit_money: t.profit,
      entry_time: t.entryTime,
      exit_time: t.exitTime,
      entry_price: t.entry,
      exit_price: t.exit,
      sl_price: t.sl,
      tp_price: t.tp,
      volume: t.volume,
      commission: t.commission,
      swap: t.swap,
    };
  });
}

import { t as tx } from './lang';
import { sessionMeta } from './backtestMode';
import { pairOf } from './backtestStats';
import { mistakeLabel } from './backtestTags';

/* ==================================================================
   Експорт угод бектесту в CSV і Excel (.xlsx).

   .xlsx збираємо самі, без бібліотек: це zip з кількох XML-файлів.
   Стискати не обов'язково — Excel відкриває і «stored»-архів, а
   кілька сотень угод важать десятки кілобайт.
================================================================== */

const meta = (t) => (t && typeof t.tda_data === 'object' && t.tda_data) || {};

const signedR = (t) => {
  const c = meta(t).chart;
  if (c && Number.isFinite(c.r)) return c.r;
  const rr = Math.abs(Number(t.rr) || 0);
  return t.result === 'LOSS' ? -rr : t.result === 'BE' ? 0 : rr;
};

/* Ціна без хвоста з плаваючої коми (3303.3085714285717 → 3303.30857). */
const px = (v) => (Number.isFinite(v) ? Number(v.toFixed(5)) : null);

const pad = (n) => String(n).padStart(2, '0');
/* Час з графіка — секунди в часі брокера (як на графіку). */
const fmtDT = (sec) => {
  if (!Number.isFinite(sec)) return '';
  const d = new Date(sec * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

const REASON = { sl: ['Стоп', 'Stop'], tp: ['Тейк', 'Target'], manual: ['Вручну', 'Manual'] };
const RESULT = { WIN: ['Прибуток', 'Win'], LOSS: ['Збиток', 'Loss'], BE: ['Беззбиток', 'Breakeven'] };
const SYSTEM_TAGS = new Set(['Реальний графік', 'Real chart']);

/* Рядки для таблиці: однаково для угод з графіка й записаних вручну. */
export function exportRows(session, trades) {
  const { settings } = sessionMeta(session);
  const balance0 = Number(session?.initial_balance) || 10000;
  const riskPct = Number(settings?.riskPct) > 0 ? Number(settings.riskPct) : 1;
  let bal = balance0;
  return trades.map((t, i) => {
    const m = meta(t);
    const c = m.chart || null;
    const r = signedR(t);
    const usd = (balance0 * riskPct / 100) * r;
    bal += usd;
    const setups = (m.tags || []).filter((x) => !SYSTEM_TAGS.has(x));
    return {
      n: i + 1,
      entryT: c?.entry_time ?? null,
      exitT: c?.exit_time ?? null,
      date: t.date || '',
      pair: pairOf(t, session?.pair),
      side: t.type === 'LONG' ? 'Buy' : t.type === 'SHORT' ? 'Sell' : (t.type || ''),
      tf: c?.tf || '',
      session: m.session || '',
      entry: px(c?.entry),
      sl: px(c?.sl),
      tp: px(c?.tp),
      exit: px(c?.exit),
      reason: c?.exit_reason ? tx(...(REASON[c.exit_reason] || [c.exit_reason, c.exit_reason])) : '',
      r: Math.round(r * 100) / 100,
      result: RESULT[t.result] ? tx(...RESULT[t.result]) : (t.result || ''),
      usd: Math.round(usd * 100) / 100,
      balance: Math.round(bal * 100) / 100,
      minutes: c?.entry_time && c?.exit_time ? Math.round((c.exit_time - c.entry_time) / 60) : null,
      setups: setups.join(', '),
      emotions: (m.emotions || []).join(', '),
      mistakes: (m.mistakes || []).map((x) => mistakeLabel?.(x) || x).join(', '),
      note: t.notes || '',
    };
  });
}

const COLS = [
  ['n', '№', '#', 5],
  ['open', 'Вхід (час)', 'Entry time', 17],
  ['close', 'Вихід (час)', 'Exit time', 17],
  ['pair', 'Інструмент', 'Symbol', 11],
  ['side', 'Напрямок', 'Side', 9],
  ['tf', 'ТФ', 'TF', 6],
  ['session', 'Сесія', 'Session', 11],
  ['entry', 'Ціна входу', 'Entry', 11],
  ['sl', 'Стоп', 'Stop', 11],
  ['tp', 'Тейк', 'Target', 11],
  ['exit', 'Ціна виходу', 'Exit', 11],
  ['reason', 'Закрито', 'Closed by', 10],
  ['r', 'R', 'R', 8],
  ['result', 'Результат', 'Result', 11],
  ['usd', 'Прибуток, $', 'P&L, $', 12],
  ['balance', 'Баланс, $', 'Balance, $', 12],
  ['minutes', 'Тривалість, хв', 'Duration, min', 13],
  ['setups', 'Сетапи', 'Setups', 20],
  ['emotions', 'Емоції', 'Emotions', 18],
  ['mistakes', 'Помилки', 'Mistakes', 22],
  ['note', 'Нотатка', 'Note', 40],
];

const cellOf = (row, key) => {
  if (key === 'open') return row.entryT != null ? fmtDT(row.entryT) : row.date;
  if (key === 'close') return row.exitT != null ? fmtDT(row.exitT) : '';
  const v = row[key];
  return v == null ? '' : v;
};

const fileName = (session, ext) => {
  const base = String(session?.name || 'backtest').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'backtest';
  return `${base}.${ext}`;
};

const download = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/* ---------------- CSV ---------------- */

export function exportCsv(session, trades) {
  const rows = exportRows(session, trades);
  const esc = (v) => {
    const s = String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLS.map(([, uk, en]) => esc(tx(uk, en))).join(',')];
  rows.forEach((r) => lines.push(COLS.map(([k]) => esc(cellOf(r, k))).join(',')));
  /* BOM — щоб Excel одразу прочитав кирилицю. */
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName(session, 'csv'));
}

/* ---------------- XLSX ---------------- */

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const colName = (i) => { let s = ''; let n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/* Стилі: 0 — звичайний, 1 — жирний заголовок, 2 — число 0.00, 3 — дата й час,
   4 — зелене число, 5 — червоне число. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF089981"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FFF23645"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2A2E39"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(header, body, widths, freeze = true) {
  const cell = (ref, v, style = 0) => {
    if (v === '' || v == null) return style ? `<c r="${ref}" s="${style}"/>` : '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const rows = [];
  rows.push(`<row r="1">${header.map((h, i) => cell(`${colName(i)}1`, h, 1)).join('')}</row>`);
  body.forEach((r, ri) => {
    const n = ri + 2;
    rows.push(`<row r="${n}">${r.map((c, i) => (c && typeof c === 'object' ? cell(`${colName(i)}${n}`, c.v, c.s) : cell(`${colName(i)}${n}`, c))).join('')}</row>`);
  });
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const pane = freeze ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
  const af = freeze && body.length ? `<autoFilter ref="A1:${colName(header.length - 1)}${body.length + 1}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>${af}</worksheet>`;
}

/* Мінімальний zip без стиснення (метод «stored»). */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i += 1) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function zip(files) {
  const enc = new TextEncoder();
  const parts = []; const central = []; let offset = 0;
  files.forEach(({ name, data }) => {
    const nm = enc.encode(name);
    const body = typeof data === 'string' ? enc.encode(data) : data;
    const crc = crc32(body);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, body.length, true); lh.setUint32(22, body.length, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nm, body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, body.length, true);
    ch.setUint16(28, nm.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nm);
    offset += 30 + nm.length + body.length;
  });
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const excelDate = (sec) => sec / 86400 + 25569;

export function exportXlsx(session, trades) {
  const rows = exportRows(session, trades);
  const NUM = new Set(['entry', 'sl', 'tp', 'exit']);
  const body = rows.map((r) => COLS.map(([k]) => {
    if (k === 'open') return r.entryT != null ? { v: excelDate(r.entryT), s: 3 } : r.date;
    if (k === 'close') return r.exitT != null ? { v: excelDate(r.exitT), s: 3 } : '';
    if (k === 'r' || k === 'usd') return { v: r[k], s: r[k] > 0 ? 4 : r[k] < 0 ? 5 : 2 };
    if (k === 'balance') return { v: r.balance, s: 2 };
    if (NUM.has(k)) return r[k] == null ? '' : r[k];
    return r[k] == null ? '' : r[k];
  }));
  const header = COLS.map(([, uk, en]) => tx(uk, en));
  const widths = COLS.map((c) => c[3]);

  /* Другий аркуш — підсумок. */
  const wins = rows.filter((r) => r.r > 0).length;
  const losses = rows.filter((r) => r.r < 0).length;
  const net = rows.reduce((a, r) => a + r.r, 0);
  const gw = rows.filter((r) => r.r > 0).reduce((a, r) => a + r.r, 0);
  const gl = Math.abs(rows.filter((r) => r.r < 0).reduce((a, r) => a + r.r, 0));
  let eq = 0; let peak = 0; let dd = 0;
  rows.forEach((r) => { eq += r.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); });
  const summary = [
    [tx('Бектест', 'Backtest'), session?.name || ''],
    [tx('Інструмент', 'Symbol'), session?.pair || ''],
    [tx('Стратегія', 'Strategy'), session?.strategy_name || ''],
    [tx('Стартовий баланс, $', 'Starting balance, $'), Number(session?.initial_balance) || 10000],
    [tx('Угод', 'Trades'), rows.length],
    [tx('Прибуткових', 'Wins'), wins],
    [tx('Збиткових', 'Losses'), losses],
    ['Win rate, %', wins + losses ? Math.round((wins / (wins + losses)) * 1000) / 10 : ''],
    [tx('Разом, R', 'Net, R'), { v: Math.round(net * 100) / 100, s: net >= 0 ? 4 : 5 }],
    ['Profit factor', gl > 0 ? Math.round((gw / gl) * 100) / 100 : ''],
    [tx('Макс. просідання, R', 'Max drawdown, R'), Math.round(dd * 100) / 100],
    [tx('Кінцевий баланс, $', 'Final balance, $'), rows.length ? { v: rows[rows.length - 1].balance, s: 2 } : (Number(session?.initial_balance) || 10000)],
  ];

  const sheets = [
    { name: tx('Угоди', 'Trades'), xml: sheetXml(header, body, widths) },
    { name: tx('Підсумок', 'Summary'), xml: sheetXml([tx('Показник', 'Metric'), tx('Значення', 'Value')], summary, [28, 22], false) },
  ];
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${xmlEsc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xmlEsc(sheets[0].name)}'!$A$1:$${colName(COLS.length - 1)}$${rows.length + 1}</definedName></definedNames>` : ''}</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sh.xml })),
  ];
  download(zip(files), fileName(session, 'xlsx'));
}

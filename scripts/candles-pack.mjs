#!/usr/bin/env node
/* ==================================================================
   Пакує експорт барів MT5 (CSV, M1) у файли для сервера свічок EDGE.

     node scripts/candles-pack.mjs "D:\export\EURUSD_M1_2019....csv"
     node scripts/candles-pack.mjs GER40.csv DE40          ← своя назва на сайті
     node scripts/candles-pack.mjs a.csv b.csv c.csv        ← кілька одразу

   Результат — тека candles-out\v1\ поруч із проєктом:
     v1\symbols.json, v1\<SYM>\manifest.json, v1\<SYM>\M1\<YYYY-MM>.bin
   Її вміст перетягуєш у бакет edge-candles (Cloudflare → R2 → Objects),
   щоб у бакеті вийшло v1/... Повторний запуск оновлює лише змінене,
   решту лишає.

   Формат той самий, що пише VPS (vps/candles/edge_candles.py).
   Тека candles-out — у .gitignore: це дані брокера, не код.
================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { decodeBuffer, parseCandles, symbolFromName } from '../src/lib/candles/parseCsv.js';

const OUT = path.resolve(process.env.CANDLES_OUT || 'candles-out', 'v1');
const safeKey = (s) => s.replace(/[^A-Za-z0-9._-]/g, '_');

function monthOf(sec) {
  const d = new Date(sec * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function encode(set, a, b, digits) {
  const n = b - a;
  const k = 10 ** digits;
  const P = (x) => Math.round(x * k);
  const head = Buffer.alloc(32);
  head.write('EDG1', 0, 'latin1');
  head.writeUInt8(1, 4);
  head.writeUInt8(digits, 5);
  head.writeUInt16LE(set.v ? 1 : 0, 6);
  head.writeUInt32LE(n, 8);
  head.writeInt32LE(set.t[a], 12);
  const p0 = P(set.o[a]);
  head.writeInt32LE(p0, 16);
  const cols = Array.from({ length: 6 }, () => new Int32Array(n));
  let pt = set.t[a]; let pc = p0;
  for (let i = 0; i < n; i += 1) {
    const j = a + i;
    const o = P(set.o[j]); const h = P(set.h[j]); const l = P(set.l[j]); const c = P(set.c[j]);
    cols[0][i] = Math.round((set.t[j] - pt) / 60);
    cols[1][i] = c - pc;
    cols[2][i] = o - pc;
    cols[3][i] = h - Math.max(o, c);
    cols[4][i] = Math.min(o, c) - l;
    cols[5][i] = set.v ? Math.round(set.v[j]) : 0;
    pt = set.t[j]; pc = c;
  }
  const body = Buffer.concat([head, ...cols.map((x) => Buffer.from(x.buffer))]);
  return zlib.gzipSync(body, { level: 9 });
}

function pack(file, name) {
  const t0 = Date.now();
  const buf = fs.readFileSync(file);
  const text = decodeBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const set = parseCandles(text);
  if (!set.n) throw new Error(`${file}: не знайшов жодної свічки`);
  if (set.baseSec !== 60) throw new Error(`${file}: це не M1 (крок ${set.baseSec} с). Експортуй бари саме M1.`);
  const sym = name || symbolFromName(path.basename(file));
  const digits = set.digits;
  const dir = path.join(OUT, safeKey(sym));
  fs.mkdirSync(path.join(dir, 'M1'), { recursive: true });
  const mPath = path.join(dir, 'manifest.json');
  const man = fs.existsSync(mPath)
    ? JSON.parse(fs.readFileSync(mPath, 'utf8'))
    : { v: 1, symbol: sym, broker: sym, digits, baseSec: 60, hasVol: !!set.v, months: {}, historyStart: null };
  man.core = true;
  man.digits = digits;
  let a = 0; let written = 0; let bytes = 0;
  while (a < set.n) {
    const ym = monthOf(set.t[a]);
    let b = a;
    while (b < set.n && monthOf(set.t[b]) === ym) b += 1;
    const info = { n: b - a, from: set.t[a], to: set.t[b - 1] };
    const old = man.months[ym];
    /* Той самий місяць з тими самими межами — не перезаписуємо: так
       після повторного запуску в бакет треба кидати лише нове. */
    if (!old || old.n !== info.n || old.to !== info.to || !fs.existsSync(path.join(dir, 'M1', `${ym}.bin`))) {
      const blob = encode(set, a, b, digits);
      fs.writeFileSync(path.join(dir, 'M1', `${ym}.bin`), blob);
      man.months[ym] = { ...info, bytes: blob.length };
      written += 1; bytes += blob.length;
    }
    a = b;
  }
  const keys = Object.keys(man.months).sort();
  man.first = man.months[keys[0]].from;
  man.last = man.months[keys.at(-1)].to;
  man.updated = Math.floor(Date.now() / 1000);
  fs.writeFileSync(mPath, JSON.stringify(man));
  console.log(`${sym}: ${set.n.toLocaleString('uk-UA')} свічок, ${keys.length} міс. (${keys[0]} — ${keys.at(-1)}), нових/змінених файлів: ${written}, ${(bytes / 1e6).toFixed(1)} МБ, ${((Date.now() - t0) / 1000).toFixed(1)} с`);
}

function catalog() {
  const core = [];
  for (const d of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const p = path.join(OUT, d.name, 'manifest.json');
    if (!fs.existsSync(p)) continue;
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    core.push({ symbol: m.symbol, broker: m.broker, digits: m.digits, first: m.first, last: m.last });
  }
  core.sort((x, y) => x.symbol.localeCompare(y.symbol));
  /* Якщо VPS уже веде каталог «на запит» — не затираємо його список. */
  const sp = path.join(OUT, 'symbols.json');
  const prev = fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : {};
  fs.writeFileSync(sp, JSON.stringify({ v: 1, updated: Math.floor(Date.now() / 1000), core, onDemand: prev.onDemand || [] }));
  console.log(`symbols.json: ${core.map((c) => c.symbol).join(', ')}`);
}

const args = process.argv.slice(2);
if (!args.length) {
  console.log('node scripts/candles-pack.mjs <файл.csv> [НАЗВА] [<файл2.csv> [НАЗВА2] ...]');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
for (let i = 0; i < args.length; i += 1) {
  const file = args[i];
  const next = args[i + 1];
  const name = next && !/\.(csv|txt)$/i.test(next) ? next : null;
  if (name) i += 1;
  try { pack(file, name); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
catalog();
console.log(`\nГотово: ${OUT}\nПеретягни вміст теки candles-out у бакет edge-candles (щоб у бакеті була тека v1).`);

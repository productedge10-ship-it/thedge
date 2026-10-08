#!/usr/bin/env node
/* ==================================================================
   Заливає теку candles-out\v1 у бакет Cloudflare R2 через wrangler
   (дашборд приймає лише 100 файлів за раз, а їх сотні).

     npx wrangler login                    ← один раз, відкриє браузер
     node scripts/candles-upload.mjs        ← залити все
     node scripts/candles-upload.mjs EURUSD ← лише один інструмент

   Вже залиті файли не пропускаються — просто перезаписуються. Ключі
   нікуди не вводяться: вхід іде через браузер.
================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BUCKET = process.env.R2_BUCKET || 'edge-candles';
const ROOT = path.resolve(process.env.CANDLES_OUT || 'candles-out', 'v1');
const only = process.argv[2] || null;
const PAR = 4;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

if (!fs.existsSync(ROOT)) { console.error(`Немає теки ${ROOT}. Спершу запусти candles-pack.mjs`); process.exit(1); }
let files = walk(ROOT);
if (only) files = files.filter((f) => path.relative(ROOT, f).split(path.sep)[0] === only || path.basename(f) === 'symbols.json');
/* Спершу місяці, наприкінці маніфести й каталог: сайт не побачить
   інструмент, поки не залито всі його файли. */
const weight = (f) => (f.endsWith('.bin') ? 0 : f.endsWith('manifest.json') ? 1 : 2);
files.sort((a, b) => weight(a) - weight(b) || a.localeCompare(b));

const run = (f) => new Promise((resolve) => {
  const key = `v1/${path.relative(ROOT, f).split(path.sep).join('/')}`;
  const type = f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
  const args = ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', f, '--content-type', type, '--remote'];
  const p = spawn('npx', args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stdout.on('data', (d) => { err += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => resolve({ key, ok: code === 0, err }));
});

let done = 0; let bad = 0; let next = 0;
async function worker() {
  while (next < files.length) {
    const f = files[next]; next += 1;
    const r = await run(f);
    done += 1;
    if (!r.ok) { bad += 1; console.error(`\nПОМИЛКА ${r.key}\n${r.err.split('\n').slice(-6).join('\n')}`); }
    process.stdout.write(`\r${done}/${files.length}${bad ? `  помилок: ${bad}` : ''}   `);
  }
}
console.log(`Заливаю ${files.length} файлів у ${BUCKET}...`);
await Promise.all(Array.from({ length: PAR }, worker));
console.log(`\n${bad ? `Готово, але з помилками: ${bad}. Запусти ще раз — залиється лише те, що не пройшло.` : 'Готово. Перевір symbols.json у браузері.'}`);
process.exitCode = bad ? 1 : 0;

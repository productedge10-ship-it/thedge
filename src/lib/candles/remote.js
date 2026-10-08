import { supabase } from '../supabase';

/* ==================================================================
   Свічки з сервера EDGE (Cloudflare R2), а не з CSV трейдера.

   На R2 лежить:
     v1/symbols.json              — основні інструменти + решта брокера
     v1/<SYM>/manifest.json       — які місяці є, скільки свічок, digits
     v1/<SYM>/M1/<YYYY-MM>.bin    — місяць хвилинок, gzip (≈150–250 КБ)

   Відкриваємо інструмент — беремо лише останні кілька місяців. Старші
   довантажуються, коли трейдер гортає вліво. Місяць, раз скачаний,
   лежить у браузері (IndexedDB) і вдруге не тягнеться.

   Інструменти «на запит» (усе, крім основних): місяців ще немає —
   ставимо їх у чергу (RPC request_candles), VPS бере з MT5, кладе в R2,
   а ми чекаємо, поки місяць зʼявиться в маніфесті.

   Формат файлу описано в vps/candles/edge_candles.py.
================================================================== */

import { BETA_EMAILS } from '../betaAccess';

/* Публічна адреса бакета — не секрет: файли й так віддаються всім, хто
   знає шлях. Змінна оточення — щоб перейти на свій домен без правок. */
const BASE = (import.meta.env?.VITE_CANDLES_URL || 'https://pub-932a35494e194b20b15d06a26ba51abd.r2.dev/v1').replace(/\/$/, '');
export const remoteEnabled = !!BASE;

/* Поки сервер свічок у бета — бачать лише ці акаунти. */
const BETA = (import.meta.env?.VITE_CANDLES_BETA || BETA_EMAILS.join(',')).toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
export const remoteAllowed = (email) => remoteEnabled && (BETA.includes('*') || BETA.includes(String(email || '').toLowerCase()));
export const REMOTE_PREFIX = 'srv:';
export const isRemote = (sym) => typeof sym === 'string' && sym.startsWith(REMOTE_PREFIX);
export const remoteName = (sym) => (isRemote(sym) ? sym.slice(REMOTE_PREFIX.length) : sym);

const safeKey = (name) => name.replace(/[^A-Za-z0-9._-]/g, '_');

/* ---------------- місяці ---------------- */

export function monthOf(sec) {
  const d = new Date(sec * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function shiftMonth(ym, d) {
  const m = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + d;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
}
export const thisMonth = () => monthOf(Date.now() / 1000);

/* ---------------- мережа ---------------- */

async function getJson(path, fresh = false) {
  const r = await fetch(`${BASE}/${path}${fresh ? `?ts=${Date.now()}` : ''}`, { cache: fresh ? 'no-store' : 'default' });
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* Каталог і маніфести: однакові запити, що летять одночасно (сторінка
   й календар, прогрів зі списку бектестів), склеюємо в один, а свіжу
   відповідь тримаємо кілька секунд — відкриття графіка не чекає на
   другий такий самий запит. */
const memo = new Map();
const MEMO_MS = 15000;
function fresh(path) {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.p;
  const p = getJson(path, true);
  memo.set(path, { at: Date.now(), p });
  p.catch(() => memo.delete(path));
  return p;
}

export async function getCatalog() {
  if (!BASE) return null;
  try { return await fresh('symbols.json'); } catch { return null; }
}

export const getManifest = (name) => fresh(`${safeKey(name)}/manifest.json`);

/* Маніфест міг устигнути застаріти (сервер дописав місяць) — коли ми
   саме чекаємо на нові місяці, питаємо без кешу. */
const getManifestNow = (name) => getJson(`${safeKey(name)}/manifest.json`, true);

/* Прогріти інструмент заздалегідь (зі списку бектестів): маніфест і
   останні місяці лягають у кеш браузера, і графік потім відкривається
   майже миттєво. Тихо, без помилок. */
export async function warmSymbol(name, monthsCount = 4) {
  try {
    const m = await getManifest(name);
    if (!m?.months) return;
    const months = Object.keys(m.months).sort().slice(-monthsCount);
    await Promise.all(months.map((ym) => loadMonth(name, ym, m.months[ym]).catch(() => null)));
  } catch { /* не страшно */ }
}

/* ---------------- кеш у браузері ---------------- */

function openCache() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no idb')); return; }
    const req = indexedDB.open('edge_remote_candles', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('m');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
let cacheP = null;
const cache = () => { cacheP = cacheP || openCache().catch(() => null); return cacheP; };

async function cacheGet(key) {
  const db = await cache();
  if (!db) return null;
  return new Promise((res) => {
    const r = db.transaction('m').objectStore('m').get(key);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => res(null);
  });
}
async function cachePut(key, val) {
  const db = await cache();
  if (!db) return;
  await new Promise((res) => {
    const t = db.transaction('m', 'readwrite');
    t.objectStore('m').put(val, key);
    t.oncomplete = res; t.onerror = res; t.onabort = res;
  });
}

/* ---------------- формат ---------------- */

async function gunzip(buf) {
  const u = new Uint8Array(buf);
  /* Якщо CDN уже розпакував (Content-Encoding: gzip) — заголовок EDG1. */
  if (u[0] === 0x45 && u[1] === 0x44 && u[2] === 0x47 && u[3] === 0x31) return buf;
  const ds = new DecompressionStream('gzip');
  return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
}

export function decodeMonth(raw) {
  const dv = new DataView(raw);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'EDG1' || dv.getUint8(4) !== 1) throw new Error('bad candle file');
  const digits = dv.getUint8(5);
  const n = dv.getUint32(8, true);
  let t = dv.getInt32(12, true);
  let pc = dv.getInt32(16, true);
  /* Вирівнювання: дані з 32-го байта, кратно 4 — можна без DataView. */
  const col = (j) => new Int32Array(raw, 32 + j * n * 4, n);
  const dt = col(0); const dc = col(1); const od = col(2); const hu = col(3); const ld = col(4); const vol = col(5);
  const k = 10 ** digits;
  const T = new Int32Array(n); const O = new Float64Array(n); const H = new Float64Array(n);
  const L = new Float64Array(n); const C = new Float64Array(n); const V = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    t += dt[i] * 60;
    const c = pc + dc[i];
    const o = pc + od[i];
    const hi = (o > c ? o : c) + hu[i];
    const lo = (o < c ? o : c) - ld[i];
    T[i] = t; O[i] = o / k; H[i] = hi / k; L[i] = lo / k; C[i] = c / k; V[i] = vol[i];
    pc = c;
  }
  return { n, digits, t: T, o: O, h: H, l: L, c: C, v: V };
}

/* Місяць: з кешу браузера, якщо там та сама версія (час останньої
   свічки з маніфесту), інакше з R2. */
async function loadMonth(name, ym, info) {
  const key = `${name}/${ym}`;
  const ver = info.to;
  const hit = await cacheGet(key);
  if (hit && hit.ver === ver) return decodeMonth(await gunzip(hit.buf));
  const r = await fetch(`${BASE}/${safeKey(name)}/M1/${ym}.bin?v=${ver}`);
  if (!r.ok) throw new Error(`${name} ${ym}: HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  cachePut(key, { ver, buf });
  return decodeMonth(await gunzip(buf));
}

/* Кілька місяців → один набір у форматі, який розуміє графік
   (той самий, що дає імпорт CSV). */
export async function loadMonths(name, manifest, months) {
  const parts = [];
  const list = months.filter((ym) => manifest.months[ym]).sort();
  /* Паралельно, але не більше 4 за раз — щоб не душити мобільний. */
  for (let i = 0; i < list.length; i += 4) {
    const chunk = await Promise.all(list.slice(i, i + 4).map((ym) => loadMonth(name, ym, manifest.months[ym])));
    parts.push(...chunk);
  }
  return joinParts(parts, manifest, name);
}

function joinParts(parts, manifest, name) {
  const n = parts.reduce((s, p) => s + p.n, 0);
  const out = {
    symbol: name, digits: manifest.digits, baseSec: 60, n, remote: true,
    t: new Int32Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n),
  };
  let at = 0;
  parts.forEach((p) => {
    out.t.set(p.t, at); out.o.set(p.o, at); out.h.set(p.h, at); out.l.set(p.l, at); out.c.set(p.c, at); out.v.set(p.v, at);
    at += p.n;
  });
  return out;
}

/* Скільки місяців тягнути при відкритті й за один крок гортання. */
export const FIRST_MONTHS = 4;
export const STEP_MONTHS = 3;

/* Місяці перед `fromYm`, які ще варто просити. null — історії далі
   немає (або маніфест знає, що вона починається пізніше). */
export function olderMonths(manifest, fromYm, count = STEP_MONTHS) {
  const out = [];
  for (let i = 1; i <= count; i += 1) {
    const ym = shiftMonth(fromYm, -i);
    if (manifest.historyStart && ym < manifest.historyStart) break;
    if (manifest.core && !manifest.months[ym]) {
      /* Основні завантажені наперед: дірка = початок історії. */
      const any = Object.keys(manifest.months).some((k) => k < ym);
      if (!any) break;
      continue;
    }
    out.push(ym);
  }
  return out;
}

/* ---------------- черга на сервері ---------------- */

export async function requestMonths(name, months) {
  if (!months.length) return;
  const { error } = await supabase.rpc('request_candles', { p_symbol: name, p_months: months });
  if (error) throw new Error(error.message);
}

/* Чекаємо, поки VPS покладе місяці в R2. Повертає свіжий маніфест.
   Місяць «готовий», якщо він у маніфесті або лівіше historyStart. */
export async function waitMonths(name, months, { timeoutMs = 120000, onTick } = {}) {
  const t0 = Date.now();
  let m = null;
  for (;;) {
    m = await getManifestNow(name).catch(() => null);
    const ready = (ym) => m && (m.months[ym] || (m.historyStart && ym < m.historyStart));
    if (m && months.every(ready)) return m;
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout');
    onTick?.(Date.now() - t0);
    await new Promise((r) => setTimeout(r, 2500));
  }
}

/* Відкрити інструмент: маніфест + останні місяці. Для «на запит» —
   спершу попросити сервер. */
export async function openRemote(name, { onStatus } = {}) {
  let m = await getManifest(name).catch(() => null);
  const cur = thisMonth();
  const want = Array.from({ length: FIRST_MONTHS }, (_, i) => shiftMonth(cur, -i)).reverse();
  const missing = want.filter((ym) => !(m && m.months[ym]) && !(m?.historyStart && ym < m.historyStart));
  /* Поточний місяць основних оновлює сам VPS — не просимо. Для решти
     просимо все, чого бракує, плюс поточний (щоб був свіжий). */
  if (!m || (!m.core && missing.length)) {
    onStatus?.('request');
    await requestMonths(name, m ? [...new Set([...missing, cur])] : want);
    m = await waitMonths(name, want, { onTick: () => onStatus?.('wait') });
  }
  const have = Object.keys(m.months).sort();
  if (!have.length) throw new Error('no_history');
  /* Останні FIRST_MONTHS місяців, які реально є. */
  const months = have.slice(-FIRST_MONTHS);
  const set = await loadMonths(name, m, months);
  return { set, manifest: m, months };
}

/* Догрузити старші місяці перед уже відкритими. */
export async function loadOlder(name, manifest, firstLoadedYm, { onStatus, count } = {}) {
  let m = manifest;
  const want = olderMonths(m, firstLoadedYm, count);
  if (!want.length) return { set: null, manifest: m, months: [] };
  const missing = want.filter((ym) => !m.months[ym]);
  if (missing.length && !m.core) {
    onStatus?.('request');
    await requestMonths(name, missing);
    m = await waitMonths(name, missing, { onTick: () => onStatus?.('wait') });
  }
  const months = want.filter((ym) => m.months[ym]).sort();
  if (!months.length) return { set: null, manifest: m, months: [] };
  return { set: await loadMonths(name, m, months), manifest: m, months };
}

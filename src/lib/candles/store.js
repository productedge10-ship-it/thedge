import { symbolFromName } from './parseCsv';

/* ==================================================================
   Свічки трейдера — у його ж браузері (IndexedDB), не на сервері.

   Чому так:
   • це дані брокера, який дав їх саме цій людині — роздавати їх
     іншим з нашого сервера ми не маємо права;
   • три роки хвилинок по одному інструменту — це ~45 МБ, і тягнути
     їх щоразу з мережі було б і повільно, і дорого.

   База окрема для кожного акаунта (id в імені): інший вхід на тому
   самому компʼютері не побачить чужих файлів. Список інструментів
   лежить окремо від самих масивів, щоб меню відкривалось миттєво, не
   піднімаючи з диска десятки мегабайтів.
================================================================== */

const VERSION = 1;

function open(uid) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB недоступний')); return; }
    const req = indexedDB.open(`edge_candles_${uid || 'anon'}`, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'symbol' });
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data', { keyPath: 'symbol' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
    out = fn(t);
  });
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function listSets(uid) {
  try {
    const db = await open(uid);
    const t = db.transaction('meta', 'readonly');
    const all = await reqP(t.objectStore('meta').getAll());
    db.close();
    return all.sort((a, b) => a.symbol.localeCompare(b.symbol));
  } catch { return []; }
}

export async function loadSet(uid, symbol) {
  const db = await open(uid);
  const t = db.transaction('data', 'readonly');
  const rec = await reqP(t.objectStore('data').get(symbol));
  db.close();
  return rec || null;
}

export async function saveSet(uid, set) {
  const db = await open(uid);
  const meta = {
    symbol: set.symbol, n: set.n, digits: set.digits, baseSec: set.baseSec,
    from: set.t[0], to: set.t[set.n - 1], importedAt: Date.now(), fileName: set.fileName || '', hasVol: !!set.v,
  };
  await tx(db, ['meta', 'data'], 'readwrite', (t) => {
    t.objectStore('meta').put(meta);
    t.objectStore('data').put({ ...meta, t: set.t, o: set.o, h: set.h, l: set.l, c: set.c, ...(set.v ? { v: set.v } : {}) });
  });
  db.close();
  return meta;
}

export async function deleteSet(uid, symbol) {
  const db = await open(uid);
  await tx(db, ['meta', 'data'], 'readwrite', (t) => {
    t.objectStore('meta').delete(symbol);
    t.objectStore('data').delete(symbol);
  });
  db.close();
}

/* Розбір у воркері: 80 МБ тексту в головному потоці підвісили б
   вкладку на кілька секунд без жодного руху на екрані. */
export function parseFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./parse.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m.p);
      else if (m.type === 'done') { w.terminate(); resolve({ ...m.set, symbol: symbolFromName(file.name), fileName: file.name }); }
      else if (m.type === 'error') { w.terminate(); reject(new Error(m.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'worker error')); };
    w.postMessage({ file });
  });
}

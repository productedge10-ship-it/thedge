/* ==================================================================
   Прапори валют.

   Джерело те саме, що в модалці вибору активу — flagcdn.com. Але тут
   умови інші: там прапорів на екрані десяток, а в календарі новин їх
   сімдесят, і при кожній зміні фільтра браузер заново перебирає ті
   самі десять файлів.

   Тому картинка кешується як data-URL у localStorage. Після першого
   візиту прапори зʼявляються миттєво й працюють без мережі, а CDN
   більше не смикається взагалі.

   Чому не покластись на HTTP-кеш браузера: він є, але він не
   гарантований — його чистять, він має свій строк, і в приватному
   вікні його фактично немає. Десять маленьких SVG у localStorage
   коштують кілька кілобайт і знімають питання назавжди.
================================================================== */

/* Коди країн за ISO. Валюти саме ті, що трапляються у фіді
   ForexFactory; CNH і CNY — одна країна, різні ринки. */
export const CCY_FLAG = {
  USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', AUD: 'au',
  CAD: 'ca', CHF: 'ch', NZD: 'nz', CNY: 'cn', CNH: 'cn',
  HKD: 'hk', SGD: 'sg', MXN: 'mx', NOK: 'no', SEK: 'se',
  DKK: 'dk', ZAR: 'za', TRY: 'tr', PLN: 'pl', INR: 'in',
  BRL: 'br', KRW: 'kr',
};

const KEY = 'edge_flags_v1';
const cdn = (code) => `https://flagcdn.com/${code}.svg`;

/* ---------- сховище ---------- */

const mem = new Map();

try {
  const raw = localStorage.getItem(KEY);
  if (raw) Object.entries(JSON.parse(raw)).forEach(([k, v]) => mem.set(k, v));
} catch { /* зіпсований або недоступний — просто почнемо з порожнього */ }

const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(mem)));
  } catch { /* переповнення чи приватний режим — кеш лишається в памʼяті */ }
};

/* ---------- підписка ----------

   useSyncExternalStore замість setState в ефекті: кеш — це зовнішнє
   сховище, і React має саме такий інструмент для нього. Заразом не
   доводиться будити зайвий рендер у кожному з сімдесяти рядків. */
let version = 0;
const listeners = new Set();

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getVersion = () => version;

const bump = () => { version += 1; listeners.forEach((fn) => fn()); };

/* ---------- читання ----------

   Завжди повертає щось придатне для <img>: або кешований data-URL,
   або адресу CDN. Тому картинка ніколи не блимає порожнечею й не
   потребує стану «вантажиться». */
export function flagSrc(ccy) {
  const code = CCY_FLAG[String(ccy || '').toUpperCase()];
  if (!code) return null;
  return mem.get(code) || cdn(code);
}

/* ---------- прогрів ----------

   Викликається один раз, коли відомий список валют на екрані.
   Качає тільки те, чого ще немає. */
const inFlight = new Set();

export async function warmFlags(list) {
  const codes = [...new Set(
    (list || [])
      .map((c) => CCY_FLAG[String(c || '').toUpperCase()])
      .filter(Boolean),
  )].filter((c) => !mem.has(c) && !inFlight.has(c));

  if (!codes.length) return;
  codes.forEach((c) => inFlight.add(c));

  const done = await Promise.all(codes.map(async (code) => {
    try {
      const res = await fetch(cdn(code));
      if (!res.ok) return null;
      const svg = await res.text();
      /* SVG як текст, а не base64: він і так текстовий, а base64
         роздув би його на третину. */
      return [code, `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`];
    } catch {
      return null;
    } finally {
      inFlight.delete(code);
    }
  }));

  const ok = done.filter(Boolean);
  if (!ok.length) return;

  ok.forEach(([code, url]) => mem.set(code, url));
  persist();
  bump();
}

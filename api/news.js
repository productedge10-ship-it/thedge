/* ==================================================================
   Календар новин — серверна частина.

   Vercel піднімає цей файл як функцію на /api/news. Вона потрібна не
   для краси: на faireconomy.media немає заголовка CORS, і браузер не
   дозволяє нашому домену читати відповідь. Це правило самого
   браузера — серверу воно не писане.

   Два режими:
     /api/news?week=this|next|last   — тижневий фід
     /api/news?desc=CPI%20m%2Fm      — опис події з FF

   У фіді описів немає взагалі, а на сторінці FF вони є — але туди
   пускають тільки запит із нормальними заголовками. Ще одна причина,
   чому це має жити на сервері.
================================================================== */

const FEEDS = {
  last: 'https://nfs.faireconomy.media/ff_calendar_lastweek.json',
  this: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  next: 'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
};

/* Cloudflare на боці FF відсіює запити без схожого на браузер
   User-Agent. Ставимо його завжди, щоб не розбиратись потім, чому
   фід відкривається, а сторінка ні. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* Кеш у памʼяті інстанса. Живе недовго й гріється не миттєво, але
   навіть так знімає більшість повторних запитів: сторінку відкривають
   значно частіше, ніж календар змінюється. */
const cache = new Map();
const TTL = 20 * 60 * 1000;

async function feed(week) {
  const url = FEEDS[week] || FEEDS.this;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return { body: hit.body, state: 'hit' };

  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const body = await res.text();
    cache.set(url, { at: Date.now(), body });
    return { body, state: 'miss' };
  } catch (e) {
    /* Фід ліг, а в памʼяті лишилось старе — краще старе, ніж порожній
       екран: календар на тиждень уперед не псується від того, що йому
       двадцять хвилин. */
    if (hit) return { body: hit.body, state: 'stale' };
    throw e;
  }
}

/* ---------- опис події ----------

   Стабільного публічного ендпоінта під це немає, тому ставимось до
   результату як до бонусу: не вийшло — фронтенд покаже власний
   словник, і нічого не зламається. */
async function describe(title) {
  const key = `desc:${title}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return hit.body;

  try {
    const res = await fetch('https://www.forexfactory.com/calendar', {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const i = html.indexOf(title);
    if (i === -1) return null;

    /* Розмітка FF змінюється, тому шукаємо не структуру, а найближчий
       до назви блок опису. Якщо не знайшли — просто немає опису. */
    const chunk = html.slice(i, i + 6000);
    const m = chunk.match(/calendarspecs__spec-description[^>]*>([\s\S]{0,800}?)</)
      || chunk.match(/"description"\s*:\s*"([^"]{20,800})"/);
    if (!m) return null;

    const text = m[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\\u[\dA-Fa-f]{4}/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) return null;
    cache.set(key, { at: Date.now(), body: text });
    return text;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { week = 'this', desc } = req.query || {};

  if (desc) {
    const text = await describe(String(desc));
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json({ text });
  }

  try {
    const { body, state } = await feed(String(week));
    res.setHeader('Content-Type', 'application/json');
    /* Кеш на краю Vercel: двадцять хвилин свіжості, далі віддається
       старе, поки в фоні тягнеться нове. Для календаря це рівно те,
       що треба — миттєво і майже завжди актуально. */
    res.setHeader('Cache-Control', 's-maxage=1200, stale-while-revalidate=600');
    res.setHeader('X-Cache', state);
    return res.status(200).send(body);
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
}

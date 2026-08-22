/* ==================================================================
   Supabase Edge Function — календар новин.

   ЯК ПОСТАВИТИ
   ------------
   1. Скопіювати цей файл у корінь проєкту:
        supabase/functions/news/index.ts
   2. supabase functions deploy news --no-verify-jwt
   3. Готово. Сторінка новин сама почне ходити сюди.

   НАВІЩО ВОНА ВЗАГАЛІ
   -------------------
   Браузер не пускає запит з нашого домену на faireconomy.media —
   там немає заголовка CORS, і жоден фронтенд його не обійде. Це не
   захист від ботів, це правило самого браузера: сервер не дозволив
   читати свою відповідь чужому сайту.

   Серверу такого правила не існує. Тому запит робить функція, а
   браузер отримує ту саму відповідь уже з нашого домену.

   Другий бонус, заради якого це варто робити навіть якби CORS не
   заважав: описи подій. У JSON-фіді їх немає, а на сторінці FF вони
   є — і дістати їх можна тільки з сервера, бо Cloudflare відсіює
   запити без нормальних заголовків.
================================================================== */

const FEEDS: Record<string, string> = {
  last: 'https://nfs.faireconomy.media/ff_calendar_lastweek.json',
  this: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  next: 'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

/* FF віддає фід і без заголовків, але сторінку календаря — ні:
   Cloudflare відсіює запити, у яких немає схожого на браузер
   User-Agent. Тому ходимо з ним завжди, щоб не розбиратись потім,
   чому працює одне й не працює інше. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* Кеш просто в памʼяті інстанса. Він живе недовго й гріється не
   миттєво, але навіть так знімає більшу частину повторних запитів:
   сторінку відкривають частіше, ніж календар змінюється. */
const cache = new Map<string, { at: number; body: string }>();
const TTL = 20 * 60 * 1000;

/* ---------- описи подій ----------

   FF тримає опис у деталях події на своїй сторінці. Стабільного
   публічного ендпоінта під це немає, тому робимо обережно:
   пробуємо, а якщо не вийшло — просто не віддаємо опис. Календар
   від цього не ламається, а фронтенд має власний словник на такий
   випадок.

   Свідомо не робимо це синхронно на кожен запит: сторінка з
   сімдесятьма подіями означала б сімдесят походів на FF і майже
   гарантований бан. Описи тягнемо по одному, на вимогу. */
async function description(title: string, ccy: string): Promise<string | null> {
  const url = `https://www.forexfactory.com/calendar?day=today`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;

    const html = await res.text();
    /* Дуже груба вибірка: шукаємо блок специфікації поруч із назвою
       події. Розмітка FF змінюється, тому ставимось до результату як
       до бонусу, а не як до даних. */
    const i = html.indexOf(title);
    if (i === -1) return null;
    const chunk = html.slice(i, i + 4000);
    const m = chunk.match(/calendarspecs__spec-description[^>]*>([\s\S]{0,600}?)</);
    if (!m) return null;

    return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);

  /* Режим опису: /news?desc=CPI%20m/m&ccy=USD */
  const desc = url.searchParams.get('desc');
  if (desc) {
    const text = await description(desc, url.searchParams.get('ccy') || '');
    return new Response(JSON.stringify({ text }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const week = url.searchParams.get('week') || 'this';
  const feed = FEEDS[week];
  if (!feed) {
    return new Response(JSON.stringify({ error: 'unknown week' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const hit = cache.get(week);
  if (hit && Date.now() - hit.at < TTL) {
    return new Response(hit.body, {
      headers: { ...CORS, 'Content-Type': 'application/json', 'X-Cache': 'hit' },
    });
  }

  try {
    const res = await fetch(feed, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`feed ${res.status}`);

    const body = await res.text();
    cache.set(week, { at: Date.now(), body });

    return new Response(body, {
      headers: { ...CORS, 'Content-Type': 'application/json', 'X-Cache': 'miss' },
    });
  } catch (e) {
    /* Якщо фід ліг, а в памʼяті лишилось старе — краще старе, ніж
       порожній екран: календар на тиждень уперед не псується від
       того, що йому двадцять хвилин. */
    if (hit) {
      return new Response(hit.body, {
        headers: { ...CORS, 'Content-Type': 'application/json', 'X-Cache': 'stale' },
      });
    }
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

/* global process, Buffer */
import { TZ } from './_tzgeo.js';

/* ==================================================================
   Приймач подій поведінкової аналітики.

   Браузер шле сюди пачки подій (перегляди, кліки, час на сторінці,
   помилки, швидкість), сервер доповнює їх тим, чого браузер не знає
   або чому не можна вірити, і кладе в analytics_events ключем
   service_role. Самому браузеру таблиця закрита повністю.

   --------------------------------------------------------------
   Що робить сервер, а не браузер.

   • user_id. Браузер надсилає токен входу, а не id: id підробити
     можна одним рядком у консолі, токен — ні. Токен перевіряємо в
     Supabase і кешуємо, щоб не питати на кожну пачку.
   • Країна. Якщо перед сайтом стоїть проксі, що вміє геолокацію
     (Cloudflare: cf-ipcountry, cf-ipcity), беремо з нього. Якщо ні —
     з часового пояса браузера (див. _tzgeo.js). Сам IP у базу не
     потрапляє ніколи: він живе лише в памʼяті процесу для ліміту.
   • Пристрій, ОС, браузер — з User-Agent, тут, а не в браузері, щоб
     розбір був однаковий для всіх і міг змінитись без деплою клієнта.
   • Час події — сервер ставить свій, мінус «вік» події з браузера.
     Годинник на компʼютері людини може бути збитий на години.

   --------------------------------------------------------------
   Чому відповідаємо ДО запису в базу.

   Трекер не має права гальмувати сайт. Відповідь 204 йде одразу, а
   запис робиться після. Якщо база ляже — втратимо кілька подій, а не
   секунди на кожному кліку в людини.
================================================================== */

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

/* Аварійний вимикач на рівні сервера. Звичайний — в адмінці
   (analytics_config.enabled); цей для випадку, коли не працює сама
   адмінка або база. */
const HARD_OFF = process.env.ANALYTICS_OFF === '1';

const MAX_BODY = 64 * 1024;
const MAX_EVENTS = 60;

const TYPES = new Set(['view', 'leave', 'click', 'rage', 'error', 'perf', 'custom']);
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/* Боти й автоматика. Їх відсіюємо тут, а не в звітах: інакше кожен
   звіт мусить памʼятати про фільтр, і рано чи пізно один забуде. */
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|quora link|whatsapp|telegrambot|discordbot|vkshare|curl|wget|python|node-fetch|axios|go-http|java\//i;

/* ------------------------------------------------------------------
   Ліміт частоти на IP.

   Не від DDoS — від нього захищає проксі. Від зацикленого клієнта
   (наприклад, помилка в трекері, що шле подію на кожен кадр) і від
   того, хто вирішив засмітити статистику руками. 400 подій за
   хвилину — це людина, яка клікає без зупинки, з великим запасом.
------------------------------------------------------------------ */
const RATE = 400;
const buckets = new Map();

function allowed(ip, n) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || b.reset < now) {
    b = { used: 0, reset: now + 60_000 };
    buckets.set(ip, b);
  }
  b.used += n;

  /* Прибирання раз на кілька тисяч IP, а не таймером: модуль
     вантажиться ліниво, і таймер тримав би процес без потреби. */
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  }
  return b.used <= RATE;
}

function clientIp(req) {
  const h = req.headers;
  const xf = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return h['cf-connecting-ip'] || xf || h['x-real-ip'] || req.socket?.remoteAddress || '?';
}

/* ------------------------------------------------------------------
   Вимикач з адмінки. Перечитуємо раз на хвилину: частіше — зайвий
   запит на кожну пачку, рідше — адмін натиснув «вимкнути» і ще п'ять
   хвилин дивиться, як події йдуть.

   Якщо база не відповіла, лишаємо останнє відоме значення. Вимикати
   збір через мережевий збій не варто, вмикати вимкнений — тим паче.
------------------------------------------------------------------ */
let cfg = { enabled: true, at: 0 };

async function enabled() {
  if (Date.now() - cfg.at < 60_000) return cfg.enabled;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/analytics_config?id=eq.1&select=enabled`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const [row] = await r.json();
      cfg = { enabled: row ? row.enabled !== false : true, at: Date.now() };
    } else {
      cfg.at = Date.now();
    }
  } catch {
    cfg.at = Date.now();
  }
  return cfg.enabled;
}

/* ------------------------------------------------------------------
   Токен → user_id.

   Кеш на десять хвилин (або до кінця життя токена, якщо раніше).
   Невдалу перевірку кешуємо на хвилину — інакше протухлий токен у
   вкладці, яку не закривали добу, питав би Supabase на кожну пачку.
------------------------------------------------------------------ */
const tokens = new Map();

function jwtExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function userFromToken(token) {
  if (typeof token !== 'string' || token.length > 4096 || token.split('.').length !== 3) return null;

  const now = Date.now();
  const hit = tokens.get(token);
  if (hit && hit.until > now) return hit.uid;

  let uid = null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) uid = (await r.json())?.id || null;
  } catch {
    /* мережа — просто без user_id цього разу */
  }

  const exp = jwtExp(token);
  const until = uid ? Math.min(now + 10 * 60_000, exp || Infinity) : now + 60_000;
  tokens.set(token, { uid, until });

  if (tokens.size > 3000) {
    for (const [k, v] of tokens) if (v.until < now) tokens.delete(k);
  }
  return uid;
}

/* ------------------------------------------------------------------
   User-Agent → пристрій, ОС, браузер.

   Свій розбір на пару десятків рядків замість бібліотеки: потрібні
   лише три грубі категорії, а бібліотеки розбору UA важать сотні
   кілобайт і оновлюються щомісяця.

   Порядок перевірок має значення: Edge і Opera пишуть у UA ще й
   «Chrome», а вбудовані браузери Instagram і Telegram — ще й «Safari».
------------------------------------------------------------------ */
function parseUa(ua = '') {
  const device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)
    ? 'tablet'
    : /Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua) ? 'mobile' : 'desktop';

  let os = 'Інша';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Інший';
  if (/Instagram/i.test(ua)) browser = 'Instagram (вбудований)';
  else if (/FBAN|FBAV/i.test(ua)) browser = 'Facebook (вбудований)';
  else if (/Telegram/i.test(ua)) browser = 'Telegram (вбудований)';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/YaBrowser/i.test(ua)) browser = 'Yandex';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung';
  else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
  else if (/Chrome|CriOS/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua)) browser = 'Safari';

  return { device, os, browser };
}

/* ------------------------------------------------------------------
   Геолокація.
------------------------------------------------------------------ */
const CC_RE = /^[A-Z]{2}$/;

function header(req, name) {
  const v = req.headers[name];
  if (!v) return null;
  try {
    return decodeURIComponent(String(v)).slice(0, 80);
  } catch {
    return String(v).slice(0, 80);
  }
}

function geo(req, tz) {
  const byTz = typeof tz === 'string' ? TZ[tz] : null;

  /* 'XX' — Cloudflare не знає, 'T1' — Tor. Обидва — «невідомо». */
  const cc = String(req.headers['cf-ipcountry'] || '').toUpperCase();
  if (CC_RE.test(cc) && cc !== 'XX' && cc !== 'T1') {
    const lat = Number(req.headers['cf-iplatitude']);
    const lon = Number(req.headers['cf-iplongitude']);
    const exact = Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon);
    /* Координати пояса беремо лише якщо пояс у тій самій країні:
       людина з Польщі на VPN у Німеччину не має з'являтись на карті
       в Берліні з часовим поясом Варшави. */
    const fallback = byTz && byTz[0] === cc ? byTz : null;
    return {
      country: cc,
      region: header(req, 'cf-region'),
      city: header(req, 'cf-ipcity'),
      lat: exact ? lat : fallback ? fallback[1] : null,
      lon: exact ? lon : fallback ? fallback[2] : null,
      geo_src: 'edge',
    };
  }

  if (byTz) {
    return { country: byTz[0], region: null, city: null, lat: byTz[1], lon: byTz[2], geo_src: 'tz' };
  }
  return { country: null, region: null, city: null, lat: null, lon: null, geo_src: null };
}

/* ------------------------------------------------------------------
   Очищення вхідних даних.

   Усе, що приходить з браузера, — чужий ввід. Кожне поле обрізається
   до розумної довжини, числа перевіряються на скінченність, типи
   подій — за білим списком. Порожнє стає null, а не порожнім рядком:
   у звітах «немає даних» і «порожній підпис» — різні речі.
------------------------------------------------------------------ */
const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

const int = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
};

/* Та сама маска, що й у браузері — вдруге, на випадок старої версії
   трекера в чиїйсь давно відкритій вкладці. Токен в адресі, що
   випадково потрапив у статистику, — це доступ до чужого журналу. */
function cleanPath(v) {
  let p = str(v, 300);
  if (!p || p[0] !== '/') return null;
  p = p.split(/[?#]/)[0];
  return p
    .replace(UUID_RE, ':id')
    .replace(/^\/view\/[^/]+/, '/view/:token')
    .replace(/\/([A-Za-z0-9_-]{20,})(?=\/|$)/g, (m, seg) => {
      /* Той самий критерій, що в браузері: slug статті — слова через
         дефіс, токен — суцільна каша або переважно цифри. */
      if (!seg.includes('-')) return '/:token';
      const digits = (seg.match(/\d/g) || []).length;
      return digits / seg.length > 0.3 ? '/:token' : m;
    });
}

function cleanProps(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  let n = 0;
  for (const [k, val] of Object.entries(v)) {
    if (n >= 12) break;
    if (!/^[a-z_]{1,24}$/i.test(k)) continue;
    if (typeof val === 'number' && Number.isFinite(val)) out[k] = Math.round(val * 1000) / 1000;
    else if (typeof val === 'boolean') out[k] = val;
    else if (typeof val === 'string') out[k] = val.slice(0, 200);
    else continue;
    n += 1;
  }
  return n ? out : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------
   Обслуговування: згортка завершених днів і видалення старих подій.

   Запускаємо звідси, а не окремим cron: на сервері немає планувальника,
   а в базі pg_cron може бути не ввімкнений. Приймач подій і так
   викликається постійно, тож «раз на шість годин при нагоді» — цього
   достатньо з запасом. Функція в базі ідемпотентна: два одночасні
   виклики з двох контейнерів під час деплою нічого не зіпсують.
------------------------------------------------------------------ */
let lastMaintain = 0;

function maybeMaintain() {
  if (Date.now() - lastMaintain < 6 * 3600_000) return;
  lastMaintain = Date.now();
  fetch(`${SUPA_URL}/rest/v1/rpc/analytics_maintain`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(60_000),
  })
    .then(async (r) => {
      if (!r.ok) console.error('analytics maintain', r.status, (await r.text()).slice(0, 200));
    })
    .catch((e) => console.error('analytics maintain', e.message));
}

/* ------------------------------------------------------------------
   Обробник
------------------------------------------------------------------ */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  /* Лише зі свого сайту. Відсутній Origin пропускаємо: sendBeacon у
     частині браузерів його не ставить, а чужий сайт і так не пройде
     далі без правильного формату. */
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        res.status(403).end();
        return;
      }
    } catch {
      res.status(403).end();
      return;
    }
  }

  if (HARD_OFF || !SUPA_URL || !SUPA_KEY) {
    res.status(410).end();
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    res.status(400).end();
    return;
  }

  const ua = String(req.headers['user-agent'] || '');
  const events = Array.isArray(body?.e) ? body.e.slice(0, MAX_EVENTS) : [];

  if (
    !events.length
    || !ID_RE.test(String(body.v || ''))
    || !ID_RE.test(String(body.s || ''))
    || BOT_RE.test(ua)
  ) {
    /* Бота не повідомляємо, що його відсіяли, — просто нічого не пишемо. */
    res.status(204).end();
    return;
  }

  if (!allowed(clientIp(req), events.length)) {
    res.status(429).end();
    return;
  }

  if (!(await enabled())) {
    /* 410 — сигнал трекеру замовкнути до кінця сесії, а не пробувати
       знову щодесять секунд. */
    res.status(410).end();
    return;
  }

  res.status(204).end();

  try {
    const c = body.c && typeof body.c === 'object' ? body.c : {};
    const uid = body.t ? await userFromToken(body.t) : null;
    const { device, os, browser } = parseUa(ua);
    const g = geo(req, c.tz);
    const now = Date.now();

    /* Спільне для всіх подій пачки. У кожному рядку повністю — так
       будь-який звіт рахується з однієї таблиці без з'єднань. */
    const base = {
      visitor_id: String(body.v),
      session_id: String(body.s),
      user_id: uid,
      ref: str(c.ref, 120),
      utm_source: str(c.us, 80),
      utm_medium: str(c.um, 80),
      utm_campaign: str(c.uc, 120),
      utm_content: str(c.ux, 120),
      utm_term: str(c.ut, 120),
      ...g,
      lang: str(c.lang, 16),
      tz: str(c.tz, 48),
      device,
      os,
      browser,
      screen_w: int(c.sw, 0, 20000),
      screen_h: int(c.sh, 0, 20000),
    };

    const rows = [];
    for (const ev of events) {
      if (!ev || typeof ev !== 'object' || !TYPES.has(ev.k)) continue;
      const path = cleanPath(ev.p);
      if (!path) continue;

      const age = int(ev.a, 0, 3600_000) ?? 0;

      /* Повний набір колонок у кожному рядку: PostgREST вимагає
         однакових ключів у пакетній вставці. */
      rows.push({
        ...base,
        ts: new Date(now - age).toISOString(),
        type: ev.k,
        path,
        title: str(ev.ti, 160),
        vp_w: int(ev.vw, 0, 20000),
        vp_h: int(ev.vh, 0, 20000),
        duration_ms: int(ev.d, 0, 24 * 3600_000),
        scroll_pct: int(ev.sc, 0, 100),
        target: str(ev.tg, 160),
        label: str(ev.l, 200),
        x: num(ev.x, 0, 100),
        y: num(ev.y, 0, 100),
        props: cleanProps(ev.pr),
      });
    }

    if (rows.length) {
      const r = await fetch(`${SUPA_URL}/rest/v1/analytics_events`, {
        method: 'POST',
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(rows),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) console.error('analytics insert', r.status, (await r.text()).slice(0, 300));
    }

    maybeMaintain();
  } catch (e) {
    console.error('analytics', e.message);
  }
}

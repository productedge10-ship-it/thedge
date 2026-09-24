import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ==================================================================
   Сервер для власного VPS.

   Робить рівно те, що раніше робила платформа: віддає зібраний `dist`
   і виконує функції з /api. Усе інше — робота nginx перед ним
   (сертифікат, HTTPS, стиснення) або Coolify.

   --------------------------------------------------------------
   Чому без Express і взагалі без залежностей.

   Express тут дав би три речі: маршрутизацію (десять рядків нижче),
   роздачу статики (тридцять рядків нижче) і розбір тіла запиту
   (п'ять рядків нижче). Натомість він приносить у проєкт дерево
   пакетів, яке треба оновлювати й яке ламає `package-lock.json`
   рівно тоді, коли треба терміново викотити фікс. У вбудованому
   `node:http` цього всього немає, а Node 18+ уже має глобальні
   `Request`/`Response` — тобто те саме, з чим написані функції.

   --------------------------------------------------------------
   Функції НЕ переписані. Це принципово.

   Спокуса була велика: взяти логіку оплати й перекласти на
   express-стиль. Але це код, який рахує підписи HMAC і вирішує, кому
   відкрити доступ за гроші. Кожен рядок, переписаний «просто щоб
   підходило під іншу сигнатуру», — це шанс зламати платежі так, що
   помилка спливе не в консолі, а в банківській виписці клієнта.

   Тому тут стоять два перехідники, і оригінальні файли лишаються
   байт у байт такими, якими їх приймала платформа:

   • netlify/functions/*.mjs — веб-стандарт `(Request) => Response`,
     викликається майже напряму;
   • api/*.js — стиль Vercel `(req, res)`, для нього нижче зроблена
     підробка об'єкта `res` з тих кількох методів, які вони справді
     використовують.

   Якщо колись повернетесь на платформу — просто не запускаєте цей
   файл. Нічого відкочувати не треба.
================================================================== */

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3000;

/* ------------------------------------------------------------------
   Маршрути.

   Імпорт лінивий і закешований: модулі оплати тягнуть за собою
   клієнт Supabase, і платити за нього при старті не треба, якщо за
   весь день ніхто не відкриє сторінку оплати. Кешуємо саму обіцянку,
   а не результат, — інакше два одночасні запити зчинять два імпорти.
------------------------------------------------------------------ */
const cache = new Map();
const load = (rel) => {
  if (!cache.has(rel)) cache.set(rel, import(rel).then((m) => m.default));
  return cache.get(rel);
};

/* Веб-стандартні: (Request) => Response */
const WEB_ROUTES = {
  '/api/wfp-pay': './netlify/functions/wfp-pay.mjs',
  '/api/wfp-callback': './netlify/functions/wfp-callback.mjs',
  '/api/wfp-return': './netlify/functions/wfp-return.mjs',
  '/api/wfp-cancel': './netlify/functions/wfp-cancel.mjs',
};

/* Стиль Vercel: (req, res) */
const NODE_ROUTES = {
  '/api/news': './api/news.js',
  '/api/verify-email': './api/verify-email.js',
  '/api/img': './api/img.js',
  '/api/rate': './api/rate.js',
  '/api/ev': './api/ev.js',
};

/* ------------------------------------------------------------------
   Тіло запиту.

   Збираємо в Buffer, а не в рядок: через /api/img ходять картинки, і
   декодування бінарних даних як UTF-8 їх псує. Хто чекає текст —
   отримає його з `Request.text()` сам.

   Межа в 5 МБ не від зловмисників (для них є nginx), а від дурних
   помилок: без неї один запит із безкінечним тілом з'їдає всю пам'ять
   процесу, і падає весь сайт, а не один запит.
------------------------------------------------------------------ */
const LIMIT = 5 * 1024 * 1024;

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > LIMIT) {
      reject(new Error('body too large'));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

/* ------------------------------------------------------------------
   Перехідник 1: node:http → веб-стандарт і назад.
------------------------------------------------------------------ */
async function runWeb(handler, req, res, url, body) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((one) => headers.append(k, one));
    else if (v !== undefined) headers.set(k, v);
  }

  const request = new Request(url, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });

  const out = await handler(request);

  res.statusCode = out.status;
  out.headers.forEach((value, key) => res.setHeader(key, value));

  if (!out.body) { res.end(); return; }
  res.end(Buffer.from(await out.arrayBuffer()));
}

/* ------------------------------------------------------------------
   Перехідник 2: підробка `res` у стилі Vercel.

   Тут навмисно рівно ті методи, якими користуються наші три файли, і
   жодного зайвого. Повна емуляція виглядала б солідніше, але
   створювала б ілюзію сумісності: наступна людина додала б
   `res.json()` без статусу чи `res.write()` у циклі, повірила б, що
   так можна, і зловила б різницю вже на бойовому сервері.
------------------------------------------------------------------ */
function vercelRes(res) {
  const shim = {
    status(code) { res.statusCode = code; return shim; },
    setHeader(k, v) { res.setHeader(k, v); return shim; },
    json(data) {
      if (!res.hasHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
      return shim;
    },
    send(data) {
      res.end(Buffer.isBuffer(data) ? data : String(data));
      return shim;
    },
    end(data) { res.end(data); return shim; },
    redirect(code, location) {
      res.statusCode = code;
      res.setHeader('location', location);
      res.end();
      return shim;
    },
  };
  return shim;
}

/* ------------------------------------------------------------------
   Статика.

   Хешовані файли з /assets/ віддаємо на рік і `immutable`: у їхніх
   іменах є хеш вмісту, тож новий вміст = нове ім'я, і застаріти вони
   не можуть за визначенням.

   А от index.html — `no-cache`, і це не перестраховка. Саме в ньому
   лежать посилання на хешовані файли. Закешований index.html означає,
   що людина після вашого деплою тягне старі скрипти, або — гірше —
   новий index зі старими скриптами, яких на сервері вже немає: білий
   екран і «у мене нічого не працює».
------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
};

async function sendFile(res, file, { immutable = false } = {}) {
  const ext = path.extname(file).toLowerCase();
  res.setHeader('content-type', MIME[ext] || 'application/octet-stream');
  res.setHeader(
    'cache-control',
    immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  );

  const stat = await fsp.stat(file);
  res.setHeader('content-length', stat.size);

  await new Promise((resolve, reject) => {
    fs.createReadStream(file)
      .on('error', reject)
      .on('end', resolve)
      .pipe(res);
  });
}

/* Дозволяємо тільки те, що справді лежить усередині dist.

   `path.resolve` сам згортає `..`, тож лишається звірити результат із
   коренем. Без цієї перевірки запит на /../../etc/passwd віддає
   рівно те, що в ньому написано. */
const safeFile = (pathname) => {
  const file = path.resolve(DIST, `.${decodeURIComponent(pathname)}`);
  /* З роздільником, а не просто startsWith(DIST): інакше «/../dist-old»
     дає /app/dist-old, і перевірка вважає його своїм. */
  return file === DIST || file.startsWith(DIST + path.sep) ? file : null;
};

/* ------------------------------------------------------------------
   Сторінка застосунку з правильними тегами.

   index.html один на всі адреси, і в ньому теги головної. Для статей
   блогу це означало: робот, який не дочекався JS, бачив у кожної з них
   заголовок і canonical головної — тобто копію головної, яку індексувати
   не треба. Тепер теги кожної публічної сторінки підставляємо тут,
   ще до відправки (карту складає scripts/seo-routes.mjs під час збірки).

   І друге: невідома адреса тепер відповідає 404, а не 200. Сторінка
   для людини та сама — React малює свою 404, — але пошуковик більше
   не вважає биті посилання повноцінними сторінками.
------------------------------------------------------------------ */
let INDEX_HTML = null;
let SEO_ROUTES = {};
const loadPageTemplates = () => {
  try { INDEX_HTML = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'); } catch { INDEX_HTML = null; }
  try { SEO_ROUTES = JSON.parse(fs.readFileSync(path.join(DIST, 'seo-routes.json'), 'utf8')); } catch { SEO_ROUTES = {}; }
};
loadPageTemplates();

/* Адреси, які існують у застосунку (див. src/App.jsx). Усе інше — 404.
   Приватні розділи існують, але в індекс їм не треба: там або форма
   входу, або чужі дані. Новий розділ у App.jsx — додай і сюди. */
const PUBLIC_EXACT = new Set(['/', '/auth', '/terms', '/blog']);
const PUBLIC_PREFIX = ['/demo', '/view/', '/shared/'];
const APP_PREFIX = [
  '/app', '/notes', '/analyses', '/plan', '/accounts', '/journal', '/error',
  '/analytics', '/todo', '/reviews', '/faq', '/system', '/backtest',
  '/20-trades', '/checklist', '/calculator', '/news',
];
const BLOG_RE = /^\/[a-z]{2}\/blog(\/.*)?$/;
const underPrefix = (p, list) => list.some((x) => p === x.replace(/\/$/, '') || p.startsWith(x.endsWith('/') ? x : `${x}/`));

const escAttr = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escText = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Заміна одного тега в <head>. Теги в index.html бувають розбиті на
   кілька рядків, тому між атрибутами шукаємо \s+. */
const setMeta = (html, attr, name, content) => {
  const re = new RegExp(`<meta\\s+${attr}="${name}"\\s+content="[^"]*"\\s*/?>`);
  const tag = `<meta ${attr}="${name}" content="${escAttr(content)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
};

function renderPage(rawPath) {
  const p = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  if (!INDEX_HTML) loadPageTemplates();
  let html = INDEX_HTML || '<!doctype html><div id="root"></div>';

  const known = PUBLIC_EXACT.has(p) || underPrefix(p, PUBLIC_PREFIX)
    || underPrefix(p, APP_PREFIX) || BLOG_RE.test(p);
  const status = known ? 200 : 404;
  const privatePage = underPrefix(p, APP_PREFIX) || p === '/auth' || underPrefix(p, ['/view/', '/shared/']);

  const r = SEO_ROUTES[p];
  if (r) {
    html = html
      .replace(/<html lang="[^"]*">/, `<html lang="${escAttr(r.lang || 'uk')}">`)
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escText(r.title)}</title>`)
      .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${escAttr(r.canonical)}" />`);
    html = setMeta(html, 'name', 'description', r.description);
    html = setMeta(html, 'property', 'og:type', r.type || 'website');
    html = setMeta(html, 'property', 'og:url', r.canonical);
    html = setMeta(html, 'property', 'og:title', r.title);
    html = setMeta(html, 'property', 'og:description', r.description);
    html = setMeta(html, 'name', 'twitter:title', r.title);
    html = setMeta(html, 'name', 'twitter:description', r.description);
    if (r.published) html = setMeta(html, 'property', 'article:published_time', r.published);

    const extra = [
      ...(r.alternates || []).map((a) =>
        `<link rel="alternate" hreflang="${escAttr(a.lang)}" href="${escAttr(a.href)}" />`),
      // «<» екрануємо, щоб текст статті не міг закрити тег script.
      r.jsonLd ? `<script type="application/ld+json">${JSON.stringify(r.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
    ].filter(Boolean).join('\n    ');
    if (extra) html = html.replace('</head>', `    ${extra}\n  </head>`);

    /* Короткий текст сторінки всередині #root. React при старті однаково
       замінить вміст #root своїм — людина цього не побачить, а робот
       без JS отримує справжній заголовок, опис і текст статті. */
    if (r.body) {
      const b = r.body;
      const body = [
        /* Стилі прямо в тезі: поки вантажиться JS (пів секунди на
           повільному зв'язку), людина може побачити цей текст, і він
           має виглядати як спокійна сторінка в темі сайту, а не як
           чорні літери на чорному тлі. */
        `<main style="max-width:720px;margin:12vh auto 0;padding:0 24px;color:#9a9aae;font:16px/1.6 system-ui,sans-serif"><h1 style="color:#ededf5;font-size:28px;line-height:1.2">${escText(b.h1)}</h1>`,
        b.text ? `<p>${escText(b.text)}</p>` : '',
        b.article ? `<article><p>${escText(b.article)}</p></article>` : '',
        b.links?.length
          ? `<ul>${b.links.map((l) => `<li><a style="color:#b3a9ff" href="${escAttr(l.href)}">${escText(l.text)}</a></li>`).join('')}</ul>`
          : '',
        '</main>',
      ].join('');
      html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    }
  } else if (status === 404 || privatePage) {
    /* Для битих адрес і приватних сторінок canonical на головну —
       неправда. Прибираємо його й кажемо роботу не індексувати. */
    html = html
      .replace(/<link rel="canonical" href="[^"]*"\s*\/?>\s*/, '')
      .replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, follow" />');
  }

  return { html, status, noindex: status === 404 || privatePage };
}

/* ------------------------------------------------------------------
   Сам сервер.
------------------------------------------------------------------ */
/* Заголовки безпеки на кожну відповідь.
   • nosniff — браузер не вгадує тип файлу (картинка не стане скриптом);
   • SAMEORIGIN — сайт не можна вбудувати в чужу сторінку й «клікнути»
     кнопку оплати чи видалення руками обманутої людини;
   • HSTS — після першого візиту браузер ходить лише по HTTPS;
   • Referrer-Policy — адреси сторінок (з id і токенами поширення) не
     витікають на сторонні сайти;
   • Permissions-Policy — камера, мікрофон і геолокація сайту не потрібні. */
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);

  /* Повна адреса потрібна конструктору Request і розбору ?query.
     За проксі (nginx, Coolify) справжню схему знає лише заголовок.
     Кривий Host не має класти весь процес — тому в try. */
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  let url;
  try {
    url = new URL(req.url, `${proto}://${host}`);
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }
  const { pathname } = url;

  try {
    /* Перевірка життя для Coolify: без неї панель вважає застосунок
       піднятим щойно процес стартував, тобто ще до того, як він
       почав відповідати. */
    if (pathname === '/healthz') {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/plain');
      res.end('ok');
      return;
    }

    if (WEB_ROUTES[pathname]) {
      const body = await readBody(req);
      const handler = await load(WEB_ROUTES[pathname]);
      await runWeb(handler, req, res, url.toString(), body);
      return;
    }

    if (NODE_ROUTES[pathname]) {
      const handler = await load(NODE_ROUTES[pathname]);
      req.query = Object.fromEntries(url.searchParams);
      await handler(req, vercelRes(res));
      return;
    }

    /* Невідомий /api — чесна 404, а не сторінка застосунку.

       Інакше помилка в адресі запиту повертає HTML із кодом 200, і
       клієнтський `fetch(...).json()` падає на «Unexpected token <».
       Півгодини життя на рівному місці. */
    if (pathname.startsWith('/api/')) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    /* Статика, якщо такий файл є. */
    const file = safeFile(pathname);
    if (file && pathname !== '/' && fs.existsSync(file) && fs.statSync(file).isFile()) {
      await sendFile(res, file, { immutable: pathname.startsWith('/assets/') });
      return;
    }

    /* Інакше — сторінка застосунку. Маршрутизація в React Router, і
       сервер про неї нічого не знає: /journal, /uk/blog/… і будь-що
       інше має віддати той самий index.html. */
    const page = renderPage(pathname);
    res.statusCode = page.status;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-cache');
    if (page.noindex) res.setHeader('x-robots-tag', 'noindex');
    res.end(page.html);
  } catch (e) {
    /* У лог — усе, у відповідь — нічого зайвого. Текст помилки може
       містити шляхи на сервері й шматки конфігурації. */
    console.error(`[${req.method}] ${pathname} —`, e);
    if (res.headersSent) { res.destroy(); return; }
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
});

/* Тайм-аут трохи більший за звичний: запит до WayForPay на скасування
   підписки ходить у їхній API і буває повільним. */
server.requestTimeout = 30_000;

server.listen(PORT, () => {
  if (!fs.existsSync(DIST)) {
    console.error('УВАГА: немає папки dist — спершу `npm run build`.');
  }
  console.log(`edge-journal слухає :${PORT}`);
});

/* Коректне завершення. Coolify під час деплою шле SIGTERM і чекає;
   без цього обробника процес помирає миттєво разом із запитом, який
   саме зараз пишеться в базу. */
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} — зупиняюсь`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}

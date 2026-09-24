import { realSupabase } from './supabase';

/* ==================================================================
   Трекер поведінки.

   Збирає: перегляди сторінок, активний час на кожній, глибину
   прокрутки, кліки (що, де і в якій точці), «лютові» кліки,
   помилки JS, швидкість завантаження, джерело й UTM, мову, часовий
   пояс, розмір екрана. Шле пачками на /api/ev — свій домен, без
   сторонніх скриптів і без cookie.

   --------------------------------------------------------------
   Головне правило: трекер не має права зламати сайт.

   Кожен вхід обгорнутий у try/catch, жодна функція не кидає помилку
   назовні, а мережеві запити не чекаються. Якщо /api/ev лежить, сайт
   цього не помітить — просто зникнуть кілька подій. Модуль вантажиться
   окремим шматком після першого малювання (див. App.jsx), тож і на
   швидкість відкриття не впливає.

   --------------------------------------------------------------
   Чого трекер НЕ збирає — і це свідомо, а не «не встигли».

   • Нічого з полів вводу: ні значень, ні натискань клавіш. Клік у
     текстове поле не записується взагалі.
   • Токенів і id з адрес: /view/<токен>, /shared/…/<id>, uuid, дати й
     пари в /plan/… замінюються на :token / :id / :date / :pair ще тут.
     Query-рядок і # не відправляються ніколи — там бувають ?code= і
     access_token після входу.
   • Цифр у підписах на сторінках застосунку: там бувають суми, лоти й
     результати угод. На лендінгу й у блозі цифри лишаються — там це
     «$15» і «14 днів», які якраз цікаві.
   • Тексту «клікабельних» рядків і карток у застосунку. Кнопка — це
     підпис інтерфейсу, а рядок таблиці угод — це чиїсь дані.

   --------------------------------------------------------------
   Коли трекер мовчить зовсім.

   • Браузер надіслав Global Privacy Control — юридично значимий
     сигнал «не стежте за мною». DNT не враховуємо: він давно ніде не
     обовʼязковий і вмикається за замовчуванням у частині збірок.
   • Автоматизований браузер (navigator.webdriver).
   • localhost і локальна мережа — щоб розробка не засмічувала
     статистику. Увімкнути локально: відкрити сайт з ?track=1.
   • Хтось із команди відкрив сайт з ?notrack=1 — прапорець лишається
     в цьому браузері назавжди (зняти: ?track=1).
================================================================== */

const ENDPOINT = '/api/ev';

const SESSION_IDLE = 30 * 60 * 1000;
/* Скільки часу без руху мишею, клавіш і прокрутки ще рахується як
   «читає». Півтори хвилини — абзац тексту без прокрутки; далі це
   вже вкладка, забута відкритою. */
const ACTIVE_IDLE = 90 * 1000;
const FLUSH_EVERY = 10 * 1000;
const FLUSH_AT = 20;
const MAX_BATCH = 60;
const MAX_ERRORS = 8;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/* Що рахується кнопкою. Порядок не важливий — беремо найближчий
   предок, що підходить. */
const CLICKABLE = [
  'a[href]', 'button', 'summary', 'label', 'select',
  '[role=button]', '[role=link]', '[role=tab]', '[role=menuitem]', '[role=switch]',
  '[role=checkbox]', '[role=radio]', '[role=option]',
  'input[type=submit]', 'input[type=button]', 'input[type=checkbox]', 'input[type=radio]',
  '[data-track]',
].join(',');

/* Кліки в поля вводу не пишемо зовсім: і сам факт, і точка кліку
   тут нічого не кажуть, а поруч лежить те, що людина друкує. */
const TYPING = 'input:not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]),textarea,[contenteditable=""],[contenteditable=true]';

let started = false;
let dead = false;
let router = null;

let vid = null;
let sess = null;          // { id, last, ctx }
let token = null;
let queue = [];
let page = null;          // { path, active, tick, scroll, view }
let lastInput = Date.now();
let errorCount = 0;
const errorSeen = new Set();
const recentClicks = [];

/* ------------------------------------------------------------------
   Сховище. У приватному режимі Safari й у вбудованих браузерах
   localStorage кидає винятки — тоді живемо в памʼяті: для однієї
   сторінки цього досить.
------------------------------------------------------------------ */
const mem = {};
const store = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return mem[k] ?? null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch { mem[k] = v; }
  },
  del(k) {
    try { localStorage.removeItem(k); } catch { delete mem[k]; }
  },
};

const rid = () => {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);
  }
};

/* ------------------------------------------------------------------
   Адреси
------------------------------------------------------------------ */
export function normPath(p) {
  return String(p || '/')
    .split(/[?#]/)[0]
    .replace(UUID_RE, ':id')
    .replace(/^\/view\/[^/]+/, '/view/:token')
    .replace(/^\/shared\/([a-z]+)\/[^/]+/, '/shared/$1/:id')
    .replace(/^\/(demo\/|view\/:token\/)?plan\/\d{4}-\d{2}-\d{2}\/[^/]+/, '/$1plan/:date/:pair')
    .replace(/^\/backtest\/[^/]+/, '/backtest/:id')
    .replace(/\/([A-Za-z0-9_-]{20,})(?=\/|$)/g, (m, seg) => (looksLikeToken(seg) ? '/:token' : m))
    || '/';
}

/* Токен від slug статті відрізняємо за формою, а не за довжиною:
   «yak-korystuvatys-the-edge» теж довгий, але це слова через дефіс.
   Токен — суцільна каша без дефісів або з великою часткою цифр. */
function looksLikeToken(seg) {
  if (!seg.includes('-')) return true;
  const digits = (seg.match(/\d/g) || []).length;
  return digits / seg.length > 0.3;
}

/* Публічні сторінки — ті, де немає чужих даних: лендінг, вхід, умови,
   блог, демо (там вигадані угоди). Усе інше — застосунок. */
const isPublic = (p) => p === '/' || p === '/auth' || p === '/terms' || p === '/blog'
  || p.startsWith('/demo') || /^\/[a-z]{2}\/blog(\/|$)/.test(p);

/* ------------------------------------------------------------------
   Сесія.

   Нова — після 30 хвилин тиші або якщо людина прийшла за новим
   рекламним посиланням (інша utm_campaign). Друге важливе: без нього
   повернення з реклами через 10 хвилин приписувалось би попередньому
   джерелу, і кампанія виглядала б гіршою, ніж є.
------------------------------------------------------------------ */
function readUtm() {
  try {
    const q = new URLSearchParams(window.location.search);
    const pick = (k) => (q.get(k) || '').slice(0, 120) || undefined;
    return { us: pick('utm_source'), um: pick('utm_medium'), uc: pick('utm_campaign'), ux: pick('utm_content'), ut: pick('utm_term') };
  } catch {
    return {};
  }
}

function refHost() {
  try {
    if (!document.referrer) return undefined;
    const h = new URL(document.referrer).host;
    return h && h !== window.location.host ? h : undefined;
  } catch {
    return undefined;
  }
}

function newSession(utm) {
  let tz;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* немає Intl */ }

  sess = {
    id: rid(),
    last: Date.now(),
    ctx: {
      ref: refHost(),
      ...utm,
      lang: (navigator.language || '').slice(0, 16) || undefined,
      tz,
      sw: window.screen?.width,
      sh: window.screen?.height,
    },
  };
  saveSession(true);
}

let savedAt = 0;
function saveSession(force) {
  /* Пишемо в сховище не на кожну подію: localStorage синхронний, і
     на швидких кліках це відчутно. Раз на 15 секунд досить — сесія
     однаково живе пів години. */
  if (!force && Date.now() - savedAt < 15_000) return;
  savedAt = Date.now();
  store.set('edge_sess', JSON.stringify(sess));
}

function loadSession() {
  const utm = readUtm();
  try {
    const s = JSON.parse(store.get('edge_sess') || 'null');
    const sameCampaign = !utm.uc || utm.uc === s?.ctx?.uc;
    if (s?.id && Date.now() - s.last < SESSION_IDLE && sameCampaign) {
      sess = s;
      return;
    }
  } catch { /* зіпсований запис — просто нова сесія */ }
  newSession(utm);
}

/* Перед кожною подією: якщо людина пів години не торкалась вкладки,
   це вже нова сесія — і в ній має бути перегляд, інакше вона почнеться
   з кліку «нізвідки». */
function touchSession() {
  const now = Date.now();
  if (now - sess.last > SESSION_IDLE) {
    newSession({});
    sess.ctx.ref = undefined;
    if (page) {
      page.active = 0;
      page.tick = now;
      push({ k: 'view', p: page.path, ti: document.title }, true);
    }
  }
  sess.last = now;
  saveSession(false);
}

/* ------------------------------------------------------------------
   Черга й відправка
------------------------------------------------------------------ */
function push(ev, skipTouch) {
  if (dead) return;
  if (!skipTouch) touchSession();
  ev.vw = window.innerWidth;
  ev.vh = window.innerHeight;
  ev._t = Date.now();
  queue.push(ev);
  if (queue.length >= FLUSH_AT) flush(false);
}

function flush(beacon) {
  if (dead || !queue.length) return;
  try {
    const now = Date.now();
    const batch = queue.splice(0, MAX_BATCH).map(({ _t, ...ev }) => ({ ...ev, a: now - _t }));
    const body = JSON.stringify({ v: vid, s: sess.id, c: sess.ctx, t: token || undefined, e: batch });

    /* sendBeacon — лише коли сторінка ховається: це єдиний запит, який
       браузер гарантовано довезе після закриття вкладки. Звичайний
       fetch тут обірвався б на півдорозі. text/plain — щоб запит був
       «простим» і не вимагав попереднього OPTIONS. */
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }));
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        body,
        keepalive: body.length < 60_000,
        headers: { 'content-type': 'text/plain' },
      })
        .then((r) => {
          /* 410 — збір вимкнено в адмінці. Мовчимо до кінця сесії, а
             не стукаємо щодесять секунд. */
          if (r.status === 410) { dead = true; queue = []; }
        })
        .catch(() => {});
    }

    if (queue.length) flush(beacon);
  } catch { /* див. головне правило */ }
}

/* ------------------------------------------------------------------
   Сторінки й активний час.

   Час рахується лише поки вкладка видима І людина щось робила за
   останні 90 секунд. Вкладка, забута на ніч, інакше давала б
   «середній час на сторінці 3 години».

   Час шлеться шматками: щоразу, коли вкладку ховають, і коли зі
   сторінки йдуть. На телефоні вкладку часто просто вбивають у фоні
   без жодних подій — тоді ми вже встигли відправити все до моменту,
   коли її сховали. База потім складає шматки.
------------------------------------------------------------------ */
function tick() {
  if (!page) return;
  const now = Date.now();
  if (document.visibilityState === 'visible' && now - lastInput <= ACTIVE_IDLE) {
    page.active += Math.min(now - page.tick, 15_000);
  }
  page.tick = now;
}

function measureScroll(el) {
  try {
    const box = el || document.scrollingElement || document.documentElement;
    const h = box.scrollHeight;
    if (!h) return;
    const seen = box === document.scrollingElement || box === document.documentElement
      ? window.scrollY + window.innerHeight
      : box.scrollTop + box.clientHeight;
    const pct = Math.min(100, Math.round((seen / h) * 100));
    if (page && pct > page.scroll) page.scroll = pct;
  } catch { /* noop */ }
}

function emitLeave() {
  if (!page) return;
  tick();
  if (page.active > 0 || !page.sent) {
    push({ k: 'leave', p: page.path, d: page.active, sc: page.scroll }, true);
    page.sent = true;
  }
  page.active = 0;
}

function openPage(path) {
  /* Сесію оновлюємо ДО того, як зʼявиться нова сторінка: інакше після
     пів години тиші touchSession() сам додав би перегляд цієї
     сторінки в нову сесію, а тут ми додали б його вдруге. */
  touchSession();

  const view = { k: 'view', p: path, ti: document.title };
  page = { path, active: 0, tick: Date.now(), scroll: 0, sent: false, view };
  push(view, true);

  /* Заголовок сторінки React виставляє вже після переходу. Подія ще
     лежить у черзі — допишемо його, поки не поїхала. */
  setTimeout(() => {
    try { view.ti = document.title.slice(0, 160); } catch { /* noop */ }
  }, 600);

  /* Сторінка, що вміщується в екран, прочитана на 100% без жодної
     прокрутки — інакше вона виглядала б «недочитаною». */
  setTimeout(() => measureScroll(), 1200);
}

function onNav(pathname) {
  const path = normPath(pathname);
  if (page && page.path === path) return;
  emitLeave();
  /* Стара сторінка закрита — прибираємо її до openPage, щоб
     touchSession() не відкрив нову сесію переглядом сторінки, з якої
     людина вже пішла. */
  page = null;
  openPage(path);
}

/* ------------------------------------------------------------------
   Кліки
------------------------------------------------------------------ */
function textOf(el) {
  const t = (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.value || el.alt || '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.slice(0, 80);
}

function iconHint(el) {
  const svg = el.querySelector?.('svg[class*="lucide-"]');
  const m = svg && String(svg.getAttribute('class')).match(/lucide-([a-z0-9-]+)/);
  return m ? `[${m[1]}]` : '';
}

function findClickable(start) {
  let n = start;
  for (let i = 0; n && i < 7; i += 1, n = n.parentElement) {
    if (n.nodeType !== 1) continue;
    if (n.matches(CLICKABLE)) return { el: n, semantic: true };
  }
  /* Кнопки на div-ах з onClick. Їх видно лише за курсором — іншої
     ознаки React у DOM не лишає. */
  n = start;
  for (let i = 0; n && i < 5; i += 1, n = n.parentElement) {
    if (n.nodeType !== 1 || n === document.body) break;
    try {
      if (getComputedStyle(n).cursor === 'pointer') return { el: n, semantic: false };
    } catch { break; }
  }
  return null;
}

function describe(el, semantic, pub) {
  const tag = el.tagName.toLowerCase();
  const track = el.getAttribute('data-track');
  const icon = iconHint(el);

  let label = semantic || pub ? textOf(el) : '';
  if (!pub) label = label.replace(/\d/g, '#');

  let href;
  if (tag === 'a') {
    try {
      const u = new URL(el.getAttribute('href'), window.location.href);
      href = u.host === window.location.host ? normPath(u.pathname) : u.host;
    } catch { /* кривий href */ }
  }

  /* Ідентифікатор кнопки. data-track, якщо розробник його поставив, —
     він не міняється разом із текстом і перекладом. Інакше — тег і
     підпис (або куди веде посилання, або іконка). */
  let target = track;
  if (!target && el.id && !/\d{3,}|:/.test(el.id)) target = `${tag}#${el.id}`;
  if (!target) target = `${tag}:${(label || href || icon || (semantic ? '' : 'area')).slice(0, 80)}`;

  return { target: target.slice(0, 160), label: label || icon || null, href };
}

function onClick(e) {
  try {
    if (!page || !e.isTrusted) return;
    const t = e.target;
    if (!(t instanceof Element) || t.closest(TYPING) || t.closest('[data-private]')) return;

    lastInput = Date.now();

    const doc = document.documentElement;
    const x = Math.round((e.pageX / Math.max(doc.scrollWidth, 1)) * 10000) / 100;
    const y = Math.round((e.pageY / Math.max(doc.scrollHeight, 1)) * 10000) / 100;

    /* «Лютий» клік — три і більше в одне місце за секунду. Людина
       тисне, нічого не відбувається, тисне ще. Найчесніший сигнал
       «тут зламано або незрозуміло» з усіх, що можна зібрати. */
    const now = Date.now();
    recentClicks.push({ t: now, x: e.clientX, y: e.clientY });
    while (recentClicks.length && now - recentClicks[0].t > 1000) recentClicks.shift();
    const near = recentClicks.filter((c) => Math.abs(c.x - e.clientX) < 30 && Math.abs(c.y - e.clientY) < 30);

    const hit = findClickable(t);
    const pub = isPublic(page.path);
    const d = hit ? describe(hit.el, hit.semantic, pub) : { target: `dead:${t.tagName.toLowerCase()}`, label: null };

    if (near.length === 3) {
      push({ k: 'rage', p: page.path, tg: d.target, l: d.label, x, y });
    }

    /* Клік повз будь-що клікабельне в звичайні кліки не пишемо: це
       виділення тексту й фокус. Але в «лютих» він лишається — якщо
       тиснуть тричі в порожнє місце, значить щось там схоже на кнопку. */
    if (!hit) return;

    push({
      k: 'click',
      p: page.path,
      tg: d.target,
      l: d.label,
      x,
      y,
      pr: d.href ? { href: d.href } : undefined,
    });
  } catch { /* noop */ }
}

/* ------------------------------------------------------------------
   Помилки JS
------------------------------------------------------------------ */
function reportError(message, src) {
  try {
    const msg = String(message || '').slice(0, 200);
    /* «Script error.» — помилка чужого скрипта, браузер ховає деталі.
       ResizeObserver — нешкідливий шум Chrome. Обидва тільки
       засмічують список. */
    if (!msg || msg === 'Script error.' || /ResizeObserver loop/.test(msg)) return;
    if (errorSeen.has(msg) || errorCount >= MAX_ERRORS) return;
    errorSeen.add(msg);
    errorCount += 1;
    push({ k: 'error', p: page?.path || normPath(window.location.pathname), l: msg, pr: src ? { src: String(src).slice(0, 120) } : undefined });
  } catch { /* noop */ }
}

/* ------------------------------------------------------------------
   Швидкість. Раз на повне завантаження: TTFB, FCP, LCP, CLS, load.
   Відправляємо, коли вкладку вперше ховають або через 15 секунд —
   LCP до цього моменту вже остаточний.
------------------------------------------------------------------ */
function watchPerf() {
  const m = {};
  const path = normPath(window.location.pathname);
  let sent = false;

  try {
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last) m.lcp = Math.round(last.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* старий браузер */ }

  try {
    let cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value;
      m.cls = Math.round(cls * 1000) / 1000;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* старий браузер */ }

  const send = () => {
    if (sent) return;
    sent = true;
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) {
        m.ttfb = Math.round(nav.responseStart);
        m.dom = Math.round(nav.domContentLoadedEventEnd);
        if (nav.loadEventEnd) m.load = Math.round(nav.loadEventEnd);
      }
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      if (fcp) m.fcp = Math.round(fcp.startTime);
      m.conn = navigator.connection?.effectiveType;
      push({ k: 'perf', p: path, pr: m });
    } catch { /* noop */ }
  };

  setTimeout(send, 15_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') send();
  }, { once: true });
}

/* ------------------------------------------------------------------
   Своя подія з коду: track('trial_click', { plan: 'pro_monthly' }).
------------------------------------------------------------------ */
export function track(name, props) {
  try {
    if (!started || dead || !page) return;
    push({ k: 'custom', p: page.path, tg: String(name).slice(0, 80), pr: props });
  } catch { /* noop */ }
}

/* ------------------------------------------------------------------
   Старт
------------------------------------------------------------------ */
function allowed() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('notrack') === '1') store.set('edge_no_track', '1');
    if (q.get('track') === '1') {
      store.del('edge_no_track');
      store.set('edge_track_dev', '1');
    }

    if (navigator.webdriver) return false;
    if (navigator.globalPrivacyControl === true) return false;
    if (store.get('edge_no_track') === '1') return false;

    const h = window.location.hostname;
    const local = h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local')
      || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h);
    if (local && store.get('edge_track_dev') !== '1') return false;

    return true;
  } catch {
    return false;
  }
}

export function startAnalytics(r) {
  if (started || typeof window === 'undefined') return;
  started = true;

  try {
    if (!allowed()) return;

    router = r;
    vid = store.get('edge_vid');
    if (!vid || !/^[A-Za-z0-9_-]{8,64}$/.test(vid)) {
      vid = rid();
      store.set('edge_vid', vid);
    }
    loadSession();

    /* Токен входу — щоб сервер знав, чий це візит. Сесію читаємо з
       локального сховища клієнта, без запиту в мережу. */
    realSupabase.auth.getSession()
      .then(({ data }) => { token = data?.session?.access_token || null; })
      .catch(() => {});
    realSupabase.auth.onAuthStateChange((_e, s) => { token = s?.access_token || null; });

    onNav(window.location.pathname);
    router.subscribe((state) => {
      try { onNav(state.location.pathname); } catch { /* noop */ }
    });

    const input = () => { lastInput = Date.now(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'].forEach((t) => {
      window.addEventListener(t, input, { passive: true, capture: true });
    });

    /* Прокрутку ловимо на фазі перехоплення: у застосунку гортається
       не вікно, а внутрішній контейнер, і до window ця подія не
       спливає. Дрібні внутрішні списки (випадайки, модалки) ігноруємо —
       їхня прокрутка нічого не каже про сторінку. */
    let raf = 0;
    document.addEventListener('scroll', (e) => {
      lastInput = Date.now();
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = e.target === document ? null : e.target;
        if (el && el.clientHeight < window.innerHeight * 0.5) return;
        measureScroll(el);
      });
    }, { passive: true, capture: true });

    document.addEventListener('click', onClick, { capture: true, passive: true });

    window.addEventListener('error', (e) => {
      const src = e.filename ? `${e.filename.split('/').pop()}:${e.lineno || 0}` : '';
      reportError(e.message, src);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      reportError(r?.message || String(r || 'unhandled rejection'), r?.stack?.split('\n')[1]?.trim());
    });

    watchPerf();

    setInterval(() => { tick(); flush(false); }, FLUSH_EVERY);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        emitLeave();
        flush(true);
      } else if (page) {
        page.tick = Date.now();
        lastInput = Date.now();
      }
    });
    window.addEventListener('pagehide', () => {
      emitLeave();
      flush(true);
    });
  } catch { /* див. головне правило */ }
}

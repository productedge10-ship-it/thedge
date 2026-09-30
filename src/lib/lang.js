/* ==================================================================
   Мова застосунку.

   Дві мови — українська й англійська. Російської немає свідомо.

   Мова визначається ОДИН раз на завантаження сторінки й далі не
   змінюється: `t('укр', 'eng')` можна кликати будь-де — у компоненті,
   у константі модуля, у форматері дат, — і всюди буде та сама мова.
   Перемикач у налаштуваннях зберігає вибір і перезавантажує
   сторінку. Це свідомий обмін: без перезавантаження довелося б
   переписати на хуки сотні констант-довідників, які рахуються при
   імпорті модуля, а мову міняють раз у житті, а не щохвилини.

   Порядок визначення:
   1. адреса: /en і /en/… — англійська, /uk/… — українська
      (публічні сторінки мають мову в адресі, її бачить пошуковик);
   2. явний вибір людини (localStorage `edge_lang`);
   3. країна за IP — сервер кладе її в window.__EDGE_CC__ із
      заголовка Cloudflare `cf-ipcountry` (див. server.mjs);
   4. часовий пояс браузера (Київ і сусіди — українська);
   5. мова браузера (uk або ru — українська);
   6. інакше — англійська.
================================================================== */

export const LANGS = [
  { id: 'uk', short: 'UA', name: 'Українська' },
  { id: 'en', short: 'EN', name: 'English' },
];

export const LANG_KEY = 'edge_lang';

const UA_TZ = /^Europe\/(Kiev|Kyiv|Uzhgorod|Zaporozhye|Simferopol)$/;

/* Роботи й прев'ю-боти. Їм мову визначає тільки адреса: / для них
   завжди українська, інакше Google з американської IP побачив би на
   українській головній англійські шматки. */
export const BOT_RE = /bot|crawl|spider|slurp|google|bing|yandex|duckduck|baidu|lighthouse|headless|preview|facebookexternalhit|telegram|whatsapp/i;
export const isBot = () => {
  try { return !!navigator.webdriver || BOT_RE.test(navigator.userAgent || ''); } catch { return false; }
};

function fromUrl() {
  const p = window.location.pathname;
  if (p === '/en' || p.startsWith('/en/')) return 'en';
  if (p.startsWith('/uk/')) return 'uk';
  if (isBot()) return 'uk';
  return null;
}

/* Мова, яку людина хоче, без урахування адреси. Нею ж
   користується лендінг, щоб вирішити, чи вести з / на /en. */
export function preferredLang() {
  if (typeof window === 'undefined') return 'uk';
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'uk' || saved === 'en') return saved;
  } catch { /* приватний режим */ }

  const cc = String(window.__EDGE_CC__ || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1') return cc === 'UA' ? 'uk' : 'en';

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (UA_TZ.test(tz)) return 'uk';
  } catch { /* старий браузер */ }

  const langs = (navigator.languages?.length ? navigator.languages : [navigator.language || ''])
    .map((l) => String(l).slice(0, 2).toLowerCase());
  if (langs.some((l) => l === 'uk' || l === 'ru')) return 'uk';
  return 'en';
}

function detect() {
  if (typeof window === 'undefined') return 'uk';
  return fromUrl() || preferredLang();
}

export const LANG = detect();
export const isEn = LANG === 'en';

/* Локаль для дат і чисел: toLocaleString(LOCALE, …), Intl.*(LOCALE). */
export const LOCALE = isEn ? 'en-US' : 'uk-UA';

/* Головна функція перекладу. Пара рядків поруч — щоб переклад не
   відставав від оригіналу непомітно. Працює й з масивами/обʼєктами:
   t([...uk], [...en]). */
export const t = (uk, en) => (isEn ? en : uk);

/* Для довідників-констант: pickLang({ uk: …, en: … }). */
export const pickLang = (v) => (isEn ? v.en : v.uk);

/* Вибір мови з налаштувань: запамʼятати й перезавантажити. */
export function setLang(id) {
  if (id !== 'uk' && id !== 'en') return;
  try { localStorage.setItem(LANG_KEY, id); } catch { /* приватний режим */ }
  window.location.reload();
}

if (typeof document !== 'undefined') document.documentElement.lang = LANG;

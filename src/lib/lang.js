/* ==================================================================
   Мова застосунку.

   Три мови — українська, англійська й російська (з жовтня 2026).
   Російський текст не пишемо в коді руками: його дописує під час
   збірки scripts/ruI18n.mjs зі словника src/i18n/ru.json —
   t('укр', 'eng') стає t('укр', 'eng', 'рус'). Немає перекладу —
   показуємо українську.

   Мова визначається ОДИН раз на завантаження сторінки й далі не
   змінюється: `t('укр', 'eng')` можна кликати будь-де — у компоненті,
   у константі модуля, у форматері дат, — і всюди буде та сама мова.
   Перемикач у налаштуваннях зберігає вибір і перезавантажує
   сторінку. Це свідомий обмін: без перезавантаження довелося б
   переписати на хуки сотні констант-довідників, які рахуються при
   імпорті модуля, а мову міняють раз у житті, а не щохвилини.

   Порядок визначення:
   1. адреса: /en і /en/… — англійська, /ru і /ru/… — російська,
      /uk/… — українська
      (публічні сторінки мають мову в адресі, її бачить пошуковик);
   2. явний вибір людини (localStorage `edge_lang`);
   2½. системна мова браузера — російська → російська;
   3. країна за IP — сервер кладе її в window.__EDGE_CC__ із
      заголовка Cloudflare `cf-ipcountry` (див. server.mjs);
   4. часовий пояс браузера (Київ і сусіди — українська);
   5. мова браузера (uk — українська);
   6. інакше — англійська.
================================================================== */

export const LANGS = [
  { id: 'uk', short: 'UA', name: 'Українська' },
  { id: 'en', short: 'EN', name: 'English' },
  { id: 'ru', short: 'RU', name: 'Русский' },
];

const isLangId = (v) => v === 'uk' || v === 'en' || v === 'ru';

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
  if (p === '/ru' || p.startsWith('/ru/')) return 'ru';
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
    if (isLangId(saved)) return saved;
  } catch { /* приватний режим */ }

  /* Системна мова — перша в списку браузера. Російська там означає,
     що людина живе з російським інтерфейсом, тож і журнал їй
     показуємо російською, незалежно від країни. */
  try {
    const first = String((navigator.languages && navigator.languages[0]) || navigator.language || '').slice(0, 2).toLowerCase();
    if (first === 'ru') return 'ru';
  } catch { /* старий браузер */ }

  const cc = String(window.__EDGE_CC__ || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1') return cc === 'UA' ? 'uk' : 'en';

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (UA_TZ.test(tz)) return 'uk';
  } catch { /* старий браузер */ }

  const langs = (navigator.languages?.length ? navigator.languages : [navigator.language || ''])
    .map((l) => String(l).slice(0, 2).toLowerCase());
  if (langs.some((l) => l === 'uk')) return 'uk';
  if (langs.some((l) => l === 'ru')) return 'ru';
  return 'en';
}

function detect() {
  if (typeof window === 'undefined') return 'uk';
  return fromUrl() || preferredLang();
}

export const LANG = detect();
export const isEn = LANG === 'en';
export const isRu = LANG === 'ru';

/* Локаль для дат і чисел: toLocaleString(LOCALE, …), Intl.*(LOCALE). */
export const LOCALE = isEn ? 'en-US' : isRu ? 'ru-RU' : 'uk-UA';

/* Головна функція перекладу. Пара рядків поруч — щоб переклад не
   відставав від оригіналу непомітно. Працює й з масивами/обʼєктами:
   t([...uk], [...en]). Третій аргумент — російська, його дописує
   збірка (scripts/ruI18n.mjs); немає — лишається українська. */
export const t = (uk, en, ru) => (isEn ? en : isRu ? (ru ?? uk) : uk);

/* Для довідників-констант: pickLang({ uk: …, en: … }). */
export const pickLang = (v) => (isEn ? v.en : isRu ? (v.ru ?? v.uk) : v.uk);

/* Вибір мови з налаштувань: запамʼятати й перезавантажити. */
export function setLang(id) {
  if (!isLangId(id)) return;
  try { localStorage.setItem(LANG_KEY, id); } catch { /* приватний режим */ }
  window.location.reload();
}

if (typeof document !== 'undefined') document.documentElement.lang = LANG;
/* Для умов isEn ? … : …, які збірка доповнює російською (scripts/ruI18n.mjs). */
if (typeof globalThis !== 'undefined') globalThis.__EDGE_LANG = LANG;

/* Українська множина: 1 прогін, 2–4 прогони, 5+ прогонів, 11–14 —
   теж «прогонів». Англійську рахуємо окремо — там лише one/other. */
export function pluralUk(n, one, few, many, ruOne, ruFew, ruMany) {
  /* Правило множини в російській те саме; форми дописує збірка. */
  if (isRu && ruOne != null) { one = ruOne; few = ruFew; many = ruMany; }
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/* Велика лише перша літера рядка. CSS `capitalize` робив великою першу
   літеру КОЖНОГО слова — і «понеділок, 28 вересня» ставав «Понеділок,
   28 Вересня». Українські місяці в датах пишуться з малої. */
export const capFirst = (v) => {
  const s = String(v ?? '');
  return s ? s[0].toLocaleUpperCase() + s.slice(1) : s;
};

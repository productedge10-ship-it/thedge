/* ==================================================================
   Чий це браузер.

   Частина стану живе в localStorage: дзеркала хмарних документів,
   чернетки, налаштування калькулятора. Ключі там без id користувача,
   і коли на тому самому пристрої входили в інший акаунт, новий акаунт
   підхоплював чуже: нікнейм, завдання, чекліст, — і ще й заливав це
   собі в базу як «перенесення старих даних».

   Тому пристрій памʼятає, чий він. Увійшов інший акаунт — усе, що
   належало попередньому, стирається до того, як сторінки встигнуть
   це прочитати. Хмарні дані при цьому не губляться: вони в базі й
   завантажаться знову, коли власник повернеться.

   Лишаємо лише налаштування самого пристрою (мова, тема читання,
   згорнутий сайдбар) і, звісно, сесію Supabase.
================================================================== */

const OWNER = 'edge_device_owner';

const KEEP = [
  OWNER,
  'edge_lang', 'edge_blog_reader', 'edge_fontlab', 'edge_flags_v1',
  'edge-sidebar-collapsed', 'edge.voice.lang', 'edge:chunk-reload',
];
const KEEP_PREFIX = [
  'sb-', // сесія Supabase
  'calculator_market_assets', // публічний список інструментів, кеш
];

const keep = (k) => KEEP.includes(k) || KEEP_PREFIX.some((p) => k.startsWith(p));

/* Викликається щоразу, коли зʼявляється сесія — ДО того, як застосунок
   відмалює сторінки. Перший вхід після оновлення (власника ще не
   записано) нічого не стирає: локальні дані тут, найімовірніше, саме
   цієї людини, і знищити їх було б гірше. */
export function claimDevice(uid) {
  if (!uid) return;
  try {
    const prev = localStorage.getItem(OWNER);
    if (prev && prev !== uid) {
      const doomed = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && !keep(k)) doomed.push(k);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
    }
    if (prev !== uid) localStorage.setItem(OWNER, uid);
  } catch { /* приватний режим — зберігати й нема чого */ }
}

/* Чи можна вважати безіменні локальні дані даними цього акаунта. */
export function isDeviceOwner(uid) {
  try { return !!uid && localStorage.getItem(OWNER) === uid; } catch { return false; }
}

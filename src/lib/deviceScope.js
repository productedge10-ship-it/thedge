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
const DEVICE_ID = 'edge_device_id';

const KEEP = [
  OWNER, DEVICE_ID,
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
  noteDevice(uid);
}

/* Мітка браузера для безкоштовних бектестів.

   Два безкоштовні бектести — на людину, а не на акаунт: інакше новий
   акаунт з тієї самої вкладки знову дає два. Тому браузер має свій
   випадковий id (переживає зміну акаунта — він у KEEP), а в базу йде
   лише його sha256 (`note_device`). Акаунти з однією міткою ділять
   лічильник у `backtest_free_left()`. Нічого про сам пристрій ми не
   збираємо; очистив сховище — отримав новий id, і це нормально:
   мета — прибрати найлегший обхід, а не стежити. */
let noted = null;
function noteDevice(uid) {
  if (!uid || noted === uid) return;
  noted = uid;
  (async () => {
    try {
      let id = localStorage.getItem(DEVICE_ID);
      if (!id) {
        id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/-/g, '');
        localStorage.setItem(DEVICE_ID, id);
      }
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`edge-device:${id}`));
      const mark = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const { supabase } = await import('./supabase');
      await supabase.rpc('note_device', { p_mark: mark });
    } catch { /* не критично: без мітки ліміт просто рахується по пошті */ }
  })();
}

/* Чи можна вважати безіменні локальні дані даними цього акаунта. */
export function isDeviceOwner(uid) {
  try { return !!uid && localStorage.getItem(OWNER) === uid; } catch { return false; }
}

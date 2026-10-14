import { t as tx } from './lang';

/* ==================================================================
   Перший запуск: коротка анкета + чекліст на Лаунчпаді.

   Живе в user_state під ключем onboard_v1 (useCloudState), тож
   відповіді бачить і сервер — лист-нагадування підлаштовує текст під
   платформу. Стара анкета «Про тебе» (onboarding) — окрема річ, її
   не чіпаємо.
================================================================== */

export const KEY = 'onboard_v1';

export const EMPTY = {
  status: 'new',      // new | done | later
  platform: null,     // mt5 | ctrader | match | tradelocker | other
  goal: null,         // challenge | steady | discipline | learning
  tpw: null,          // 1-5 | 5-15 | 15+
  at: null,
};

export function normalize(v) {
  if (!v || typeof v !== 'object') return { ...EMPTY };
  return { ...EMPTY, ...v };
}

/* Анкету пише Layout, а читає Лаунчпад — це два різні екземпляри
   useCloudState, які між собою не синхронізуються. Тому після
   відповіді шлемо подію з новим значенням. */
export const SAVED_EVENT = 'edge:onboard-saved';

/* Стан самого чекліста — окремим ключем, щоб чекліст і анкета ніколи
   не затирали записи одне одного. */
export const LIST_KEY = 'onboard_list';
export const LIST_EMPTY = { demo: false, collapsed: false, steps: [], done: false, propInterest: false };
export function normalizeList(v) {
  if (!v || typeof v !== 'object') return { ...LIST_EMPTY };
  return { ...LIST_EMPTY, ...v, steps: Array.isArray(v.steps) ? v.steps : [] };
}

export const PLATFORMS = [
  ['mt5', 'MT5'],
  ['ctrader', 'cTrader'],
  ['match', 'Match-Trader'],
  ['tradelocker', 'TradeLocker'],
  ['other', tx('Інша', 'Other')],
];

export const GOALS = [
  ['challenge', tx('Пройти челендж', 'Pass a challenge')],
  ['steady', tx('Стабільний плюс', 'Consistent profit')],
  ['discipline', tx('Дисципліна', 'Discipline')],
  ['learning', tx('Вчуся', 'Learning')],
];

export const TPW = [
  ['1-5', '1–5'],
  ['5-15', '5–15'],
  ['15+', '15+'],
];

export const platformName = (id) => (PLATFORMS.find((p) => p[0] === id) || [])[1] || '';

/* Платформа без автоімпорту — головний шлях ручне внесення. */
export const noAutoImport = (s) => !!s?.platform && s.platform !== 'mt5';

/* Чекліст живе 7 днів від реєстрації. */
export const CHECKLIST_DAYS = 7;

/* Демо з позначкою «з застосунку»: смуга демо тоді каже «це приклад»
   і веде назад у свій журнал, а не на реєстрацію. */
export const DEMO_FROM_KEY = 'edge_demo_from_app';
/* Демо відкривали — у демо клієнт бази підмінений, тож позначку
   лишаємо в localStorage, а чекліст забирає її при наступному показі. */
export const DEMO_SEEN_KEY = 'edge_demo_seen';
export const markDemoSeen = () => { try { localStorage.setItem(DEMO_SEEN_KEY, '1'); } catch { /* приватний режим */ } };
export const demoSeen = () => { try { return localStorage.getItem(DEMO_SEEN_KEY) === '1'; } catch { return false; } };
export const demoUrl = (section = 'journal') => `/demo/${section}?from=app`;

/* ==================================================================
   Власні сетапи бектесту.

   Окремої таблиці під них немає, і заводити її заради списку з
   десятка рядків — зайве: сетап стає «справжнім» тієї миті, коли
   потрапляє в теги збереженої угоди, і далі підтягується вже з неї.

   Локально зберігаємо тільки те, що людина щойно придумала і ще не
   встигла використати — інакше свіжий сетап зникав би з підказок до
   першого запису. Ключ спільний на всі бектести: назви сетапів у
   трейдера одні й ті самі, незалежно від прогону.
================================================================== */

const KEY = 'edge.backtest.setups';

export const BUILTIN_SETUPS = [
  'Silver Bullet', 'SFP', 'Manipulation', 'BOS',
  'OB retest', 'FVG', 'Swing', 'FOMO', 'Impatience',
];

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
  } catch {
    /* Пошкоджений або недоступний localStorage не має ламати форму */
    return [];
  }
};

const write = (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* Приватний режим — сетап просто не переживе перезавантаження */
  }
};

export const customSetups = read;

export function addCustomSetup(name) {
  const v = String(name || '').trim();
  if (!v) return read();
  const list = read();
  if (list.some((x) => x.toLowerCase() === v.toLowerCase())) return list;
  const next = [...list, v];
  write(next);
  return next;
}

export function removeCustomSetup(name) {
  const next = read().filter((x) => x !== name);
  write(next);
  return next;
}

/* Повний список для форми: вбудовані, свої, і те, що вже зустрічалось
   у цьому бектесті. Порядок сталий, дублікати без урахування регістру. */
export function allSetups({ used = [], custom = [] } = {}) {
  const seen = new Map();
  [...BUILTIN_SETUPS, ...custom, ...used].forEach((raw) => {
    const v = String(raw || '').trim();
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  });
  return [...seen.values()];
}

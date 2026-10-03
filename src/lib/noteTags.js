/* ==================================================================
   Теги нотаток — дворівневе дерево.

   Категорія  →  підтеги:      Price Action → FVG, Order Block…
   Тег у нотатці зберігається як рядок:  "Price Action" або
   "Price Action/FVG". Фільтр по категорії ловить і всі її підтеги.

   Дерево редагує сам користувач. Живе воно в базі — сторінка тягне
   його через useCloudState('note_tags'), зі старим ключем
   localStorage як джерелом для одноразового переносу. Тут лишається
   тільки дефолт і чиста робота з айді тегів, без сховища.
================================================================== */

import { isEn } from './lang';

export const SEP = '/';

/* Палітра приглушена навмисне: теги мають розрізнятись, але не
   світитись неоном поруч із текстом нотатки. */
export const CAT_COLORS = [
  '#7f9cc4', // холодний синій
  '#9b8fd6', // приглушений фіолет
  '#7fb896', // шавлієвий
  '#cba36b', // тепле золото
  '#d08c8c', // приглушена цегла
  '#6fb3b8', // морський
  '#b58cc4', // лавандовий
  '#a9a396', // теплий сірий
];

export const DEFAULT_TREE = [
  { name: 'Price Action', color: CAT_COLORS[0], children: ['FVG', 'Order Block', 'Ліквідність', 'Структура', 'BOS / CHoCH'] },
  { name: 'Психологія',   color: CAT_COLORS[1], children: ['FOMO', 'Тільт', 'Страх', 'Жадібність', 'Терпіння'] },
  { name: 'Дисципліна',   color: CAT_COLORS[2], children: ['За планом', 'Порушив правило', 'Рутина'] },
  { name: 'Ризик',        color: CAT_COLORS[3], children: ['Розмір позиції', 'Просадка', 'Менеджмент'] },
  { name: 'Новини',       color: CAT_COLORS[5], children: ['NFP', 'CPI', 'FOMC'] },
  { name: 'Актив',        color: CAT_COLORS[6], children: ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'NAS100'] },
  { name: 'Життя',        color: CAT_COLORS[7], children: ['Сон', 'Спорт', 'Настрій'] },
];

/* Назви тегів — це айді, вони лежать у нотатках рядком. Тому дефолтне
   дерево лишається українським, а англійською його тільки ПОКАЗУЄМО:
   інакше після зміни мови теги старих нотаток стали б «сиротами».
   Свої теги людина називає як хоче — їх не чіпаємо. */
const TAG_EN = {
  'Ліквідність': 'Liquidity', 'Структура': 'Structure',
  'Психологія': 'Psychology', 'Тільт': 'Tilt', 'Страх': 'Fear', 'Жадібність': 'Greed', 'Терпіння': 'Patience',
  'Дисципліна': 'Discipline', 'За планом': 'By the plan', 'Порушив правило': 'Broke a rule', 'Рутина': 'Routine',
  'Ризик': 'Risk', 'Розмір позиції': 'Position size', 'Просадка': 'Drawdown', 'Менеджмент': 'Management',
  'Новини': 'News', 'Актив': 'Asset', 'Життя': 'Life', 'Сон': 'Sleep', 'Спорт': 'Sport', 'Настрій': 'Mood',
};

/** Назва тегу чи категорії для показу (без зміни збереженого значення) */
export const tagName = (name) => (isEn && TAG_EN[name]) || name;

/* ---------- розбір айді ---------- */

export const splitTag = (id) => {
  const i = String(id || '').indexOf(SEP);
  return i === -1 ? [id, null] : [id.slice(0, i), id.slice(i + 1)];
};

/** Коротка назва для чипа: підтег показуємо без батька */
export const tagLabel = (id) => {
  const [cat, sub] = splitTag(id);
  return tagName(sub || cat);
};

/** Повна назва для тултипа / читалки */
export const tagPath = (id) => {
  const [cat, sub] = splitTag(id);
  return sub ? `${tagName(cat)} · ${tagName(sub)}` : tagName(cat);
};

export function tagColor(id, tree) {
  const [cat] = splitTag(id);
  const found = (tree || []).find((c) => c.name === cat);
  if (found) return found.color;
  /* тег із видаленої категорії — тримаємо стабільний нейтральний колір */
  let h = 0;
  const s = String(cat || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CAT_COLORS[h % CAT_COLORS.length];
}

/** Плоский список усіх доступних тегів: категорії + підтеги */
export function flattenTree(tree) {
  const out = [];
  (tree || []).forEach((c) => {
    out.push({ id: c.name, name: c.name, cat: c.name, sub: null, color: c.color });
    (c.children || []).forEach((s) =>
      out.push({ id: `${c.name}${SEP}${s}`, name: s, cat: c.name, sub: s, color: c.color }));
  });
  return out;
}

/** Чи підходить нотатка під вибраний тег. Категорія ловить і підтеги. */
export function noteMatchesTag(noteTags, selected) {
  if (!selected) return true;
  const list = noteTags || [];
  if (list.includes(selected)) return true;
  const [cat, sub] = splitTag(selected);
  if (sub) return false;
  return list.some((t) => splitTag(t)[0] === cat);
}

/* ---------- редагування дерева ---------- */

export function addCategory(tree, name, color) {
  const n = String(name || '').trim();
  if (!n || tree.some((c) => c.name.toLowerCase() === n.toLowerCase())) return tree;
  return [...tree, { name: n, color: color || CAT_COLORS[tree.length % CAT_COLORS.length], children: [] }];
}

export function addChild(tree, catName, childName) {
  const n = String(childName || '').trim();
  if (!n) return tree;
  return tree.map((c) => {
    if (c.name !== catName) return c;
    if ((c.children || []).some((s) => s.toLowerCase() === n.toLowerCase())) return c;
    return { ...c, children: [...(c.children || []), n] };
  });
}

export function removeTag(tree, id) {
  const [cat, sub] = splitTag(id);
  if (sub) return tree.map((c) => (c.name === cat ? { ...c, children: (c.children || []).filter((s) => s !== sub) } : c));
  return tree.filter((c) => c.name !== cat);
}

/** Теги, які є в нотатках, але вже зникли з дерева — щоб не губились у фільтрі */
export function orphanTags(tree, notes) {
  const known = new Set(flattenTree(tree).map((t) => t.id));
  const out = new Set();
  (notes || []).forEach((n) => (n.tags || []).forEach((t) => { if (!known.has(t)) out.add(t); }));
  return Array.from(out);
}

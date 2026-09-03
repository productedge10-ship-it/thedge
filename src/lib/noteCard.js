import { CAT_COLORS } from './noteTags';

/* ==================================================================
   Вигляд картки запису.

   Записник, у якому всі картки однакові, читається як таблиця: щоб
   знайти потрібну, доводиться читати кожну назву. Колір, іконка й
   обкладинка дають те, чого не дає текст, — впізнавання боковим
   зором, ще до читання.

   Усе тримається одним json-полем `card`, а не купкою колонок: це
   набір смаку, а не дані, і додати сюди ще одну ручку не має
   коштувати міграції.
================================================================== */

/* Палітра та сама, що в тегів і папок: третій набір кольорів у
   застосунку зробив би записник строкатим. */
export const CARD_COLORS = CAT_COLORS;

/* Іконки набрані під те, про що справді пишуть: сетап, помилка,
   ідея, правило, рутина, підсумок. Емодзі, а не свій набір SVG, —
   щоб не тримати іконотеку заради дев'яти картинок. */
export const CARD_ICONS = ['📈', '💡', '🔥', '⚠️', '✅', '🧠', '📚', '🎯', '🍲'];

export const CARD_SIZES = [
  { id: 'normal', name: 'Звичайна' },
  { id: 'tall', name: 'Висока' },
];

/* Фон картки. Не «тема», а рівно чотири варіанти щільності кольору:
   від нічого до сітки з крапок. Більше варіантів — і полиця стає
   строкатою, менше — і вибір нічого не міняє. */
export const CARD_BGS = [
  { id: 'none', name: 'Без фону' },
  { id: 'tint', name: 'Тонований' },
  { id: 'gradient', name: 'Градієнт' },
  { id: 'dots', name: 'Сітка' },
];

const HEX = /^#[0-9a-f]{6}$/i;

const DEFAULTS = { color: null, icon: '', cover: 'auto', size: 'normal', bg: 'none', trade: null, pin: false };

/* Читаємо завжди через це: у старих записів поля немає взагалі, а в
   нових воно могло приїхати з чужого клієнта. */
export const cardOf = (note) => {
  const raw = note && typeof note.card === 'object' && note.card ? note.card : {};
  return {
    ...DEFAULTS,
    ...raw,
    /* Свій колір теж дозволений: палітра — це підказка, а не паркан.
       Пускаємо тільки чистий hex, бо це значення йде прямо в style. */
    color: CARD_COLORS.includes(raw.color) || HEX.test(raw.color || '') ? raw.color : null,
    icon: CARD_ICONS.includes(raw.icon) ? raw.icon : '',
    cover: raw.cover === 'none' ? 'none' : 'auto',
    size: raw.size === 'tall' ? 'tall' : 'normal',
    bg: CARD_BGS.some((b) => b.id === raw.bg) ? raw.bg : 'none',
    /* Звʼязок з бектестом лежить тут же, а не окремою колонкою: це
       та сама «додаткова інформація про запис», і платити за неї
       ще однією міграцією не варто. */
    trade: raw.trade && raw.trade.id ? { id: String(raw.trade.id), name: String(raw.trade.name || 'Бектест') } : null,
    /* Закріплення теж тут: у нотаток немає своєї колонки під нього, а
       заводити другу міграцію заради одного прапорця не варто. */
    pin: !!raw.pin,
  };
};

/* Порожній вигляд не пишемо в базу: рядок `{}` нічого не означає,
   а місце й трафік займає. */
export const cardToSave = (card) => {
  const c = cardOf({ card });
  const out = {};
  if (c.color) out.color = c.color;
  if (c.icon) out.icon = c.icon;
  if (c.cover === 'none') out.cover = 'none';
  if (c.size === 'tall') out.size = 'tall';
  if (c.bg !== 'none') out.bg = c.bg;
  if (c.trade) out.trade = c.trade;
  if (c.pin) out.pin = true;
  return out;
};

/* Колір картки: спершу вибраний вручну, далі колір першого тега, і
   лише потім нейтральний. Ручний вибір мусить бити автоматику,
   інакше він виглядав би зламаним. */
export const cardColor = (note, tagColorOf) => {
  const c = cardOf(note);
  if (c.color) return c.color;
  const first = (note.tags || [])[0];
  return first && tagColorOf ? tagColorOf(first) : '#6b6980';
};

/* Фон картки в CSS. Колір той самий, що й у корінця, тому картка
   лишається однією плямою, а не двома. */
export const cardBackground = (bg, c, hovered) => {
  if (bg === 'tint') return `linear-gradient(165deg, ${c}24, #0b0b10)`;
  if (bg === 'gradient') return `linear-gradient(135deg, ${c}4d, ${c}12 60%, #0b0b10)`;
  if (bg === 'dots') return `radial-gradient(${c}59 0.9px, transparent 0.9px), linear-gradient(165deg, ${hovered ? '#16151f' : '#111116'}, #0b0b10)`;
  return `linear-gradient(165deg, ${hovered ? '#16151f' : '#111116'}, #0b0b10)`;
};

/* Обкладинка — перший скрін нотатки. Окремого поля під неї немає
   навмисно: людина вставляє графік, а не «обирає обкладинку». */
export const coverOf = (note) => {
  const c = cardOf(note);
  if (c.cover === 'none') return null;
  const first = (note.images || []).find((x) => typeof x === 'string');
  return first || null;
};

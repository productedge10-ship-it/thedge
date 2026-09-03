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
  { id: 'glow', name: 'Сяйво' },
  { id: 'dots', name: 'Крапки' },
  { id: 'grid', name: 'Сітка' },
  { id: 'lines', name: 'Смуги' },
  { id: 'aurora', name: 'Аврора' },
];

const HEX = /^#[0-9a-f]{6}$/i;

const DEFAULTS = { color: null, icon: '', cover: 'auto', size: 'normal', bg: 'none', trade: null, pin: false, voice: [] };

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
    /* Голосові: адреса файла плюс тривалість. Лежать тут, а не в
       `images`, бо звук — не картинка: читалка малює його плеєром, а
       не тегом <img>. */
    voice: Array.isArray(raw.voice)
      ? raw.voice.filter((v) => v && v.url).map((v) => ({ url: String(v.url), sec: Number(v.sec) || 0 }))
      : [],
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
  if (c.voice.length) out.voice = c.voice;
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
/* Фон картки.

   Повертаємо не рядок для `background`, а окремі властивості.

   Це не стиль, а вимога: скорочення `background` скидає
   `background-size` до `auto`. React оновлює інлайнові стилі по
   одній властивості, тож варто було миші зайти й вийти — картка
   перемальовувала `background`, розмір крапок злітав до
   стандартного, і візерунок зникав. Саме через це фон «встановився
   і пропав після наведення».
================================================================== */
export const cardBackground = (bg, c, hovered) => {
  const base = `linear-gradient(165deg, ${hovered ? '#16151f' : '#111116'}, #0b0b10)`;
  const plain = { backgroundColor: 'transparent', backgroundImage: base, backgroundSize: 'auto' };

  if (bg === 'tint') {
    return { ...plain, backgroundImage: `linear-gradient(165deg, ${c}2b, #0b0b10 70%)` };
  }

  if (bg === 'gradient') {
    return { ...plain, backgroundImage: `linear-gradient(135deg, ${c}59, ${c}14 55%, #0b0b10)` };
  }

  /* Світло з-за верхнього кута — те саме, що вже є на ховері картки,
     але постійне й сильніше. */
  if (bg === 'glow') {
    return {
      ...plain,
      backgroundImage: `radial-gradient(120% 90% at 12% -10%, ${c}4d, transparent 62%), ${base}`,
    };
  }

  if (bg === 'dots') {
    return {
      backgroundColor: '#0d0d12',
      backgroundImage: `radial-gradient(${c}80 1px, transparent 1px), ${base}`,
      backgroundSize: '10px 10px, cover',
    };
  }

  /* Тонка міліметрівка: дві лінії під прямим кутом. Читається як
     папір у клітинку, а не як шум. */
  if (bg === 'grid') {
    return {
      backgroundColor: '#0d0d12',
      backgroundImage: `linear-gradient(${c}2b 1px, transparent 1px), linear-gradient(90deg, ${c}2b 1px, transparent 1px), ${base}`,
      backgroundSize: '22px 22px, 22px 22px, cover',
    };
  }

  if (bg === 'lines') {
    return {
      backgroundColor: '#0d0d12',
      backgroundImage: `repeating-linear-gradient(135deg, ${c}24 0 1px, transparent 1px 9px), ${base}`,
      backgroundSize: 'auto, cover',
    };
  }

  /* Три різнокольорові плями, що перетікають одна в одну: колір
     картки, його сусід по колу і темрява. Найгучніший варіант —
     тому й останній у списку. */
  if (bg === 'aurora') {
    return {
      backgroundColor: '#0b0b10',
      backgroundImage: [
        `radial-gradient(90% 70% at 8% 0%, ${c}66, transparent 60%)`,
        `radial-gradient(80% 60% at 100% 20%, ${c}33, transparent 65%)`,
        `radial-gradient(70% 80% at 60% 110%, ${c}26, transparent 60%)`,
        base,
      ].join(', '),
      backgroundSize: 'auto, auto, auto, cover',
    };
  }

  return plain;
};

/* Обкладинка — перший скрін нотатки. Окремого поля під неї немає
   навмисно: людина вставляє графік, а не «обирає обкладинку». */
export const coverOf = (note) => {
  const c = cardOf(note);
  if (c.cover === 'none') return null;
  const first = (note.images || []).find((x) => typeof x === 'string');
  return first || null;
};

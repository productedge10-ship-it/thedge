/* ==================================================================
   Набір емодзі для іконок папок.

   Не повний Unicode: повний список це кілька тисяч символів, з яких
   у записнику знадобиться десь сто. Довгий список гірший за короткий
   не тому, що важчий, а тому, що в ньому доводиться шукати навіть
   тоді, коли знаєш, що хочеш.

   Ключові слова українською — щоб пошук працював тією мовою, якою
   людина думає, а не назвами з таблиці Unicode. Поруч — англійські,
   щоб пошук працював і в англійській версії.
================================================================== */

import { t as tx } from './lang';

export const EMOJI_GROUPS = [
  {
    id: 'work',
    name: tx('Робота', 'Work'),
    items: [
      ['📈', 'графік зростання ринок chart growth up market'],
      ['📉', 'графік падіння ринок chart down fall market'],
      ['📊', 'статистика звіт аналітика stats report analytics'],
      ['💹', 'ринок біржа market exchange'],
      ['💰', 'гроші прибуток money profit'],
      ['💵', 'гроші долар money dollar cash'],
      ['🏦', 'банк рахунок bank account'],
      ['📌', 'закріпити важливе pin important'],
      ['📎', 'скріпка вкладення paperclip attachment'],
      ['🗂', 'папки архів folders archive'],
      ['📁', 'папка folder'],
      ['📅', 'календар дата calendar date'],
      ['⏱', 'час таймер сесія time timer session'],
      ['✅', 'готово зроблено чекліст done check checklist'],
      ['❌', 'помилка ні mistake error no'],
      ['⚠️', 'увага ризик помилка warning risk mistake'],
    ],
  },
  {
    id: 'mind',
    name: tx('Думки', 'Thoughts'),
    items: [
      ['💡', 'ідея думка інсайт idea thought insight'],
      ['🧠', 'мозок психологія голова brain psychology mind'],
      ['🎯', 'ціль мета план target goal plan'],
      ['🔥', 'вогонь важливе гаряче fire important hot'],
      ['⚡️', 'швидко енергія імпульс fast energy impulse'],
      ['🧩', 'пазл система деталь puzzle system piece'],
      ['🔍', 'пошук розбір аналіз search review analysis'],
      ['🧪', 'тест експеримент бектест test experiment backtest'],
      ['📚', 'книги навчання books learning study'],
      ['✍️', 'записати нотатка write note'],
      ['🗒', 'нотатки список notes list'],
      ['💬', 'думка цитата розмова thought quote chat'],
      ['❓', 'питання question'],
      ['❗️', 'важливо important'],
      ['🚫', 'заборона правило forbidden rule ban'],
      ['🧘', 'спокій дисципліна calm discipline'],
    ],
  },
  {
    id: 'life',
    name: tx('Життя', 'Life'),
    items: [
      ['🏠', 'дім побут home house'],
      ['🍲', 'їжа рецепт борщ food recipe soup'],
      ['🍎', 'їжа фрукти food fruit apple'],
      ['☕️', 'кава ранок coffee morning'],
      ['🏋️', 'спорт зал тренування sport gym workout'],
      ['🏃', 'біг спорт run running sport'],
      ['🛏', 'сон відпочинок sleep rest'],
      ['✈️', 'подорож відпустка travel vacation trip'],
      ['🚗', 'авто дорога car road'],
      ['🎧', 'музика music'],
      ['🎬', 'кіно відео movie video'],
      ['🎮', 'ігри games gaming'],
      ['🐱', 'кіт тварини cat animals'],
      ['🌱', 'ріст звички growth habits'],
      ['🌙', 'вечір ніч evening night'],
      ['☀️', 'ранок день morning day sun'],
    ],
  },
  {
    id: 'signs',
    name: tx('Знаки', 'Signs'),
    items: [
      ['⭐️', 'зірка обране star favorite'],
      ['❤️', 'серце улюблене heart favorite love'],
      ['🔴', 'червоний red'],
      ['🟠', 'помаранчевий orange'],
      ['🟡', 'жовтий yellow'],
      ['🟢', 'зелений green'],
      ['🔵', 'синій blue'],
      ['🟣', 'фіолетовий purple'],
      ['⚫️', 'чорний black'],
      ['⬜️', 'білий white'],
      ['🔺', 'трикутник вгору triangle up'],
      ['🔻', 'трикутник вниз triangle down'],
      ['♾', 'нескінченність infinity'],
      ['🅰️', 'а літера a letter'],
      ['🆗', 'ок ok'],
      ['🔒', 'приватне замок private lock'],
    ],
  },
];

export const ALL_EMOJI = EMOJI_GROUPS.flatMap((g) => g.items.map(([e, k]) => ({ e, k, g: g.id })));

export const searchEmoji = (q) => {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return null;
  return ALL_EMOJI.filter((x) => x.k.includes(s) || x.e === s);
};

import { T } from '../../../lib/theme';

/* ==================================================================
   Палітра й рух дошки огляду.

   Взято з «Записника» — там уже вибудуваний той тон, який лишився
   після правок: майже невидимі рамки, картка з ледь помітним
   градієнтом, волосок світла зверху, підйом на три пікселі під
   курсором. Ніяких яскравих обводок і кольорових ярликів у кутах.

   Раніше дошка тягнула кольори з лендінга. Це давало ту саму
   палітру, але інший характер: лендінг має привертати увагу, а
   сторінка, у якій людина сидить щодня, — навпаки, не заважати.
================================================================== */

/* Палітра через токени теми — дошка світлішає разом із застосунком.
   Раніше значення були намертво темні (#121218 і т.п.), і у світлій
   темі вся аналітика лишалась чорною. Форму («ледь помітні рамки,
   картка з градієнтом, волосок світла зверху») зберігаємо — міняються
   лише самі кольори. */
export const P = {
  /* поверхні */
  card: 'linear-gradient(165deg, var(--edge-surface), var(--edge-surface))',
  cardHi: 'linear-gradient(165deg, var(--edge-surface-hi), var(--edge-surface))',
  sunken: 'var(--edge-sunken)',
  panel: 'var(--edge-panel)',

  /* рамки — навмисно майже невидимі */
  line: 'var(--edge-line)',
  lineHover: 'var(--edge-line-hi)',
  lineSoft: 'var(--edge-line)',

  /* текст */
  text: 'var(--edge-text)',
  text2: 'var(--edge-text2)',
  text3: 'var(--edge-text3)',
  text4: 'var(--edge-text3)',
  text5: 'var(--edge-text3)',
  dim: 'var(--edge-text4)',

  /* акцент і семантика */
  acc: 'var(--edge-acc)',
  accSoft: 'var(--edge-acc)',
  accDeep: 'var(--edge-acc)',
  ok: 'var(--edge-ok)',
  bad: 'var(--edge-bad)',
  warn: 'var(--edge-warn)',
};

export const F = { display: T.display, sans: T.sans, mono: T.mono };

/* Акцент у застосунку — CSS-змінна, тож альфу до неї не дописати
   рядком. Тільки через rgba з трійкою. */
export const A = (a) => `rgba(${T.accRgb}, ${a})`;

/* Пружина з «Записника»: легкий перескок за ціллю (1.2 у третьому
   параметрі) — саме він дає відчуття, що елемент має вагу, а не
   просто змінює координату. */
export const EASE_SOFT = 'cubic-bezier(.22,1.2,.36,1)';
export const CSS_SPRING = `transform .34s ${EASE_SOFT}, border-color .2s, background .2s, box-shadow .28s, opacity .2s`;

/* Для framer-motion. Два різні рухи, бо задачі різні:
   LAYOUT — картки розступаються під ту, яку тягнуть: має бути
   м'яко й трохи повільно, щоб око встигло за перестановкою.
   POP — поява й зникнення: коротше й пружніше. */
export const LAYOUT = { type: 'spring', stiffness: 340, damping: 34, mass: 0.85 };
export const POP = { type: 'spring', stiffness: 520, damping: 32, mass: 0.6 };
export const EASE = [0.22, 1, 0.36, 1];

/* ------------------------------------------------------------------
   Англійські підписи для панелі налаштувань.

   Один словник замість другої назви біля кожної опції в реєстрі.
   Причина проста: віджетів шістнадцять, перемикачів у них під два
   десятки, і половина підписів повторюється. Дублювати їх у кожному
   записі означало б, що виправлення формулювання доведеться вносити
   в сім місць.

   Чого немає в словнику — лишається як є. Забутий підпис має
   виглядати як забутий підпис, а не зникати.
------------------------------------------------------------------ */
export const EN = {
  /* заголовки віджетів */
  'Чистий R': 'Net R',
  'Вінрейт': 'Win rate',
  'Профіт-фактор': 'Profit factor',
  'Ціна тільта': 'Cost of tilt',
  'Очікування': 'Expectancy',
  'Серії': 'Streaks',
  'Крива еквіті': 'Equity curve',
  'Сесії': 'Sessions',
  'Дні тижня': 'Weekdays',
  'План проти порушень': 'Plan vs breaks',
  'Звідки береться R': 'Where R comes from',
  'Стан проти результату': 'State vs result',
  'Найдорожчі звички': 'Costliest habits',
  'Активи': 'Assets',
  'Сетапи': 'Setups',
  'Дисципліна': 'Discipline',

  /* назви перемикачів */
  'Графік': 'Chart',
  'Підпис': 'Caption',
  'Вигляд': 'View',
  'Висота': 'Height',
  'Просадка': 'Drawdown',
  'Показник': 'Metric',
  'Скільки рядків': 'Rows',
  'Порядок': 'Order',
  'Крива': 'Chart',
  'Висновок': 'Insight',
  'Сортувати за': 'Sort by',

  /* значення */
  'Площа': 'Area',
  'Лінія': 'Line',
  'Без графіка': 'None',
  'Кількість угод': 'Trades',
  'Середня угода': 'Avg trade',
  'Без підпису': 'None',
  'Виграші й програші': 'W / L',
  'Беззбиткові': 'Break-even',
  'Плюс і мінус': 'Gross',
  'Частка від прибутку': 'Share of profit',
  'Частка угод з помилкою': 'Mistake rate',
  'Середні виграш і програш': 'Avg win / loss',
  'Фактор відновлення': 'Recovery',
  'Низька': 'Small',
  'Середня': 'Medium',
  'Висока': 'Large',
  'Показати': 'Show',
  'Сховати': 'Hide',
  'Тільки цифри': 'Numbers only',
  'Сума R': 'Net R',
  'Стовпці': 'Bars',
  'Рядки': 'List',
  'Спершу найкращі': 'Best first',
  'Спершу найгірші': 'Worst first',
  'Усі': 'All',
  'Ціною': 'Cost',
  'Частотою': 'Count',
};

export const en = (s) => EN[s] || s;

/* ------------------------------------------------------------------
   Світло за курсором.

   Правило всього продукту: ховер не рухає блок. Підйом на три
   пікселі здається дрібницею, поки карток чотири; коли їх
   шістнадцять і вони різного розміру, сітка починає ворушитись під
   мишею — рядок наче вилазить назустріч. Замість руху — пляма
   світла, що йде за курсором: вона нічого не зсуває.

   Координати пишуться в CSS-змінні, а не в стан React: це подія на
   кожен рух миші, і перерендер на кожен кадр коштував би дорожче за
   саму підсвітку.
------------------------------------------------------------------ */
export function trackLight(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}

export const lightLayer = (tone, on, size = 280) => ({
  position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
  background: `radial-gradient(${size}px circle at var(--mx, 50%) var(--my, 0%), ${tone}1f, transparent 72%)`,
  opacity: on ? 1 : 0,
  transition: 'opacity .32s ease',
});

/* Волосок світла вздовж верхнього краю картки. */
export const hairline = (strong = false) => ({
  position: 'absolute', insetInline: 18, top: 0, height: 1, pointerEvents: 'none',
  background: `linear-gradient(90deg,transparent,${strong ? A(0.55) : 'rgba(var(--edge-hair-rgb),0.12)'},transparent)`,
});

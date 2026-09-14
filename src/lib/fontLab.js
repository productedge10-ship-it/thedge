/* ==================================================================
   Примірочна шрифтів.

   Вибір шрифта не робиться по картинці з двома словами: одна й та
   сама гарнітура може чудово виглядати в заголовку й розсипатись у
   підписі на 13 пікселів. Тому дивимось не зразок, а живу сторінку —
   перемикач міняє шрифт одразу всюди.

   Технічно все тримається на двох CSS-змінних: --edge-display і
   --edge-sans. Весь інтерфейс уже посилається на них через T.display
   і T.sans, тож підміна одного значення розходиться по всьому
   застосунку без єдиної правки в розмітці.

   Обовʼязкова умова для кожного кандидата — кирилиця. Гарнітура без
   неї покаже красиву латиницю в макеті й системний Arial у живому
   тексті, а це гірше, ніж не міняти нічого.
================================================================== */

export const KEY = 'edge_fontlab';

/* Ваги тягнемо всі, які гарнітура вміє. Без цього браузер підробляє
   відсутнє накреслення, розмазуючи контури, — і легкий Unbounded
   виглядає не легким, а брудним. */
const FULL = [300, 400, 500, 600, 700, 800, 900];

export const FONTS = [
  {
    id: 'main',
    name: 'Roboto',
    note: 'як було до Unbounded',
    stack: "'Roboto', system-ui, -apple-system, sans-serif",
    google: 'Roboto:wght@300;400;500;700;900',
    weights: [300, 400, 500, 700, 900],
  },
  {
    id: 'unbounded',
    name: 'Unbounded',
    note: 'зараз у заголовках',
    stack: "'Unbounded', system-ui, sans-serif",
    google: 'Unbounded:wght@300;400;500;600;700;800;900',
    weights: FULL,
  },
  {
    id: 'onest',
    name: 'Onest',
    note: 'нейтральний, сучасний',
    stack: "'Onest', system-ui, sans-serif",
    google: 'Onest:wght@300;400;500;600;700;800;900',
    weights: FULL,
  },
  {
    id: 'manrope',
    name: 'Manrope',
    note: 'мʼякий гротеск',
    stack: "'Manrope', system-ui, sans-serif",
    google: 'Manrope:wght@300;400;500;600;700;800',
    weights: [300, 400, 500, 600, 700, 800],
  },
  {
    id: 'golos',
    name: 'Golos Text',
    note: 'зараз у тексті',
    stack: "'Golos Text', system-ui, sans-serif",
    google: 'Golos+Text:wght@400;500;600;700;800;900',
    weights: [400, 500, 600, 700, 800, 900],
  },
  {
    id: 'rubik',
    name: 'Rubik',
    note: 'округлий, дружній',
    stack: "'Rubik', system-ui, sans-serif",
    google: 'Rubik:wght@300;400;500;600;700;800;900',
    weights: FULL,
  },
  {
    id: 'commissioner',
    name: 'Commissioner',
    note: 'спокійний, багато ваг',
    stack: "'Commissioner', system-ui, sans-serif",
    google: 'Commissioner:wght@300;400;500;600;700;800;900',
    weights: FULL,
  },
  {
    /* Etude Noire не роздає Google Fonts — його треба покласти в
       проєкт самому. Опція лишається тут, щоб не переробляти
       перемикач потім: щойни зʼявиться @font-face з такою назвою,
       кнопка почне працювати сама. */
    id: 'etude',
    name: 'Etude Noire',
    note: 'треба свій файл шрифта',
    stack: "'Etude Noire', system-ui, sans-serif",
    google: null,
    weights: FULL,
    byo: true,
  },
];

/* Те, що вже зашито в index.css і theme.js. Панель стартує з цього
   стану, і «повернути як було» веде сюди, а не до старого Roboto. */
export const BASE = {
  display: 'unbounded',
  sans: 'golos',
  headWeight: 600,
  textShift: -2,
  textWeight: 0,
};

export const byId = (id) => FONTS.find((f) => f.id === id) || FONTS[0];

/* Один тег на всі кандидатури: браузер сам не завантажить гарнітуру,
   поки нею нічого не намальовано, тому перелік у посиланні нічого не
   коштує, доки шрифт не вибрали. */
export function loadPreviewFonts() {
  if (document.getElementById('edge-fontlab')) return;

  const families = FONTS.filter((f) => f.google).map((f) => `family=${f.google}`).join('&');
  const css = document.createElement('link');
  css.id = 'edge-fontlab';
  css.rel = 'stylesheet';
  css.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.append(css);
}

/* ------------------------------------------------------------------
   Жирність.

   Тут дві різні задачі, і вирішувати їх однаково не можна.

   Заголовків мало, і в кожного та сама роль — їм можна просто
   призначити вагу. Текст навпаки: у ньому побудована ієрархія
   (звичайний, напівжирний, жирний), і якщо всьому призначити одне
   число, ієрархія зникне. Тому текст не задаємо, а зсуваємо: уся
   шкала стає на крок-два легшою, різниця між рівнями лишається.

   Саме про це просила Катя — «той самий Unbounded, але на 1-2 тони
   легший».
------------------------------------------------------------------ */

export const SCALE = [300, 400, 500, 600, 700, 800, 900];

export const SHIFTS = [
  { id: 0, name: 'як є' },
  { id: -1, name: 'легше' },
  { id: -2, name: 'ще легше' },
  { id: 1, name: 'важче' },
];

/* Найближча доступна вага: якщо гарнітура не вміє 600, беремо те, що
   поруч, а не дозволяємо браузеру домальовувати неіснуюче */
const nearest = (font, w) =>
  (font.weights || SCALE).reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));

const shifted = (font, base, shift) => {
  const i = SCALE.indexOf(base);
  const next = SCALE[Math.min(SCALE.length - 1, Math.max(0, i + shift))];
  return nearest(font, next);
};

const STYLE_ID = 'edge-fontlab-weights';

export function applyFonts({ display, sans, headWeight, textShift, textWeight }) {
  const root = document.documentElement;
  const dFont = byId(display);
  const sFont = byId(sans);

  root.style.setProperty('--edge-display', dFont.stack);
  root.style.setProperty('--edge-sans', sFont.stack);

  let tag = document.getElementById(STYLE_ID);
  if (!tag) {
    tag = document.createElement('style');
    tag.id = STYLE_ID;
    /* у кінець head — щоб перебивати утиліти Tailwind не важливістю,
       а порядком: так правила лишаються звичайними */
    document.head.append(tag);
  }

  const rules = [];

  if (textShift) {
    const map = { 400: 'normal', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };
    Object.entries(map).forEach(([w, cls]) => {
      rules.push(`.font-${cls}{font-weight:${shifted(sFont, Number(w), textShift)}}`);
    });
  }

  /* Лендінг не користується утилітами Tailwind: вага там стоїть
     інлайном у кожному блоці, і зсув шкали її не дістає. Тому для
     описів є друга ручка — пряма вага. Скоупимо на .ln-root, щоб
     правило не поїхало в застосунок, де ієрархію тримає textShift. */
  if (textWeight) {
    rules.push(`.ln-root p,.ln-root .lp-sub{font-weight:${nearest(sFont, textWeight)} !important}`);
  }

  if (headWeight) {
    /* заголовки мають перебити утиліту на самому елементі, а вона
       вагоміша за селектор по тегу — тут !important доречний */
    rules.push(`h1,h2,h3,h4,h5,h6{font-weight:${nearest(dFont, headWeight)} !important}`);
  }

  tag.textContent = rules.join('\n');
}

export function readChoice() {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return {
      display: v?.display || BASE.display,
      sans: v?.sans || BASE.sans,
      headWeight: v?.headWeight ?? BASE.headWeight,
      textShift: v?.textShift ?? BASE.textShift,
      textWeight: v?.textWeight ?? BASE.textWeight,
    };
  } catch {
    return { ...BASE };
  }
}

export function writeChoice(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* приватний режим */ }
}

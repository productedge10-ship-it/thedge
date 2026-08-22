/* ==================================================================
   Налаштування застосунку.

   Ярослав сформулював проблему точно: новачкові велика кількість
   розділів допомагає — він бачить, з чого складається робота. А
   досвідченому та сама повнота заважає, бо він давно знає свої три
   екрани й решту сприймає як шум.

   Одним інтерфейсом обидва випадки не закриваються. Тому все, що
   можна прибрати, має прибиратись: розділи в меню, анімації, живий
   фон. За замовчуванням лишається повна версія — людина, яка не
   знає, що їй потрібно, має побачити все.

   Зберігаємо в тій самій user_state, тому налаштування переїжджають
   між пристроями разом із рештою.
================================================================== */

export const KEY = 'settings';

/* Меню як дані, а не як розмітка. Раніше пункти жили прямо в JSX
   бічної панелі — і сховати щось означало правити розмітку. Тепер
   список один, а панель просто читає його. */
export const NAV = [
  {
    group: 'Routine',
    items: [
      { to: '/app', label: 'Launchpad', icon: 'LayoutGrid', end: true, fixed: true },
      { to: '/plan', label: 'Trading Plan', icon: 'Target' },
      { to: '/journal', label: 'Trading Journal', icon: 'BookOpen' },
      { to: '/20-trades', label: '20 Trades Method', icon: 'Activity' },
      { to: '/checklist', label: 'Trading Checklist', icon: 'ClipboardCheck' },
      { to: '/todo', label: 'Tasks / To-Do', icon: 'CheckSquare', badge: 'tasks' },
      { to: '/calculator', label: 'Calculator', icon: 'Calculator' },
    ],
  },
  {
    group: 'Research',
    items: [
      { to: '/news', label: 'News Calendar', icon: 'CalendarClock' },
      { to: '/analyses', label: 'Analyses', icon: 'FileText' },
      { to: '/reviews', label: 'Reviews', icon: 'BrainCircuit' },
      { to: '/backtest', label: 'Backtesting', icon: 'History' },
      { to: '/system', label: 'Trading System', icon: 'NotebookPen' },
      { to: '/notes', label: 'Notes', icon: 'FileText' },
    ],
  },
  {
    group: 'Data',
    items: [
      { to: '/analytics', label: 'Analytics', icon: 'BarChart2' },
      { to: '/accounts', label: 'Accounts', icon: 'Users' },
      { to: '/error', label: 'Error Log', icon: 'AlertTriangle' },
    ],
  },
];

export const ALL_NAV = NAV.flatMap((g) => g.items);

/* Launchpad не ховається: з нього є вихід у будь-який розділ, і без
   нього схований пункт неможливо знайти назад. */
export const HIDEABLE = ALL_NAV.filter((i) => !i.fixed);

export const MOTION = [
  { id: 'full', label: 'Повні', hint: 'усе рухається, як задумано' },
  { id: 'calm', label: 'Спокійні', hint: 'без фону й ефектів входу' },
  { id: 'off', label: 'Вимкнені', hint: 'нічого не рухається взагалі' },
];

/* ---------- світло за курсором ----------

   З фідбеку: «ефекти біля мишки відволікають, воно ніби і гарно, але
   мозок на них витрачає ресурс і дає разфокус». І там же, у кінці:
   «поки клацав, таки звик, і вони не напрягали».

   Друга частина важливіша за першу. Ефекти не зламані — вони
   завеликі на першому контакті. Людина, яка вперше бачить інтерфейс,
   витрачає увагу на рух; та, що вже орієнтується, його не помічає.
   Тому дефолт зменшуємо, а не вимикаємо, і лишаємо дорогу вгору для
   тих, кому яскраво подобається.

   Це окремо від `motion`: та настройка про рух елементів, ця — про
   світло під курсором. Раніше людина, яка хотіла живий інтерфейс без
   блимання під мишкою, змушена була вимикати все підряд. */
export const FX = [
  { id: 'off', label: 'Без світла', value: 0, hint: 'жодного ореолу під курсором' },
  { id: 'soft', label: 'Ледь помітно', value: 0.35, hint: 'натяк, який видно тільки якщо шукати' },
  { id: 'medium', label: 'Помірно', value: 0.6, hint: 'видно, але не тягне погляд' },
  { id: 'full', label: 'Яскраво', value: 1, hint: 'як було задумано спочатку' },
];

export const fxValue = (id) => (FX.find((f) => f.id === id) || FX[2]).value;

/* ---------- глибина розбору в угоді ----------

   З фідбеку: «можливо, забагато питань задає». Людина сама себе
   переконала, що воно окупиться, але перше враження зафіксувала — а
   не кожен дочитує до другої половини речення.

   Ключове в короткому режимі — які саме три питання лишаються.
   Це не «перші три зі списку», а ті, з яких аналітика справді щось
   будує: дотримання плану, поспіх і відігравання. Самооцінка настрою
   («був упевнений», «повторив би») цінна для рефлексії, але жодного
   патерну сама по собі не дає — тому саме вона й ховається.

   Помилка лишається в обох режимах: з неї народжується запис у
   Журналі помилок, і вимкнути її означало б відрізати цілий розділ. */
export const PSY = [
  { id: 'short', label: 'Коротко', hint: 'три питання, з яких будується статистика' },
  { id: 'full', label: 'Повністю', hint: 'усі сім — більше матеріалу для розбору' },
];

export const PSY_SHORT = ['followedPlan', 'rushed', 'hasMistake'];

/* ---------- ціль на тиждень ----------

   Плашка «Тиждень» у Лаунчпаді досі просто рахувала угоди й R, але
   виглядала як прогрес до чогось — і саме тому її налаштування
   шукали й не знаходили. Або ціль існує по-справжньому, або плашка
   не має вдавати прогрес.

   За замовчуванням ціль по дисципліні, а не по грошах. «+5R за
   тиждень» штовхає добирати угоди в четвер, коли їх немає, — тобто
   рівно на те, з чим журнал має боротись. Чисті дні такого стимулу
   не створюють: їх не можна набрати кількістю угод. */
export const GOALS = [
  {
    id: 'clean',
    label: 'Чисті дні',
    unit: 'днів',
    hint: 'дні, коли всі угоди були за планом і без помилок',
    def: 3,
    max: 7,
  },
  {
    id: 'trades',
    label: 'Кількість угод',
    unit: 'угод',
    hint: 'просто обсяг роботи за тиждень',
    def: 5,
    max: 40,
  },
  {
    id: 'r',
    label: 'Результат у R',
    unit: 'R',
    hint: 'тримай обережно: ціль по прибутку підштовхує добирати угоди',
    def: 5,
    max: 30,
  },
  {
    id: 'none',
    label: 'Без цілі',
    unit: '',
    hint: 'плашка просто підсумовує тиждень',
    def: 0,
    max: 0,
  },
];

export const goalById = (id) => GOALS.find((g) => g.id === id) || GOALS[0];

export const DEFAULTS = {
  nickname: '',
  theme: 'dark',
  motion: 'full',
  /* Помірно, а не яскраво: перше враження важить більше, ніж смак
     того, хто вже звик. Кому мало — вмикає в налаштуваннях. */
  fx: 'medium',
  psyMode: 'full',
  liveBg: true,
  hiddenNav: [],
  compact: false,
  goal: { type: 'clean', value: 3 },
};

function normGoal(g) {
  const kind = GOALS.some((x) => x.id === g?.type) ? g.type : 'clean';
  const def = goalById(kind);
  if (kind === 'none') return { type: 'none', value: 0 };

  const n = Number(g?.value);
  /* Ціль поза межами шкали — це або зіпсовані дані, або спроба
     поставити 40 чистих днів на тижні. І те, і те лікується
     поверненням до розумного значення, а не показом безглуздя. */
  const value = Number.isFinite(n) ? Math.min(def.max, Math.max(1, Math.round(n))) : def.def;
  return { type: kind, value };
}

export function normalize(v) {
  const known = new Set(HIDEABLE.map((i) => i.to));

  return {
    goal: normGoal(v?.goal),
    nickname: typeof v?.nickname === 'string' ? v.nickname.slice(0, 32) : '',
    theme: v?.theme === 'light' ? 'light' : 'dark',
    motion: MOTION.some((m) => m.id === v?.motion) ? v.motion : 'full',
    fx: FX.some((f) => f.id === v?.fx) ? v.fx : 'medium',
    psyMode: PSY.some((p) => p.id === v?.psyMode) ? v.psyMode : 'full',
    liveBg: typeof v?.liveBg === 'boolean' ? v.liveBg : true,
    /* Ховати можна тільки те, що існує зараз: розділ могли прибрати з
       коду, і його адреса в списку схованих не має нічого ламати. */
    hiddenNav: Array.isArray(v?.hiddenNav) ? v.hiddenNav.filter((x) => known.has(x)) : [],
    compact: !!v?.compact,
  };
}

/* Відкрити налаштування можна звідки завгодно — подія долітає до
   вікна, де б воно не було змонтоване. */
export const OPEN_EVENT = 'edge:settings';
export const openSettings = () => window.dispatchEvent(new Event(OPEN_EVENT));

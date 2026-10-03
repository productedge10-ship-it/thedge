/* ==================================================================
   Короткий тур застосунком.

   З фідбеку: «до цього журналу точно потрібен окремий обуч». Але тур
   не має пояснювати, де яка кнопка — якщо для кнопки потрібна
   інструкція, це дефект кнопки, а не брак навчання. Тому тут інше:
   у якому порядку цим користуватись і навіщо кожен розділ існує.

   Правила, за якими зроблено:

   • Сім кроків, не двадцять. Тур, який довший за хвилину,
     закривають на третьому екрані й більше не відкривають.
   • Кожен крок відповідає на «навіщо», а не на «що це». «Журнал
     помилок» видно й так; неочевидно, що він потрібен не для
     покаяння, а щоб перебирати.
   • Тур не блокує. Закрити можна будь-коли, повернутись — з FAQ.
   • Ніякого «крок 3 з 7» великими літерами. Прогрес — крапки внизу
     картки: видно, що кінець близько, і не рахується як завдання.
================================================================== */

import { t as tx } from './lang';

export const KEY = 'tour';

/* Ціль описується селектором, а не посиланням на елемент: тур не має
   знати нічого про внутрішній устрій сторінок, а сторінки — про тур.
   Єдиний контракт між ними — атрибут data-tour. */
/* Говорить кіт, тому й текст від першої особи. Це не забаганка: та
   сама фраза від безликої підказки читається як інструкція, а від
   когось — як пояснення. Друге дочитують. */
export const STEPS = [
  {
    id: 'hello',
    sel: '[data-tour="grid"]',
    route: '/app',
    title: tx('Привіт. Я тут живу', 'Hi. I live here'),
    text: tx('Покажу за хвилину, що де лежить. Це Лаунчпад — він показує не «що вміє журнал», а що не закрито сьогодні. Плитки стоять у тому порядку, в якому їх реально відкривають: спершу підготовка, потім робота, потім розбір.', 'I\'ll show you around in a minute. This is the Launchpad — it doesn\'t show “what the journal can do”, it shows what\'s still open today. The tiles follow the order you actually use them in: prep first, then work, then review.'),
    place: 'top',
  },
  {
    id: 'week',
    sel: '[data-tour="week"]',
    route: '/app',
    title: tx('Ціль тут про дисципліну', 'The goal here is discipline'),
    text: tx('За замовчуванням я рахую чисті дні, а не гроші. Ціль «+5R за тиждень» штовхає добирати угоди в четвер, коли їх немає — тобто рівно на те, від чого журнал і має відучувати. Хочеш інакше — тип цілі міняється в налаштуваннях.', 'By default I count clean days, not money. A “+5R this week” goal pushes you to force trades on Thursday when there aren\'t any — exactly the habit a journal should break. Want something else? Change the goal type in Settings.'),
    place: 'bottom',
  },
  {
    id: 'plan',
    sel: '[data-tour="nav-/plan"]',
    route: '/app',
    title: tx('День починається звідси', 'Your day starts here'),
    text: tx('План пишеться до відкриття ринку, а не після. Сенс не в тому, щоб вгадати рух — а в тому, щоб увечері було з чим звірити своє рішення.', 'Write the plan before the market opens, not after. The point isn\'t to guess the move — it\'s to have something to check your decisions against in the evening.'),
    place: 'right',
  },
  {
    id: 'journal',
    sel: '[data-tour="nav-/journal"]',
    route: '/app',
    title: tx('Угода — це два кроки', 'A trade is two steps'),
    text: tx('Спершу цифри, потім розбір себе. Друга частина і є журналом: без неї лишиться просто таблиця угод, яку й брокер покаже.', 'Numbers first, then a look at yourself. That second part is the actual journal: without it you just have a table of trades your broker already shows you.'),
    place: 'right',
  },
  {
    id: 'errors',
    sel: '[data-tour="nav-/error"]',
    route: '/app',
    title: tx('Помилки прилітають сюди самі', 'Mistakes land here on their own'),
    text: tx('Відзначив помилку в угоді й описав її — я вже поклав запис сюди, зі станом «не розібрано». Цей розділ потрібен не для покаяння, а щоб їх перебирати.', 'Mark a mistake in a trade and describe it — I\'ll file it here as “not reviewed”. This section isn\'t for beating yourself up, it\'s for working through them.'),
    place: 'right',
  },
  {
    id: 'analytics',
    sel: '[data-tour="nav-/analytics"]',
    route: '/app',
    title: tx('Тут я питаю «а що якби»', 'Here I ask “what if”'),
    text: tx('Є вкладка, де правила накладаються на твою власну історію: скільки забрали угоди в тільті, скільки коштувала торгівля поза планом. Це не прогноз заробітку — це ціна звички.', 'There\'s a tab that applies rules to your own history: how much tilt trades cost you, what trading off-plan cost you. It\'s not an earnings forecast — it\'s the price of a habit.'),
    place: 'right',
  },
  {
    id: 'calm',
    sel: '[data-tour="settings"]',
    route: '/app',
    title: tx('Забагато руху? Прибери', 'Too much motion? Turn it down'),
    text: tx('Я знаю, що світло за курсором і анімації подобаються не всім. У налаштуваннях є чотири рівні яскравості цього світла, окремий рубильник на всі анімації, і живий фон вимикається окремо. Нічого не ламається — просто стає тихіше.', 'I know the cursor glow and animations aren\'t for everyone. Settings has four glow levels, a switch for all animations, and the live background turns off separately. Nothing breaks — it just gets quieter.'),
    place: 'right',
  },
  {
    id: 'less',
    sel: '[data-tour="settings"]',
    route: '/app',
    title: tx('Забагато розділів? Сховай', 'Too many sections? Hide them'),
    text: tx('Там же ховаються пункти меню, а розбір угоди скорочується з семи питань до трьох. Нічого не видаляється назавжди — усе повертається однією кнопкою, коли захочеш.', 'That\'s also where you hide menu items and cut the trade review from seven questions to three. Nothing is deleted for good — it all comes back with one click whenever you want.'),
    place: 'right',
  },
  /* Останній крок навмисно не перелічує решту розділів. Список із
     десяти назв у кінці туру не запамʼятовується — а дозвіл полазити
     самому знімає відчуття, що щось пропустив. */
  {
    id: 'more',
    sel: '[data-tour="grid"]',
    route: '/app',
    title: tx('Це була основа. Далі — сам', 'That was the basics. Now explore'),
    text: tx('Тут ще купа всього: метод 20 угод, бектести, чекліст перед входом, розбори тижня, калькулятор позиції, торгова система. Полазь, потикай — нічого не зламаєш, а що не потрібно, приберемо з меню. Я буду поруч.', 'There\'s plenty more: the 20-trades method, backtests, a pre-entry checklist, weekly reviews, a position calculator, your trading system. Poke around — you can\'t break anything, and whatever you don\'t need we\'ll hide from the menu. I\'ll be around.'),
    place: 'top',
  },
];

export const EMPTY = { status: 'new', step: 0, at: null };

export function normalize(v) {
  const status = ['new', 'done', 'skipped'].includes(v?.status) ? v.status : 'new';
  const n = Number(v?.step);
  return {
    status,
    step: Number.isFinite(n) ? Math.max(0, Math.min(STEPS.length - 1, Math.round(n))) : 0,
    at: typeof v?.at === 'string' ? v.at : null,
  };
}

/* Відкрити можна звідки завгодно — подія долітає до вікна, де б воно
   не було змонтоване. */
export const OPEN_EVENT = 'edge:tour';
export const openTour = () => window.dispatchEvent(new Event(OPEN_EVENT));

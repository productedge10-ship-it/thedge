/* ==================================================================
   Сценарій підказок у пісочниці.

   Пʼять сторінок, які покривають цикл цілком: план до відкриття
   ринку → запис угоди → аналітика по тому, що з цього вийшло →
   вечірній розбір дня → рахунок, на якому це все відбувається. Решту
   розділів у демо не показуємо: без чужих даних вони порожні й
   нічого не пояснюють.

   Дані під капотом не вигадані наполовину: у demoDb.js кожен день із
   розбором має dayFlow/dayState/dayWhy — тому вкладка «Психологія» й
   аналізи не показують плиток «замало даних», а справжні цифри.

   Селектори — `data-tour` на справжніх елементах застосунку. Якщо
   елемент колись зникне, підказка стане по центру екрана, а не
   вкаже в порожнє місце.
================================================================== */

import { t as tx } from '../../lib/lang';

export const STEPS = [
  {
    route: '/plan',
    target: null,
    title: tx('Це справжній застосунок', 'This is the real app'),
    text: tx('Не картинка: кнопки працюють, модалки відкриваються, створене зберігається. Дані вигадані й живуть лише в цьому браузері — «Скинути» вгорі повертає все як було.', 'Not a screenshot: buttons work, modals open, what you create gets saved. The data is made up and lives only in this browser — “Reset” at the top puts everything back.'),
  },
  {
    route: '/plan',
    target: '[data-tour="nav-/plan"]',
    title: tx('Пʼять розділів', 'Five sections'),
    text: tx('План, журнал, аналітика, аналізи днів і рахунки. У справжньому журналі їх більше — тут лишив ті, що складаються в один робочий цикл.', 'Plan, journal, analytics, day analyses and accounts. The real journal has more — here I kept the ones that add up to one working cycle.'),
  },
  {
    route: '/plan',
    target: '[data-tour="plan-new"]',
    title: tx('День починається з плану', 'The day starts with a plan'),
    text: tx('Напрямок, рівні, чого чекаєш — усе до відкриття ринку. Натисни: створиться справжній план, і він лишиться в списку.', 'Direction, levels, what you’re waiting for — all before the market opens. Click it: a real plan gets created and stays in the list.'),
  },
  {
    route: '/plan',
    target: '[data-tour="plan-add-trade"]',
    title: tx('Угода прямо з плану', 'A trade straight from the plan'),
    text: tx('Та сама модалка запису, що й у журналі. Угода одразу знає, з якого плану вона вийшла — саме через цей звʼязок потім рахується дисципліна.', 'The same entry modal as in the journal. The trade knows which plan it came from — that link is what discipline is later measured by.'),
  },
  {
    route: '/journal',
    target: '[data-tour="nav-/journal"]',
    title: tx('Журнал угод', 'Trade journal'),
    text: tx('Тут живе історія. Ліва половина полів приїжджає з MetaTrader 5 сама, права — та, заради якої журнал і ведеться.', 'Your history lives here. The left half of the fields comes in from MetaTrader 5 on its own; the right half is the reason you keep a journal at all.'),
  },
  {
    route: '/journal',
    target: null,
    title: tx('Клікни будь-яку угоду', 'Click any trade'),
    text: tx('Відкриється картка: причина входу, стан, порушене правило, скріншот. Саме ці поля згодом перетворюються на статистику, якої немає у брокера.', 'A card opens: why you entered, your state, the rule you broke, a screenshot. These are the fields that later turn into stats your broker doesn’t have.'),
  },
  {
    route: '/analytics',
    target: '[data-tour="nav-/analytics"]',
    title: tx('Аналітика по угодах', 'Trade analytics'),
    text: tx('Дошка з плиток: чистий результат, вінрейт, крива еквіті, звідки береться прибуток. Кожну плитку можна прибрати, додати нову або перетягнути — розкладка твоя, а не задана згори.', 'A board of tiles: net result, win rate, equity curve, where the profit comes from. Remove any tile, add a new one or drag it around — the layout is yours, not handed down.'),
  },
  {
    route: '/analytics',
    target: '[data-tour="analytics-tab-Psychology"]',
    title: tx('Психологія теж порахована', 'Psychology is counted too'),
    text: tx('Не просто «тривога» чи «тільт» — а скільки саме коштував кожен стан у грошах. Це рахується з вечірніх розборів дня, а не вигадується: перейди на вкладку й подивись.', 'Not just “anxiety” or “tilt” — but exactly how much each state cost in money. It’s calculated from your evening day reviews, not made up: switch to the tab and see.'),
  },
  {
    route: '/analytics',
    target: '[data-tour="analytics-tab-AI"]',
    title: tx('Коуч уже читає журнал', 'The coach is already reading the journal'),
    text: tx('Позначку «скоро» видно чесно, але вкладка вже показує, яким буде розбір: порахований формулами по твоїх (вигаданих) угодах — де сидить перевага і яка звичка коштує найдорожче.', 'The “soon” badge is honest, but the tab already shows what the review will look like: calculated from your (made-up) trades — where your edge is and which habit costs the most.'),
  },
  {
    route: '/analyses',
    target: '[data-tour="nav-/analyses"]',
    title: tx('Розбір дня', 'Day review'),
    text: tx('Кожен план і те, що з ним сталось насправді, — поруч: влучні читання ринку, помилки в розборі, вихідні дні. Саме звідси аналітика бере психологію.', 'Every plan next to what actually happened: accurate market reads, mistakes, days off. This is where analytics gets its psychology from.'),
  },
  {
    route: '/analyses',
    target: null,
    title: tx('Клікни будь-який день', 'Click any day'),
    text: tx('Відкриється повний розбір: що планував, що сталось, чого це коштувало. Тиждень таких записів — і видно не настрій, а патерн.', 'The full review opens: what you planned, what happened, what it cost. A week of these and you see a pattern, not a mood.'),
  },
  {
    route: '/accounts',
    target: '[data-tour="nav-/accounts"]',
    title: tx('Рахунки й виплати', 'Accounts & payouts'),
    text: tx('Особисті та проп-рахунки в одному місці: баланс, ліміти просадки, історія виплат. Журнал знає, на якому рахунку була кожна угода.', 'Personal and prop accounts in one place: balance, drawdown limits, payout history. The journal knows which account every trade was on.'),
  },
  {
    route: '/accounts',
    target: '[data-tour="acc-add"]',
    title: tx('Додай свій', 'Add your own'),
    text: tx('Проп-рахунок питає ліміти денної й загальної просадки — далі застосунок сам стежить, скільки в тебе лишилось запасу.', 'A prop account asks for daily and max drawdown limits — then the app keeps track of how much room you have left.'),
  },
  {
    route: '/accounts',
    target: null,
    title: tx('Далі — твої дані', 'Next: your own data'),
    text: tx('У справжньому журналі все це рахується з твоїх угод і закрите на твій акаунт. Підказки вимикаються кнопкою вгорі, демо скидається сусідньою.', 'In the real journal all of this is calculated from your trades and locked to your account. Turn hints off with the button at the top; reset the demo with the one next to it.'),
  },
];

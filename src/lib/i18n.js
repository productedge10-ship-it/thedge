import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';

/* ==================================================================
   Мови лендінга.

   Три мови в одному словнику, а не три сторінки: тексти на вітрині
   міняються часто, і тримати їх у трьох файлах означає, що дві
   версії завжди будуть застарілі.

   Вибір лишається в localStorage — людина, яка повернулась із
   реклами вдруге, не має шукати перемикач знову.
================================================================== */

export const LANGS = [
  { id: 'en', short: 'EN', name: 'English' },
  { id: 'uk', short: 'UA', name: 'Українська' },
  { id: 'ru', short: 'RU', name: 'Русский' },
];

const KEY = 'edge_lang';

const detect = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS.some((l) => l.id === saved)) return saved;
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    if (nav === 'uk') return 'uk';
    if (nav === 'ru') return 'ru';
  } catch { /* приватний режим */ }
  return 'en';
};

/* ------------------------------------------------------------------ */
/*  Словник                                                            */
/* ------------------------------------------------------------------ */

const en = {
  nav: { product: 'Product', tryIt: 'Try it', pricing: 'Pricing', blog: 'Blog', faq: 'FAQ', login: 'Log in', start: 'Start free' },

  hero: {
    badge: 'Workspace · Analytics · AI coach',
    title1: 'Stop hunting for the perfect strategy.',
    title2: 'Understand the one you have.',
    sub: 'The Edge is a trader’s workspace: your plan, your trade journal, analytics and reviews in one place. It shows which of your decisions make money and which quietly drain it — so you build a system on evidence instead of feel.',
    cta: 'Start free',
    ctaAlt: 'Try the demo',
    trust1: 'No card required',
    trust2: 'Every table locked to your account',
  },

  cards: {
    adherence: 'Plan adherence',
    adherenceHint: 'hover to open',
    byPlan: 'By the plan',
    offPlan: 'Off plan',
    period: 'Net performance · All time',
    winRate: 'Win rate',
    profitFactor: 'Profit factor',
    trades: 'Trades',
    bestSession: 'Best session',
    bestPair: 'Best pair',
    worstHabit: 'Costliest habit',
    revenge: 'Revenge entries',
    cat1: 'You’re up on London and down on New York. Same setup, different hours.',
    cat2: 'Stop trading the first hour after a loss and this month turns green.',
  },



  paths: {
    priceLine: 'Free forever · Pro from $12/mo',
    title: 'Two ways in',
    demo: { tag: 'Try demo', text: 'Click through a sample journal right on this page. Nothing to install, nothing saved.', cta: 'Try demo' },
    free: { tag: 'Start free', text: 'Your own account, your own trades, kept forever. No card, no countdown.', cta: 'Start free' },
  },
  steps: {
    eyebrow: 'Three steps',
    items: [
      { title: 'Import', text: 'Connect MetaTrader 5 — closed positions land in the journal by themselves.' },
      { title: 'Log', text: 'Add the half no broker exports: the plan, the state you were in, the rule you broke.' },
      { title: 'Find your edge', text: 'The analytics rank sessions, setups and moods by what they actually pay.' },
    ],
  },

  platforms: {
    auto: 'Auto-import',
    manual: 'Manual, any broker',
    markets: ['Forex', 'Indices', 'Metals', 'Crypto', 'Futures', 'Stocks'],
    note: 'MetaTrader 5 imports itself. Everything else works manually — the journal cares about R and your state of mind, not about who filled the order.',
  },
  diff: {
    eyebrow: 'The difference',
    title1: 'You don’t lose to the market.',
    title2: 'You lose to the same three habits.',
    sub: 'Every trader knows something is leaking. Almost none can name it, because the evidence is scattered across screenshots, chats and memory. A journal turns that feeling into a number you can act on.',
    beforeTag: 'Without a journal',
    before: [
      'You know something is wrong, but you can’t name it.',
      'Revenge trades get noticed a week later, if at all.',
      'No idea which setup actually pays and which one you keep for comfort.',
      'Every drawdown feels like proof the strategy is broken.',
    ],
    afterTag: 'After 30 days of logging',
    after: [
      'Three habits named, each with a price tag in R.',
      'Tilt flagged the same evening, not next Friday.',
      'Best session, best pair and best state of mind — in numbers.',
      'Drawdowns read as data, because you can see the sample size.',
    ],
    stats: [
      'plan adherence, up from 51% in the first month',
      'fewer trades taken outside the plan',
      'recovered by cutting one losing session',
      'to log a trade with the full psychology block',
    ],
    statSuffix: [' min'],
    note: 'Sample account — the numbers a journal typically surfaces once you have 40+ trades in it. Your own figures will differ; that’s the whole point.',
  },

  play: {
    eyebrow: 'Touch it',
    title: 'Switch a trade off. Watch the story change.',
    sub: 'This is a live sample journal, not a screenshot. Turn off the trades you took off-plan and see what your account would have looked like without them. Same maths the app runs on your real trades.',
    sample: 'Sample journal',
    of: 'of',
    tradesWord: 'trades',
    reset: 'Reset',
    offPlanTag: 'off plan',
    netR: 'Net R',
    winRate: 'Win rate',
    profitFactor: 'Profit factor',
    adherence: 'Plan adherence',
    hintTrades: 'trades',
    hintNothing: 'nothing selected',
    hintWinners: 'share of winners',
    hintWinLoss: 'win / loss',
    hintBook: 'trades by the book',
    byPlan: 'By the plan',
    offPlan: 'Off plan',
    coach: 'What your coach sees',
    footnote: 'Switch trades off to see what your numbers look like without them. Same maths the app runs on your own journal.',
    moods: { calm: 'Calm', fomo: 'FOMO', tilt: 'Tilt', bored: 'Bored' },
    setups: { 'Sweep + FVG': 'Sweep + FVG', 'Judas swing': 'Judas swing', 'No setup': 'No setup', 'News spike': 'News spike', Revenge: 'Revenge', 'Late entry': 'Late entry' },
    insights: {
      empty: 'Turn a trade back on — there is nothing to read yet.',
      leak: (p, b, abs) => `Your setups make +${p}R. Everything you took outside the plan gives ${b}R. You don’t need a better strategy — you need to stop taking those ${abs} R away from yourself.`,
      clean: (net) => `Every trade here follows the plan, and the account is ${net > 0 ? '+' : ''}${net}R. This is what your journal looks like when discipline holds — remember the feeling.`,
      red: (net, n) => `Net ${net}R across ${n} trades. Look at which ones broke the plan before you touch the strategy — that’s almost always where the leak is.`,
      best: (setup, session) => `${setup} on ${session} carries this account. Everything else is noise you pay for.`,
    },
  },


  gloss: {
    hint: 'Unsure about a word? Hover the dotted ones.',
    terms: {
      R: { title: 'R', text: 'One R is the money you decided to risk on that trade. +2R means you made twice what you were willing to lose — so a 1% risk becomes a 2% gain. Counting in R lets you compare a $200 account to a $200,000 one.' },
      edge: { title: 'Edge', text: 'The part of your trading that actually makes money over many trades — a session, a setup, a state of mind. Everything else is noise you pay for.' },
      'Sweep + FVG': { title: 'Sweep + FVG', text: 'Price runs past an obvious high or low to trigger stops, then snaps back and leaves a gap behind. The entry is on the return into that gap.' },
      'Judas swing': { title: 'Judas swing', text: 'A fake move at the session open in the wrong direction, designed to trap early entries before the real move begins.' },
      Revenge: { title: 'Revenge trade', text: 'An entry taken right after a loss to win the money back. No setup, no plan — the position exists only because the last one hurt.' },
      'News spike': { title: 'News spike', text: 'The violent move on a data release. Spreads widen, stops get skipped, and the direction often reverses within minutes.' },
      'Late entry': { title: 'Late entry', text: 'Getting in after the move already happened, usually from fear of missing it. The stop ends up far away and the reward small.' },
      'No setup': { title: 'No setup', text: 'A trade that matches nothing in your playbook. It exists because you were watching the screen, not because the market offered something.' },
      Tilt: { title: 'Tilt', text: 'Trading from anger or frustration instead of the plan. It is the single most expensive state in most journals.' },
      FOMO: { title: 'FOMO', text: 'Entering because the move is running without you. The decision comes from the fear of missing out, not from the setup.' },
      Calm: { title: 'Calm', text: 'The state where you follow your own rules without arguing with them. In most journals this is also the most profitable one.' },
      Bored: { title: 'Bored', text: 'Trading to have something to do. Usually shows up in quiet sessions and quietly drains the account.' },
    },
  },
  product: {
    eyebrow: 'What’s inside',
    title1: 'You fill the journal.',
    title2: 'It does the thinking.',
    sub: 'Everything you write is connected. A trade knows which plan it came from, which account it hit, which state of mind you were in. That’s why the analytics can say something specific instead of showing you another pie chart.',
    tiles: [
      { title: 'Daily plan', text: 'Top-down analysis from 1W to 1m, bias, and a pre-session state check you can’t skip.' },
      { title: 'Trade journal', text: 'Entry, execution and the honest part: what you felt, what you broke, what it cost.' },
      { title: 'Analytics', text: 'Sessions, pairs, setups, weekdays and emotions — ranked by what they actually pay.' },
      { title: 'Weekly reviews', text: 'Pull a period together, name the pattern, commit to one change. Shareable by link.' },
      { title: 'Backtesting', text: 'Test an idea on history with the same stats engine, before it costs you money.' },
      { title: '20 Trades method', text: 'A discipline drill: twenty trades executed perfectly, four criteria each.' },
    ],
  },


  compare: {
    eyebrow: 'Honestly',
    title: 'Why not just a spreadsheet?',
    sub: 'You can log trades in anything. The question is what the thing does with them afterwards.',
    cols: ['Spreadsheet', 'Typical journal', 'Edge Journal'],
    rows: [
      { label: 'All your trades in one place', a: 'yes', b: 'yes', c: 'yes' },
      { label: 'Ties a trade to the plan it came from', a: 'no', b: 'no', c: 'yes' },
      { label: 'Records what you felt, not only what you did', a: 'no', b: 'part', c: 'yes' },
      { label: 'Names the habit that costs the most, in R', a: 'no', b: 'no', c: 'yes' },
      { label: 'Auto-import from MetaTrader 5', a: 'no', b: 'part', c: 'yes' },
      { label: 'Prop accounts with payout history', a: 'part', b: 'no', c: 'yes' },
      { label: 'A coach that talks about your head, not the chart', a: 'no', b: 'no', c: 'yes' },
    ],
  },

  mt5: {
    eyebrow: 'Auto-import',
    title: 'Your trades import themselves.',
    text: 'Connect MetaTrader 5 and every closed position lands in the journal on its own — entry, exit, volume, result. You only fill the part no broker can export: what you were thinking, what you broke, what you felt.',
    terminal: 'MetaTrader 5',
    account: 'Account #71042318 · Demo',
    closed: 'closed positions',
    send: 'Send to journal',
    sending: 'Sending…',
    sent: 'In your journal',
    journal: 'Edge Journal',
    empty: 'Nothing here yet',
    emptyHint: 'press the button on the left',
    importing: 'Landing…',
    done: 'Imported',
    tradesIn: 'trades imported in one click',
    replay: 'Again',
    cols: { pair: 'Symbol', type: 'Type', result: 'Result' },
    stats: { net: 'Net R', wr: 'Win rate', pf: 'Profit factor' },
    coach: 'Your coach',
    verdictGood: (setup, r) => `${setup} is carrying you: +${r}R on its own. This is the part worth doing more of.`,
    verdictBad: (r) => `Everything you took outside the plan gives ${r}R. Cut that and the same month turns green.`,
    footnote: 'You write only the human half: the plan it came from, the state you were in, the rule you broke.',
  },
  coach: {
    eyebrow: 'Your coach',
    title: 'The cat has read every trade you logged.',
    sub: 'Not a chatbot bolted onto a dashboard. It works from your own numbers — your adherence, your tilt trades, your best hours — and talks to you about the part no indicator covers: what happens in your head between the setup and the click.',
    bullets: [
      'Tells you which habit is costing the most, with the R attached.',
      'Notices when you’re trading angry before you do.',
      'Turns a bad week into one concrete rule for the next one.',
    ],
    chat: [
      'took a revenge trade again, gave back the whole morning',
      'Third time this month, and all three were within 20 minutes of a stop. Your rule already exists — 30 minutes away from the screen. It has never failed when you kept it.',
      'so my strategy is fine?',
      'Your plan trades are +11.4R. Everything else is −6.2R. The strategy is not the problem you’re solving this week.',
    ],
  },

  pricing: {
    eyebrow: 'Pricing',
    title: 'Less than one bad trade.',
    sub: 'Start free and keep the journal forever. Upgrade when you want the part that actually changes behaviour — the analytics and the coach.',
    freeName: 'Free',
    forever: 'forever',
    freeNote: 'Everything you need to build the habit.',
    freeFeatures: ['Daily plan with top-down analysis', 'Unlimited trade journal', 'Pre-session diagnostics', 'Tasks, checklist and notes', 'Trading system documents'],
    freeCta: 'Start free',
    proName: 'Pro',
    perMonth: '/ month',
    proBadge: 'Most useful',
    proNote1: 'Or',
    proNote2: '$99 a year',
    proNote3: '— two months on the house.',
    proFeatures: ['Everything in Free', 'Full analytics: sessions, setups, psychology', 'AI coach that reads your own trades', 'Backtesting with the same stats engine', 'Prop accounts with payout history', 'Shareable stat cards and public reviews'],
    proCta: 'Start free',
  },

  blog: {
    eyebrow: 'From the desk',
    title: 'What we find in the data.',
    cadence: 'New pieces every month',
    soon: 'Coming soon',
    posts: [
      { tag: 'Psychology', title: 'The 20-minute rule', text: 'Why almost every revenge trade happens inside the same window after a stop — and what closing the terminal is actually worth in R.' },
      { tag: 'Statistics', title: 'Your win rate is lying', text: 'A 41% win rate can outperform a 68% one. What to look at instead, and how to read your own sample without fooling yourself.' },
      { tag: 'Prop firms', title: 'Reading the rules first', text: 'Trailing versus static drawdown, news windows, payout timing. The five clauses that decide whether the account is passable at all.' },
    ],
  },


  proof: {
    joined: (n) => `${n} traders already logging`,
    mt5: 'MetaTrader 5 auto-import',
    speed: 'Connect MetaTrader 5 and your history lands in the journal in about three minutes. No CSV wrangling.',
    trustTitle: 'Why you can leave your trades here',
    trust: [
      { title: 'The data is yours', text: 'Not a marketing line. Every table is locked to your account at the database level, so a request for someone else’s trades returns nothing — not even to us by accident.' },
      { title: 'Private until you decide', text: 'Nothing is public by default. A plan, a review or a stat card becomes readable by link only when you open it yourself, and you can close that link again in one click.' },
      { title: 'No lock-in', text: 'Stop paying and the journal stays. Downgrading turns off Pro features, not your history — every trade you wrote is still there and still readable.' },
    ],
    quotesTitle: 'What traders say',
    quotes: [],
  },

  faq: {
    eyebrow: 'Before you ask',
    title: 'Four barriers, answered.',
    groups: [
      {
        tag: 'Security',
        lead: 'Your journal is private by default.',
        items: [
          { q: 'Who can actually see my trades?', a: 'Only you. Every table is locked to your account at the database level, not just hidden in the interface — even a crafted request returns nothing that is not yours.' },
          { q: 'What about the things I share?', a: 'Plans, reviews and stat cards become readable by link only when you explicitly open them, and you can close a link again at any moment. Nothing is public by default.' },
        ],
      },
      {
        tag: 'Integrations',
        lead: 'MetaTrader 5 imports itself.',
        items: [
          { q: 'How do my trades get in?', a: 'Connect MetaTrader 5 and closed positions import on their own — symbol, entry, exit, volume, result. Everything else you add by hand in under a minute per trade.' },
          { q: 'Which brokers and markets work?', a: 'Any of them. Forex, indices, metals, crypto, futures, stocks — the journal cares about R, setup and your state of mind, not about who filled the order.' },
        ],
      },
      {
        tag: 'Pricing',
        lead: 'Free forever, no card, no countdown.',
        items: [
          { q: 'Do I have to pay to start?', a: 'No. The plan, the journal, diagnostics, checklists and your trading system stay free with no time limit. Pro adds analytics, the coach, backtesting and prop accounts for $12 a month or $99 a year.' },
          { q: 'Can I cancel and keep my data?', a: 'Yes. Downgrading turns off the Pro features, not your journal — every trade you wrote stays yours and stays readable.' },
        ],
      },
      {
        tag: 'Value',
        lead: 'A spreadsheet stores. This one explains.',
        items: [
          { q: 'I already keep a spreadsheet. Why switch?', a: 'A spreadsheet cannot tell you that your Tuesday afternoons cost 9R, or that every revenge entry happens within twenty minutes of a stop. That difference is the entire product.' },
          { q: 'How long until it tells me something useful?', a: 'About twenty trades. Before that the sample is too small to trust, and the journal will say so instead of inventing a pattern.' },
        ],
      },
    ],
  },
  final: {
    title: 'You already have a strategy. What’s missing is proof that it works.',
    sub: 'Thirty days of honest logging and you’ll see which decisions feed you and which ones cost. The journal does the rest.',
    cta: 'Start free',
  },
};

const uk = {
  nav: { product: 'Продукт', tryIt: 'Спробувати', pricing: 'Ціни', blog: 'Блог', faq: 'Питання', login: 'Вхід', start: 'Почати безкоштовно' },

  hero: {
    badge: 'Робочий простір · Аналітика · AI-коуч',
    title1: 'Не шукай ідеальну стратегію.',
    title2: 'Зрозумій свою.',
    sub: 'The Edge — робочий простір трейдера: план, журнал угод, аналітика й розбори в одному місці. Він показує, які твої рішення приносять гроші, а які їх зʼїдають — щоб ти будував систему на фактах, а не на відчуттях.',
    cta: 'Почати безкоштовно',
    ctaAlt: 'Спробувати демо',
    trust1: 'Без картки',
    trust2: 'Кожна таблиця замкнена на твій акаунт',
  },

  cards: {
    adherence: 'Дисципліна',
    adherenceHint: 'наведи, щоб розгорнути',
    byPlan: 'За планом',
    offPlan: 'Повз план',
    period: 'Чистий результат · Весь час',
    winRate: 'Вінрейт',
    profitFactor: 'Профіт-фактор',
    trades: 'Угод',
    bestSession: 'Найкраща сесія',
    bestPair: 'Найкраща пара',
    worstHabit: 'Найдорожча звичка',
    revenge: 'Входи на емоціях',
    cat1: 'На Лондоні ти в плюсі, на Нью-Йорку в мінусі. Той самий сетап, інші години.',
    cat2: 'Не торгуй першу годину після стопу — і цей місяць стане зеленим.',
  },



  paths: {
    priceLine: 'Безкоштовно назавжди · Pro від $12/міс',
    title: 'Два шляхи',
    demo: { tag: 'Демо', text: 'Поклацай приклад журналу прямо на цій сторінці. Нічого ставити й нічого зберігати.', cta: 'Спробувати демо' },
    free: { tag: 'Акаунт', text: 'Свій акаунт, свої угоди, назавжди. Без картки й без зворотного відліку.', cta: 'Почати безкоштовно' },
  },
  steps: {
    eyebrow: 'Три кроки',
    items: [
      { title: 'Імпорт', text: 'Підключаєш MetaTrader 5 — закриті позиції лягають у журнал самі.' },
      { title: 'Запис', text: 'Дописуєш половину, якої не експортує брокер: план, стан, порушене правило.' },
      { title: 'Знайди перевагу', text: 'Аналітика ранжує сесії, сетапи й настрої за тим, скільки вони платять.' },
    ],
  },

  platforms: {
    auto: 'Автоімпорт',
    manual: 'Вручну, будь-який брокер',
    markets: ['Форекс', 'Індекси', 'Метали', 'Крипта', 'Фʼючерси', 'Акції'],
    note: 'MetaTrader 5 імпортується сам. Решта працює вручну — журналу важливі R і твій стан, а не хто виконав ордер.',
  },
  diff: {
    eyebrow: 'Різниця',
    title1: 'Ти програєш не ринку.',
    title2: 'Ти програєш тим самим трьом звичкам.',
    sub: 'Кожен трейдер відчуває, що десь тече. Майже ніхто не може назвати де, бо докази розкидані по скрінах, чатах і памʼяті. Журнал перетворює це відчуття на число, з яким уже можна щось зробити.',
    beforeTag: 'Без журналу',
    before: [
      'Знаєш, що щось не так, але не можеш назвати що.',
      'Угоду на емоціях помічаєш через тиждень. Якщо взагалі помічаєш.',
      'Не знаєш, який сетап реально платить, а який тримаєш для спокою.',
      'Кожна просадка здається доказом, що стратегія зламана.',
    ],
    afterTag: 'Через 30 днів записів',
    after: [
      'Три звички названі, у кожної цінник у R.',
      'Тілт видно того ж вечора, а не в пʼятницю.',
      'Найкраща сесія, пара і стан голови — у цифрах.',
      'Просадка читається як дані, бо видно розмір вибірки.',
    ],
    stats: [
      'дисципліни замість 51% у перший місяць',
      'менше угод повз план',
      'повернулось після відмови від однієї сесії',
      'щоб записати угоду разом з психологією',
    ],
    statSuffix: [' хв'],
    note: 'Приклад рахунку — цифри, які журнал зазвичай показує, коли в ньому вже 40+ угод. Твої будуть іншими, у цьому й суть.',
  },

  play: {
    eyebrow: 'Помацай',
    title: 'Вимкни одну угоду. Подивись, як зміниться історія.',
    sub: 'Це живий приклад журналу, а не скріншот. Вимкни угоди, які ти взяв повз план, і подивись, яким був би рахунок без них. Та сама математика, що працює на твоїх реальних угодах.',
    sample: 'Приклад журналу',
    of: 'з',
    tradesWord: 'угод',
    reset: 'Скинути',
    offPlanTag: 'повз план',
    netR: 'Чистий R',
    winRate: 'Вінрейт',
    profitFactor: 'Профіт-фактор',
    adherence: 'Дисципліна',
    hintTrades: 'угод',
    hintNothing: 'нічого не обрано',
    hintWinners: 'частка прибуткових',
    hintWinLoss: 'прибуток / збиток',
    hintBook: 'угод за правилами',
    byPlan: 'За планом',
    offPlan: 'Повз план',
    coach: 'Що бачить твій коуч',
    footnote: 'Вимикай угоди, щоб побачити свої цифри без них. Та сама математика, що працює на твоєму журналі.',
    moods: { calm: 'Спокій', fomo: 'FOMO', tilt: 'Тілт', bored: 'Нудьга' },
    setups: { 'Sweep + FVG': 'Свіп + FVG', 'Judas swing': 'Judas swing', 'No setup': 'Без сетапу', 'News spike': 'Сплеск на новині', Revenge: 'Відігравання', 'Late entry': 'Пізній вхід' },
    insights: {
      empty: 'Увімкни хоч одну угоду — поки що нема що читати.',
      leak: (p, b, abs) => `Твої сетапи дають +${p}R. Усе, що взято повз план, дає ${b}R. Тобі не потрібна краща стратегія — тобі треба перестати забирати в себе ці ${abs} R.`,
      clean: (net) => `Кожна угода тут за планом, і рахунок ${net > 0 ? '+' : ''}${net}R. Ось так виглядає твій журнал, коли дисципліна тримається. Запамʼятай це відчуття.`,
      red: (net, n) => `${net}R на ${n} угодах. Спершу подивись, які з них порушили план, і тільки потім чіпай стратегію — теча майже завжди там.`,
      best: (setup, session) => `${setup} на ${session} тягне весь рахунок. Решта — шум, за який ти платиш.`,
    },
  },


  gloss: {
    hint: 'Незнайоме слово? Наведи на підкреслені пунктиром.',
    terms: {
      R: { title: 'R', text: 'Один R — це гроші, якими ти вирішив ризикнути в цій угоді. +2R означає, що ти заробив удвічі більше, ніж готовий був втратити: ризик 1% перетворюється на 2% прибутку. Рахунок у R дозволяє порівняти рахунок на $200 з рахунком на $200 000.' },
      edge: { title: 'Edge', text: 'Та частина твоєї торгівлі, яка справді приносить гроші на дистанції — сесія, сетап, стан голови. Решта це шум, за який ти платиш.' },
      'Sweep + FVG': { title: 'Свіп + FVG', text: 'Ціна пробиває очевидний максимум чи мінімум, збиває стопи й одразу повертається, лишаючи по собі розрив. Вхід — на поверненні в цей розрив.' },
      'Judas swing': { title: 'Judas swing', text: 'Фальшивий рух на відкритті сесії в неправильний бік. Його завдання — зібрати ранні входи перед справжнім рухом.' },
      Revenge: { title: 'Відігравання', text: 'Вхід одразу після збитку, щоб повернути гроші. Без сетапу й без плану — позиція існує лише тому, що попередня зробила боляче.' },
      'News spike': { title: 'Сплеск на новині', text: 'Різкий рух на виході даних. Спреди розширюються, стопи проскакують, а напрямок часто розвертається за кілька хвилин.' },
      'Late entry': { title: 'Пізній вхід', text: 'Захід, коли рух уже стався, зазвичай зі страху його пропустити. Стоп виходить далеко, а прибуток малий.' },
      'No setup': { title: 'Без сетапу', text: 'Угода, яка не збігається ні з чим у твоєму плейбуці. Вона є тому, що ти дивився в екран, а не тому, що ринок щось запропонував.' },
      Tilt: { title: 'Тілт', text: 'Торгівля зі злості чи роздратування замість плану. У більшості журналів це найдорожчий стан з усіх.' },
      FOMO: { title: 'FOMO', text: 'Вхід тому, що рух іде без тебе. Рішення приймає страх пропустити, а не сетап.' },
      Calm: { title: 'Спокій', text: 'Стан, у якому ти виконуєш власні правила, не сперечаючись із ними. У більшості журналів він же й найприбутковіший.' },
      Bored: { title: 'Нудьга', text: 'Торгівля, щоб було чим зайнятись. Зазвичай трапляється в тихі сесії й тихо ж зʼїдає рахунок.' },
    },
  },
  product: {
    eyebrow: 'Що всередині',
    title1: 'Ти заповнюєш журнал.',
    title2: 'Він думає за тебе.',
    sub: 'Усе, що ти пишеш, повʼязане. Угода знає, з якого плану вона вийшла, на який рахунок лягла і в якому стані ти був. Саме тому аналітика каже щось конкретне, а не показує чергову кругову діаграму.',
    tiles: [
      { title: 'План на день', text: 'Аналіз згори вниз від 1W до 1m, напрямок і перевірка стану перед сесією, яку не можна пропустити.' },
      { title: 'Журнал угод', text: 'Вхід, виконання і чесна частина: що відчував, що порушив, скільки це коштувало.' },
      { title: 'Аналітика', text: 'Сесії, пари, сетапи, дні тижня й емоції — за тим, скільки вони реально платять.' },
      { title: 'Тижневі розбори', text: 'Зібрати період, назвати закономірність, вибрати одну зміну. Можна поділитись лінком.' },
      { title: 'Бектести', text: 'Перевір ідею на історії тим самим движком статистики, поки вона не коштувала грошей.' },
      { title: 'Метод 20 угод', text: 'Вправа на дисципліну: двадцять бездоганно виконаних угод, по чотири критерії на кожну.' },
    ],
  },


  compare: {
    eyebrow: 'Чесно',
    title: 'А чому не просто таблиця?',
    sub: 'Записувати угоди можна будь-де. Питання в тому, що інструмент робить з ними далі.',
    cols: ['Таблиця', 'Звичайний журнал', 'Edge Journal'],
    rows: [
      { label: 'Усі угоди в одному місці', a: 'yes', b: 'yes', c: 'yes' },
      { label: 'Звʼязує угоду з планом, з якого вона вийшла', a: 'no', b: 'no', c: 'yes' },
      { label: 'Записує, що ти відчував, а не тільки що зробив', a: 'no', b: 'part', c: 'yes' },
      { label: 'Називає звичку, яка коштує найдорожче, в R', a: 'no', b: 'no', c: 'yes' },
      { label: 'Автоімпорт з MetaTrader 5', a: 'no', b: 'part', c: 'yes' },
      { label: 'Проп-рахунки з історією виплат', a: 'part', b: 'no', c: 'yes' },
      { label: 'Коуч, що говорить про голову, а не про графік', a: 'no', b: 'no', c: 'yes' },
    ],
  },

  mt5: {
    eyebrow: 'Автоімпорт',
    title: 'Угоди імпортуються самі.',
    text: 'Підключаєш MetaTrader 5 — і кожна закрита позиція сама лягає в журнал: вхід, вихід, обсяг, результат. Ти заповнюєш лише те, чого не експортує жоден брокер: про що думав, що порушив, що відчував.',
    terminal: 'MetaTrader 5',
    account: 'Рахунок #71042318 · Демо',
    closed: 'закритих позицій',
    send: 'Відправити в журнал',
    sending: 'Відправляю…',
    sent: 'У твоєму журналі',
    journal: 'Edge Journal',
    empty: 'Поки порожньо',
    emptyHint: 'натисни кнопку зліва',
    importing: 'Приземляються…',
    done: 'Імпортовано',
    tradesIn: 'угод імпортовано одним кліком',
    replay: 'Ще раз',
    cols: { pair: 'Інструмент', type: 'Тип', result: 'Результат' },
    stats: { net: 'Чистий R', wr: 'Вінрейт', pf: 'Профіт-фактор' },
    coach: 'Твій коуч',
    verdictGood: (setup, r) => `${setup} тягне тебе сам: +${r}R. Ось цього варто робити більше.`,
    verdictBad: (r) => `Усе, що взято повз план, дає ${r}R. Прибери це — і той самий місяць стане зеленим.`,
    footnote: 'Ти пишеш лише людську половину: з якого плану вийшла угода, у якому стані ти був, яке правило порушив.',
  },
  coach: {
    eyebrow: 'Твій коуч',
    title: 'Кіт прочитав кожну твою угоду.',
    sub: 'Не чатбот, прикручений до дашборда. Він працює з твоїми цифрами — дисципліна, угоди на тілті, найкращі години — і говорить про те, чого не покриє жоден індикатор: що коїться в голові між сетапом і кліком.',
    bullets: [
      'Каже, яка звичка коштує найдорожче, з цифрою в R.',
      'Помічає, що ти торгуєш злий, раніше за тебе.',
      'Перетворює поганий тиждень на одне конкретне правило.',
    ],
    chat: [
      'знову взяв угоду на емоціях, віддав увесь ранок',
      'Третій раз за місяць, і всі три — протягом двадцяти хвилин після стопу. Твоє правило вже існує: тридцять хвилин без екрана. Воно жодного разу не підвело, коли ти його тримав.',
      'то моя стратегія норм?',
      'Угоди за планом дають +11.4R. Усе інше — −6.2R. Стратегія не та проблема, яку ти вирішуєш цього тижня.',
    ],
  },

  pricing: {
    eyebrow: 'Ціни',
    title: 'Дешевше за одну погану угоду.',
    sub: 'Почни безкоштовно і залиш журнал назавжди. Переходь на Pro, коли захочеш ту частину, яка справді змінює поведінку — аналітику й коуча.',
    freeName: 'Free',
    forever: 'назавжди',
    freeNote: 'Усе, щоб виробити звичку.',
    freeFeatures: ['План на день з аналізом згори вниз', 'Необмежений журнал угод', 'Діагностика перед сесією', 'Завдання, чекліст і нотатки', 'Документи торгової системи'],
    freeCta: 'Почати безкоштовно',
    proName: 'Pro',
    perMonth: '/ місяць',
    proBadge: 'Найкорисніше',
    proNote1: 'Або',
    proNote2: '$99 на рік',
    proNote3: '— два місяці в подарунок.',
    proFeatures: ['Усе з Free', 'Повна аналітика: сесії, сетапи, психологія', 'AI-коуч, що читає твої угоди', 'Бектести на тому самому движку', 'Проп-рахунки з історією виплат', 'Картки статистики й публічні розбори'],
    proCta: 'Почати безкоштовно',
  },

  blog: {
    eyebrow: 'З-за столу',
    title: 'Що ми знаходимо в даних.',
    cadence: 'Нові матеріали щомісяця',
    soon: 'Скоро',
    posts: [
      { tag: 'Психологія', title: 'Правило двадцяти хвилин', text: 'Чому майже кожна угода на емоціях трапляється в тому самому вікні після стопу — і скільки в R коштує просто закрити термінал.' },
      { tag: 'Статистика', title: 'Твій вінрейт бреше', text: '41% може бути кращим за 68%. На що дивитись натомість і як читати власну вибірку, не обманюючи себе.' },
      { tag: 'Проп-фірми', title: 'Спершу читай правила', text: 'Трейлінг проти статичної просадки, новинні вікна, строки виплат. Пʼять пунктів, які вирішують, чи можна взагалі пройти цей рахунок.' },
    ],
  },


  proof: {
    joined: (n) => `${n} трейдерів уже ведуть журнал`,
    mt5: 'Автоімпорт з MetaTrader 5',
    speed: 'Підключаєш MetaTrader 5 — і історія в журналі приблизно за три хвилини. Без вожкання з CSV.',
    trustTitle: 'Чому свої угоди можна лишити тут',
    trust: [
      { title: 'Дані твої', text: 'Це не маркетинговий рядок. Кожна таблиця замкнена на твій акаунт на рівні бази, тому запит на чужі угоди не поверне нічого — навіть нам випадково.' },
      { title: 'Закрито, поки ти не вирішиш', text: 'Публічного за замовчуванням немає. План, розбір чи картка статистики стають доступними за посиланням лише коли ти сам його відкриваєш, і закрити можна в один клік.' },
      { title: 'Без прив’язки', text: 'Перестанеш платити — журнал лишиться. Перехід назад вимикає можливості Pro, а не історію: кожна написана угода на місці й далі читається.' },
    ],
    quotesTitle: 'Що кажуть трейдери',
    quotes: [],
  },

  faq: {
    eyebrow: 'Поки не спитав',
    title: 'Чотири барʼєри, знято.',
    groups: [
      {
        tag: 'Безпека',
        lead: 'Твій журнал закритий за замовчуванням.',
        items: [
          { q: 'Хто насправді бачить мої угоди?', a: 'Тільки ти. Кожна таблиця замкнена на твій акаунт на рівні бази, а не просто прихована в інтерфейсі — навіть підроблений запит не поверне нічого чужого.' },
          { q: 'А те, чим я ділюсь?', a: 'Плани, розбори й картки статистики стають доступними за посиланням лише тоді, коли ти сам їх відкриваєш, і закрити посилання можна будь-якої миті. Публічного за замовчуванням тут немає.' },
        ],
      },
      {
        tag: 'Інтеграції',
        lead: 'MetaTrader 5 імпортується сам.',
        items: [
          { q: 'Як угоди потрапляють у журнал?', a: 'Підключаєш MetaTrader 5 — і закриті позиції імпортуються самі: інструмент, вхід, вихід, обсяг, результат. Решту дописуєш руками менш ніж за хвилину на угоду.' },
          { q: 'Які брокери й ринки підходять?', a: 'Будь-які. Форекс, індекси, метали, крипта, фʼючерси, акції — журналу важливі R, сетап і твій стан, а не хто виконав ордер.' },
        ],
      },
      {
        tag: 'Ціни',
        lead: 'Безкоштовно назавжди, без картки й відліку.',
        items: [
          { q: 'Треба платити, щоб почати?', a: 'Ні. План, журнал, діагностика, чеклісти й торгова система лишаються безкоштовними без обмеження в часі. Pro додає аналітику, коуча, бектести й проп-рахунки за $12 на місяць або $99 на рік.' },
          { q: 'Якщо скасую — дані лишаться?', a: 'Так. Перехід назад вимикає можливості Pro, а не твій журнал: кожна написана угода лишається твоєю і читається далі.' },
        ],
      },
      {
        tag: 'Навіщо',
        lead: 'Таблиця зберігає. Журнал пояснює.',
        items: [
          { q: 'У мене вже є таблиця. Навіщо переходити?', a: 'Таблиця не скаже, що вівторкові вечори коштують дев\'ять R, і що кожен вхід на емоціях трапляється протягом двадцяти хвилин після стопу. Уся суть продукту в цій різниці.' },
          { q: 'Скільки чекати першого висновку?', a: 'Приблизно двадцять угод. До того вибірка замала, щоб їй вірити, і журнал так і скаже, замість вигадувати закономірність.' },
        ],
      },
    ],
  },
  final: {
    title: 'Стратегія в тебе вже є. Бракує доказів, що вона працює.',
    sub: 'Тридцять днів чесних записів — і ти побачиш, які рішення тебе годують, а які коштують. Решту зробить журнал.',
    cta: 'Почати безкоштовно',
  },
};

const ru = {
  nav: { product: 'Продукт', tryIt: 'Попробовать', pricing: 'Цены', blog: 'Блог', faq: 'Вопросы', login: 'Вход', start: 'Начать бесплатно' },

  hero: {
    badge: 'Рабочее пространство · Аналитика · AI-коуч',
    title1: 'Не ищи идеальную стратегию.',
    title2: 'Пойми свою.',
    sub: 'The Edge — рабочее пространство трейдера: план, журнал сделок, аналитика и разборы в одном месте. Он показывает, какие твои решения приносят деньги, а какие их съедают — чтобы ты строил систему на фактах, а не на ощущениях.',
    cta: 'Начать бесплатно',
    ctaAlt: 'Попробовать демо',
    trust1: 'Без карты',
    trust2: 'Каждая таблица закрыта на твой аккаунт',
  },

  cards: {
    adherence: 'Дисциплина',
    adherenceHint: 'наведи, чтобы раскрыть',
    byPlan: 'По плану',
    offPlan: 'Мимо плана',
    period: 'Чистый результат · Всё время',
    winRate: 'Винрейт',
    profitFactor: 'Профит-фактор',
    trades: 'Сделок',
    bestSession: 'Лучшая сессия',
    bestPair: 'Лучшая пара',
    worstHabit: 'Самая дорогая привычка',
    revenge: 'Входы на эмоциях',
    cat1: 'На Лондоне ты в плюсе, на Нью-Йорке в минусе. Тот же сетап, другие часы.',
    cat2: 'Не торгуй первый час после стопа — и этот месяц станет зелёным.',
  },



  paths: {
    priceLine: 'Бесплатно навсегда · Pro от $12/мес',
    title: 'Два пути',
    demo: { tag: 'Демо', text: 'Покликай пример журнала прямо на этой странице. Ничего ставить и ничего сохранять.', cta: 'Попробовать демо' },
    free: { tag: 'Аккаунт', text: 'Свой аккаунт, свои сделки, навсегда. Без карты и без обратного отсчёта.', cta: 'Начать бесплатно' },
  },
  steps: {
    eyebrow: 'Три шага',
    items: [
      { title: 'Импорт', text: 'Подключаешь MetaTrader 5 — закрытые позиции ложатся в журнал сами.' },
      { title: 'Запись', text: 'Дописываешь половину, которую не экспортирует брокер: план, состояние, нарушенное правило.' },
      { title: 'Найди преимущество', text: 'Аналитика ранжирует сессии, сетапы и настроения по тому, сколько они платят.' },
    ],
  },

  platforms: {
    auto: 'Автоимпорт',
    manual: 'Вручную, любой брокер',
    markets: ['Форекс', 'Индексы', 'Металлы', 'Крипта', 'Фьючерсы', 'Акции'],
    note: 'MetaTrader 5 импортируется сам. Остальное работает вручную — журналу важны R и твоё состояние, а не кто исполнил ордер.',
  },
  diff: {
    eyebrow: 'Разница',
    title1: 'Ты проигрываешь не рынку.',
    title2: 'Ты проигрываешь тем же трём привычкам.',
    sub: 'Каждый трейдер чувствует, что где-то течёт. Почти никто не может сказать где, потому что доказательства разбросаны по скринам, чатам и памяти. Журнал превращает это ощущение в число, с которым уже можно что-то сделать.',
    beforeTag: 'Без журнала',
    before: [
      'Знаешь, что что-то не так, но не можешь назвать что.',
      'Сделку на эмоциях замечаешь через неделю. Если вообще замечаешь.',
      'Не знаешь, какой сетап реально платит, а какой держишь для спокойствия.',
      'Каждая просадка кажется доказательством, что стратегия сломана.',
    ],
    afterTag: 'Через 30 дней записей',
    after: [
      'Три привычки названы, у каждой ценник в R.',
      'Тильт виден в тот же вечер, а не в пятницу.',
      'Лучшая сессия, пара и состояние головы — в цифрах.',
      'Просадка читается как данные, потому что видно размер выборки.',
    ],
    stats: [
      'дисциплины вместо 51% в первый месяц',
      'меньше сделок мимо плана',
      'вернулось после отказа от одной сессии',
      'чтобы записать сделку вместе с психологией',
    ],
    statSuffix: [' мин'],
    note: 'Пример счёта — цифры, которые журнал обычно показывает, когда в нём уже 40+ сделок. Твои будут другими, в этом и смысл.',
  },

  play: {
    eyebrow: 'Потрогай',
    title: 'Выключи одну сделку. Посмотри, как изменится история.',
    sub: 'Это живой пример журнала, а не скриншот. Выключи сделки, которые ты взял мимо плана, и посмотри, каким был бы счёт без них. Та же математика, что работает на твоих реальных сделках.',
    sample: 'Пример журнала',
    of: 'из',
    tradesWord: 'сделок',
    reset: 'Сбросить',
    offPlanTag: 'мимо плана',
    netR: 'Чистый R',
    winRate: 'Винрейт',
    profitFactor: 'Профит-фактор',
    adherence: 'Дисциплина',
    hintTrades: 'сделок',
    hintNothing: 'ничего не выбрано',
    hintWinners: 'доля прибыльных',
    hintWinLoss: 'прибыль / убыток',
    hintBook: 'сделок по правилам',
    byPlan: 'По плану',
    offPlan: 'Мимо плана',
    coach: 'Что видит твой коуч',
    footnote: 'Выключай сделки, чтобы увидеть свои цифры без них. Та же математика, что работает на твоём журнале.',
    moods: { calm: 'Спокойствие', fomo: 'FOMO', tilt: 'Тильт', bored: 'Скука' },
    setups: { 'Sweep + FVG': 'Свип + FVG', 'Judas swing': 'Judas swing', 'No setup': 'Без сетапа', 'News spike': 'Всплеск на новости', Revenge: 'Отыгрыш', 'Late entry': 'Поздний вход' },
    insights: {
      empty: 'Включи хотя бы одну сделку — пока нечего читать.',
      leak: (p, b, abs) => `Твои сетапы дают +${p}R. Всё, что взято мимо плана, даёт ${b}R. Тебе не нужна стратегия получше — тебе надо перестать забирать у себя эти ${abs} R.`,
      clean: (net) => `Каждая сделка здесь по плану, и счёт ${net > 0 ? '+' : ''}${net}R. Вот так выглядит твой журнал, когда дисциплина держится. Запомни это ощущение.`,
      red: (net, n) => `${net}R на ${n} сделках. Сначала посмотри, какие из них нарушили план, и только потом трогай стратегию — течь почти всегда там.`,
      best: (setup, session) => `${setup} на ${session} тянет весь счёт. Остальное — шум, за который ты платишь.`,
    },
  },


  gloss: {
    hint: 'Незнакомое слово? Наведи на подчёркнутые пунктиром.',
    terms: {
      R: { title: 'R', text: 'Один R — это деньги, которыми ты решил рискнуть в этой сделке. +2R значит, что ты заработал вдвое больше, чем готов был потерять: риск 1% превращается в 2% прибыли. Счёт в R позволяет сравнить счёт на $200 со счётом на $200 000.' },
      edge: { title: 'Edge', text: 'Та часть твоей торговли, которая действительно приносит деньги на дистанции — сессия, сетап, состояние головы. Остальное это шум, за который ты платишь.' },
      'Sweep + FVG': { title: 'Свип + FVG', text: 'Цена пробивает очевидный максимум или минимум, сбивает стопы и сразу возвращается, оставляя за собой разрыв. Вход — на возврате в этот разрыв.' },
      'Judas swing': { title: 'Judas swing', text: 'Ложное движение на открытии сессии в неправильную сторону. Его задача — собрать ранние входы перед настоящим движением.' },
      Revenge: { title: 'Отыгрыш', text: 'Вход сразу после убытка, чтобы вернуть деньги. Без сетапа и без плана — позиция существует только потому, что предыдущая сделала больно.' },
      'News spike': { title: 'Всплеск на новости', text: 'Резкое движение на выходе данных. Спреды расширяются, стопы проскакивают, а направление часто разворачивается за несколько минут.' },
      'Late entry': { title: 'Поздний вход', text: 'Заход, когда движение уже случилось, обычно из страха его пропустить. Стоп выходит далеко, а прибыль мала.' },
      'No setup': { title: 'Без сетапа', text: 'Сделка, которая не совпадает ни с чем в твоём плейбуке. Она есть потому, что ты смотрел в экран, а не потому, что рынок что-то предложил.' },
      Tilt: { title: 'Тильт', text: 'Торговля со злости или раздражения вместо плана. В большинстве журналов это самое дорогое состояние из всех.' },
      FOMO: { title: 'FOMO', text: 'Вход потому, что движение идёт без тебя. Решение принимает страх упустить, а не сетап.' },
      Calm: { title: 'Спокойствие', text: 'Состояние, в котором ты выполняешь собственные правила, не споря с ними. В большинстве журналов оно же и самое прибыльное.' },
      Bored: { title: 'Скука', text: 'Торговля, чтобы было чем заняться. Обычно случается в тихие сессии и тихо же съедает счёт.' },
    },
  },
  product: {
    eyebrow: 'Что внутри',
    title1: 'Ты заполняешь журнал.',
    title2: 'Он думает за тебя.',
    sub: 'Всё, что ты пишешь, связано. Сделка знает, из какого плана она вышла, на какой счёт легла и в каком состоянии ты был. Именно поэтому аналитика говорит что-то конкретное, а не показывает очередную круговую диаграмму.',
    tiles: [
      { title: 'План на день', text: 'Анализ сверху вниз от 1W до 1m, направление и проверка состояния перед сессией, которую нельзя пропустить.' },
      { title: 'Журнал сделок', text: 'Вход, исполнение и честная часть: что чувствовал, что нарушил, сколько это стоило.' },
      { title: 'Аналитика', text: 'Сессии, пары, сетапы, дни недели и эмоции — по тому, сколько они реально платят.' },
      { title: 'Недельные разборы', text: 'Собрать период, назвать закономерность, выбрать одно изменение. Можно поделиться ссылкой.' },
      { title: 'Бэктесты', text: 'Проверь идею на истории тем же движком статистики, пока она не стоила денег.' },
      { title: 'Метод 20 сделок', text: 'Упражнение на дисциплину: двадцать безупречно исполненных сделок, по четыре критерия на каждую.' },
    ],
  },


  compare: {
    eyebrow: 'Честно',
    title: 'А почему не просто таблица?',
    sub: 'Записывать сделки можно где угодно. Вопрос в том, что инструмент делает с ними дальше.',
    cols: ['Таблица', 'Обычный журнал', 'Edge Journal'],
    rows: [
      { label: 'Все сделки в одном месте', a: 'yes', b: 'yes', c: 'yes' },
      { label: 'Связывает сделку с планом, из которого она вышла', a: 'no', b: 'no', c: 'yes' },
      { label: 'Записывает, что ты чувствовал, а не только что сделал', a: 'no', b: 'part', c: 'yes' },
      { label: 'Называет привычку, которая стоит дороже всего, в R', a: 'no', b: 'no', c: 'yes' },
      { label: 'Автоимпорт из MetaTrader 5', a: 'no', b: 'part', c: 'yes' },
      { label: 'Проп-счета с историей выплат', a: 'part', b: 'no', c: 'yes' },
      { label: 'Коуч, который говорит о голове, а не о графике', a: 'no', b: 'no', c: 'yes' },
    ],
  },

  mt5: {
    eyebrow: 'Автоимпорт',
    title: 'Сделки импортируются сами.',
    text: 'Подключаешь MetaTrader 5 — и каждая закрытая позиция сама ложится в журнал: вход, выход, объём, результат. Ты заполняешь только то, чего не экспортирует ни один брокер: о чём думал, что нарушил, что чувствовал.',
    terminal: 'MetaTrader 5',
    account: 'Счёт #71042318 · Демо',
    closed: 'закрытых позиций',
    send: 'Отправить в журнал',
    sending: 'Отправляю…',
    sent: 'В твоём журнале',
    journal: 'Edge Journal',
    empty: 'Пока пусто',
    emptyHint: 'нажми кнопку слева',
    importing: 'Приземляются…',
    done: 'Импортировано',
    tradesIn: 'сделок импортировано одним кликом',
    replay: 'Ещё раз',
    cols: { pair: 'Инструмент', type: 'Тип', result: 'Результат' },
    stats: { net: 'Чистый R', wr: 'Винрейт', pf: 'Профит-фактор' },
    coach: 'Твой коуч',
    verdictGood: (setup, r) => `${setup} тянет тебя сам: +${r}R. Вот этого стоит делать больше.`,
    verdictBad: (r) => `Всё, что взято мимо плана, даёт ${r}R. Убери это — и тот же месяц станет зелёным.`,
    footnote: 'Ты пишешь только человеческую половину: из какого плана вышла сделка, в каком состоянии ты был, какое правило нарушил.',
  },
  coach: {
    eyebrow: 'Твой коуч',
    title: 'Кот прочитал каждую твою сделку.',
    sub: 'Не чатбот, прикрученный к дашборду. Он работает с твоими цифрами — дисциплина, сделки на тильте, лучшие часы — и говорит о том, чего не покроет ни один индикатор: что творится в голове между сетапом и кликом.',
    bullets: [
      'Говорит, какая привычка стоит дороже всего, с цифрой в R.',
      'Замечает, что ты торгуешь злой, раньше тебя.',
      'Превращает плохую неделю в одно конкретное правило.',
    ],
    chat: [
      'снова взял сделку на эмоциях, отдал всё утро',
      'Третий раз за месяц, и все три — в течение двадцати минут после стопа. Твоё правило уже существует: тридцать минут без экрана. Оно ни разу не подвело, когда ты его держал.',
      'так моя стратегия норм?',
      'Сделки по плану дают +11.4R. Всё остальное — −6.2R. Стратегия не та проблема, которую ты решаешь на этой неделе.',
    ],
  },

  pricing: {
    eyebrow: 'Цены',
    title: 'Дешевле одной плохой сделки.',
    sub: 'Начни бесплатно и оставь журнал навсегда. Переходи на Pro, когда захочешь ту часть, которая реально меняет поведение — аналитику и коуча.',
    freeName: 'Free',
    forever: 'навсегда',
    freeNote: 'Всё, чтобы выработать привычку.',
    freeFeatures: ['План на день с анализом сверху вниз', 'Безлимитный журнал сделок', 'Диагностика перед сессией', 'Задачи, чеклист и заметки', 'Документы торговой системы'],
    freeCta: 'Начать бесплатно',
    proName: 'Pro',
    perMonth: '/ месяц',
    proBadge: 'Самое полезное',
    proNote1: 'Или',
    proNote2: '$99 в год',
    proNote3: '— два месяца в подарок.',
    proFeatures: ['Всё из Free', 'Полная аналитика: сессии, сетапы, психология', 'AI-коуч, который читает твои сделки', 'Бэктесты на том же движке', 'Проп-счета с историей выплат', 'Карточки статистики и публичные разборы'],
    proCta: 'Начать бесплатно',
  },

  blog: {
    eyebrow: 'Из-за стола',
    title: 'Что мы находим в данных.',
    cadence: 'Новые материалы каждый месяц',
    soon: 'Скоро',
    posts: [
      { tag: 'Психология', title: 'Правило двадцати минут', text: 'Почему почти каждая сделка на эмоциях случается в том же окне после стопа — и сколько в R стоит просто закрыть терминал.' },
      { tag: 'Статистика', title: 'Твой винрейт врёт', text: '41% может быть лучше 68%. На что смотреть вместо этого и как читать свою выборку, не обманывая себя.' },
      { tag: 'Проп-фирмы', title: 'Сначала читай правила', text: 'Трейлинг против статической просадки, новостные окна, сроки выплат. Пять пунктов, которые решают, можно ли вообще пройти этот счёт.' },
    ],
  },


  proof: {
    joined: (n) => `${n} трейдеров уже ведут журнал`,
    mt5: 'Автоимпорт из MetaTrader 5',
    speed: 'Подключаешь MetaTrader 5 — и история в журнале примерно за три минуты. Без возни с CSV.',
    trustTitle: 'Почему свои сделки можно оставить здесь',
    trust: [
      { title: 'Данные твои', text: 'Это не маркетинговая строка. Каждая таблица закрыта на твой аккаунт на уровне базы, поэтому запрос на чужие сделки не вернёт ничего — даже нам случайно.' },
      { title: 'Закрыто, пока ты не решишь', text: 'Публичного по умолчанию нет. План, разбор или карточка статистики становятся доступны по ссылке только когда ты сам её открываешь, и закрыть можно в один клик.' },
      { title: 'Без привязки', text: 'Перестанешь платить — журнал останется. Переход назад выключает возможности Pro, а не историю: каждая написанная сделка на месте и дальше читается.' },
    ],
    quotesTitle: 'Что говорят трейдеры',
    quotes: [],
  },

  faq: {
    eyebrow: 'Пока не спросил',
    title: 'Четыре барьера, сняты.',
    groups: [
      {
        tag: 'Безопасность',
        lead: 'Твой журнал закрыт по умолчанию.',
        items: [
          { q: 'Кто на самом деле видит мои сделки?', a: 'Только ты. Каждая таблица закрыта на твой аккаунт на уровне базы, а не просто скрыта в интерфейсе — даже подделанный запрос не вернёт ничего чужого.' },
          { q: 'А то, чем я делюсь?', a: 'Планы, разборы и карточки статистики становятся доступны по ссылке только тогда, когда ты сам их открываешь, и закрыть ссылку можно в любой момент. Публичного по умолчанию здесь нет.' },
        ],
      },
      {
        tag: 'Интеграции',
        lead: 'MetaTrader 5 импортируется сам.',
        items: [
          { q: 'Как сделки попадают в журнал?', a: 'Подключаешь MetaTrader 5 — и закрытые позиции импортируются сами: инструмент, вход, выход, объём, результат. Остальное дописываешь руками меньше чем за минуту на сделку.' },
          { q: 'Какие брокеры и рынки подходят?', a: 'Любые. Форекс, индексы, металлы, крипта, фьючерсы, акции — журналу важны R, сетап и твоё состояние, а не кто исполнил ордер.' },
        ],
      },
      {
        tag: 'Цены',
        lead: 'Бесплатно навсегда, без карты и отсчёта.',
        items: [
          { q: 'Надо платить, чтобы начать?', a: 'Нет. План, журнал, диагностика, чеклисты и торговая система остаются бесплатными без ограничения по времени. Pro добавляет аналитику, коуча, бэктесты и проп-счета за $12 в месяц или $99 в год.' },
          { q: 'Если отменю — данные останутся?', a: 'Да. Переход назад выключает возможности Pro, а не твой журнал: каждая написанная сделка остаётся твоей и читается дальше.' },
        ],
      },
      {
        tag: 'Зачем',
        lead: 'Таблица хранит. Журнал объясняет.',
        items: [
          { q: 'У меня уже есть таблица. Зачем переходить?', a: 'Таблица не скажет, что вторничные вечера стоят девять R, и что каждый вход на эмоциях случается в течение двадцати минут после стопа. Вся суть продукта в этой разнице.' },
          { q: 'Сколько ждать первого вывода?', a: 'Примерно двадцать сделок. До этого выборка мала, чтобы ей верить, и журнал так и скажет, вместо того чтобы выдумывать закономерность.' },
        ],
      },
    ],
  },
  final: {
    title: 'Стратегия у тебя уже есть. Не хватает доказательств, что она работает.',
    sub: 'Тридцать дней честных записей — и ты увидишь, какие решения тебя кормят, а какие стоят денег. Остальное сделает журнал.',
    cta: 'Начать бесплатно',
  },
};

const DICT = { en, uk, ru };

/* ------------------------------------------------------------------ */
/*  Контекст                                                           */
/* ------------------------------------------------------------------ */

const LangCtx = createContext({ lang: 'en', setLang: () => {}, t: en });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(detect);

  const setLang = (id) => {
    setLangState(id);
    try { localStorage.setItem(KEY, id); } catch { /* приватний режим */ }
  };

  /* Пошуковики й читалки мають знати, якою мовою сторінка */
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t: DICT[lang] || en }), [lang]);
  return createElement(LangCtx.Provider, { value }, children);
}

export const useLang = () => useContext(LangCtx);

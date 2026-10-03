/* ==================================================================
   Перше знайомство.

   Journal без контексту однаково говорить із людиною, яка торгує
   шостий рік на пропі, і з тією, що відкрила термінал у березні. Це
   і робить поради беззмістовними: «дотримуйся плану» — правда для
   обох і не допомагає жодному.

   Тому на вході питаємо. Питання навмисно бінарні: «так/ні» людина
   відповідає чесно й швидко, а шкала від одного до пʼяти
   перетворює анкету на іспит, який хочеться закрити.

   Питання не про ринок. Про звички, стан і облік — тобто про те
   єдине, на що людина може вплинути.

   Тексти для користувача — українською (раніше анкета була
   російською, з вересня 2026 російської на сайті немає). Коли
   знадобиться друга мова, весь рядковий вміст цього файлу переїде
   у словник, структура від цього не зміниться.
================================================================== */

import { t as tx } from './lang';

export const KEY = 'onboarding';

export const DIMS = {
  exp:        { label: tx('Досвід', 'Experience'),      hint: tx('скільки ти вже в ринку', 'how long you\'ve been in the market') },
  system:     { label: tx('Система', 'System'),     hint: tx('наскільки правила записані', 'how well your rules are written down') },
  discipline: { label: tx('Дисципліна', 'Discipline'),  hint: tx('наскільки ти їх дотримуєшся', 'how well you stick to them') },
  state:      { label: tx('Стан', 'State'),        hint: tx('що з головою навколо торгівлі', 'your headspace around trading') },
  log:        { label: tx('Облік', 'Tracking'),       hint: tx('чи лишається слід від рішень', 'whether your decisions leave a record') },
};

/* good: true  — «так» це сильний бік
   good: false — «так» це те, що зʼїдає гроші                        */
export const QUESTIONS = [
  /* ---------- хто ти ---------- */
  { id: 'q1',  dim: 'exp', good: true,  text: tx('Ти торгуєш довше року?', 'Have you been trading for more than a year?') },
  { id: 'q2',  dim: 'exp', good: true,  text: tx('За останні три місяці ти торгував на реальних грошах?', 'Have you traded real money in the last three months?') },
  { id: 'q3',  dim: 'exp', good: true,  text: tx('У тебе є проп-акаунт або ти проходиш челендж?', 'Do you have a prop account or are you taking a challenge?') },
  { id: 'q4',  dim: 'exp', good: true,  text: tx('У тебе вже були місяці, закриті в плюс?', 'Have you had months that closed in profit?') },

  /* ---------- система ---------- */
  { id: 'q5',  dim: 'system', good: true, text: tx('Твої правила входу записані десь, окрім голови?', 'Are your entry rules written down anywhere besides your head?') },
  { id: 'q6',  dim: 'system', good: true, text: tx('Ти можеш назвати свій головний сетап одним реченням?', 'Can you describe your main setup in one sentence?') },
  { id: 'q7',  dim: 'system', good: true, text: tx('Ти торгуєш переважно один-два сетапи, а не все підряд?', 'Do you mostly trade one or two setups rather than everything?') },
  { id: 'q8',  dim: 'system', good: true, text: tx('Перед сесією ти розписуєш план на день?', 'Do you write out a daily plan before your session?') },
  { id: 'q9',  dim: 'system', good: true, text: tx('Ризик на угоду ти рахуєш у відсотках від депозиту?', 'Do you calculate risk per trade as a percentage of your account?') },
  { id: 'q10', dim: 'system', good: true, text: tx('У тебе є ліміт: скільки угод або скільки мінусів за день?', 'Do you have a daily limit on trades or losses?') },

  /* ---------- дисципліна ---------- */
  { id: 'q11', dim: 'discipline', good: false, text: tx('Буває, що заходиш без сетапу — просто тому, що дивишся в графік?', 'Do you sometimes enter without a setup — just because you\'re watching the chart?') },
  { id: 'q12', dim: 'discipline', good: false, text: tx('Після стопу ти заходиш знову протягом години?', 'After a stop-out, do you enter again within an hour?') },
  { id: 'q13', dim: 'discipline', good: false, text: tx('Буває, що збільшуєш ризик, щоб відігратись?', 'Do you ever increase risk to win it back?') },
  { id: 'q14', dim: 'discipline', good: false, text: tx('Пересуваєш стоп, коли ціна йде проти тебе?', 'Do you move your stop when price goes against you?') },
  { id: 'q15', dim: 'discipline', good: false, text: tx('Закриваєш прибуток раніше цілі, «щоб не зник»?', 'Do you close profits before the target "so they don\'t disappear"?') },
  { id: 'q16', dim: 'discipline', good: false, text: tx('Заходиш на новинах без заздалегідь готового плану?', 'Do you trade the news without a plan prepared in advance?') },

  /* ---------- стан ---------- */
  { id: 'q17', dim: 'state', good: false, text: tx('Результат торгового дня псує тобі вечір?', 'Does your trading result ruin your evening?') },
  { id: 'q18', dim: 'state', good: false, text: tx('Був день, коли ти віддав увесь місячний плюс?', 'Have you ever given back a whole month\'s profit in one day?') },
  { id: 'q19', dim: 'state', good: false, text: tx('Ти сідаєш торгувати, коли не виспався?', 'Do you trade when you haven\'t slept enough?') },
  { id: 'q20', dim: 'state', good: false, text: tx('Перевіряєш графік поза своєю сесією — вночі, у вихідні?', 'Do you check charts outside your session — at night, on weekends?') },
  { id: 'q21', dim: 'state', good: true,  text: tx('Ти вмієш пропустити день, коли відчуваєш, що не в тому стані?', 'Can you skip a day when you feel you\'re not in the right state?') },

  /* ---------- облік ---------- */
  { id: 'q22', dim: 'log', good: true, text: tx('Ти зараз ведеш журнал угод?', 'Do you currently keep a trading journal?') },
  { id: 'q23', dim: 'log', good: true, text: tx('Ти робиш розбір тижня або місяця?', 'Do you review your week or month?') },
  { id: 'q24', dim: 'log', good: true, text: tx('Можеш сказати, яка сесія приносить тобі найбільше?', 'Can you tell which session makes you the most?') },
  { id: 'q25', dim: 'log', good: true, text: tx('Ти знаєш, яка твоя помилка найдорожча в грошах?', 'Do you know which of your mistakes costs you the most money?') },
];

export const TOTAL = QUESTIONS.length;

/* ------------------------------------------------------------------
   Спостереження.

   Пʼять вердиктів по напрямках — це діагноз великими мазками, і на
   ньому зупинятись не можна: «дисципліна провисає» правда для
   половини трейдерів і не каже нічого.

   Цінне народжується з поєднань. «Заходиш після стопу» саме по собі
   ще нічого; «заходиш після стопу» разом із «збільшуєш ризик» — це
   вже описаний сценарій, у якому людина впізнає свій конкретний
   вечір. Тому тут не бали, а правила: кожне дивиться на кілька
   відповідей одразу.

   Правила статичні навмисно. Вони перевіряються, читаються й не
   вигадують — на відміну від тексту, згенерованого на льоту. Коли
   під це стане модель, вона братиме ті самі поєднання як вхід, а не
   замінятиме їх.
------------------------------------------------------------------ */

const yes = (a, id) => a[id] === true;
const no = (a, id) => a[id] === false;

export const PATTERNS = [
  {
    id: 'revenge-loop',
    when: (a) => yes(a, 'q12') && yes(a, 'q13'),
    text: tx('Після стопу ти повертаєшся в ринок протягом години — і з бі́льшим ризиком. Це не дві звички, а один сценарій, і він найдорожчий з можливих.', 'After a stop-out you\'re back in the market within an hour — and with bigger risk. That\'s not two habits but one scenario, and it\'s the most expensive one there is.'),
  },
  {
    id: 'prop-no-limits',
    when: (a) => yes(a, 'q3') && no(a, 'q10'),
    text: tx('У тебе проп-акаунт, але немає ліміту на кількість угод чи мінусів за день. Челенджі завалюють не погані входи, а один день без обмежень.', 'You have a prop account but no daily limit on trades or losses. Challenges aren\'t failed by bad entries — they\'re failed by one day without limits.'),
  },
  {
    id: 'blown-month',
    when: (a) => yes(a, 'q18'),
    text: tx('Ти вже віддавав місячний плюс за один день. Це майже ніколи не збіг обставин, а наслідок конкретного набору дій — і його видно в журналі за перші два тижні.', 'You\'ve already given back a month\'s profit in a single day. That\'s almost never bad luck — it\'s the result of a specific set of actions, and a journal shows it within the first two weeks.'),
  },
  {
    id: 'no-written-system',
    when: (a) => no(a, 'q5') && no(a, 'q6'),
    text: tx('Правил немає ні на папері, ні в одному реченні. Поки систему не записано, вона тихо змінюється щодня — і жодна статистика не покаже, що саме працює.', 'Your rules aren\'t on paper or in a single sentence. Until the system is written down, it quietly changes every day — and no stats will show what actually works.'),
  },
  {
    id: 'veteran-no-journal',
    when: (a) => yes(a, 'q1') && no(a, 'q22'),
    text: tx('Ти торгуєш понад рік без журналу. Пам’ять зберігає останні угоди й найяскравіші емоції — але не закономірності, а гроші роблять саме вони.', 'You\'ve traded for over a year without a journal. Memory keeps your latest trades and the strongest emotions — but not the patterns, and patterns are what make money.'),
  },
  {
    id: 'journal-unread',
    when: (a) => yes(a, 'q22') && no(a, 'q24') && no(a, 'q25'),
    text: tx('Журнал ти ведеш, але не можеш назвати ні найкращу сесію, ні найдорожчу помилку. Отже, записи накопичуються, а не читаються.', 'You keep a journal but can\'t name your best session or your costliest mistake. So the entries pile up instead of being read.'),
  },
  {
    id: 'moving-stop',
    when: (a) => yes(a, 'q14') && no(a, 'q9'),
    text: tx('Стоп рухається за ціною, а ризик не рахується у відсотках. У такій парі одна угода може коштувати стільки, скільки десять звичайних.', 'Your stop follows price, and risk isn\'t calculated in percent. With that combo, one trade can cost as much as ten normal ones.'),
  },
  {
    id: 'early-exit',
    when: (a) => yes(a, 'q15') && yes(a, 'q4'),
    text: tx('У тебе бувають плюсові місяці, і при цьому ти закриваєш прибуток раніше цілі. Найімовірніше, твоя система заробляє більше, ніж ти їй дозволяєш.', 'You have profitable months, yet you close profits before the target. Most likely your system earns more than you let it.'),
  },
  {
    id: 'boredom',
    when: (a) => yes(a, 'q11') && yes(a, 'q20'),
    text: tx('Ти заходиш, коли просто дивишся в графік, і дивишся в нього поза своєю сесією. Тут проблема не в терміналі, а в тому, скільки часу він займає на добу.', 'You enter just because you\'re watching the chart, and you watch it outside your session. The problem isn\'t the terminal — it\'s how much of your day it takes.'),
  },
  {
    id: 'tired',
    when: (a) => yes(a, 'q19') && yes(a, 'q17'),
    text: tx('Торгуєш невиспаним, і результат дня псує вечір. Стан до сесії передбачає її підсумок точніше за будь-який індикатор — це перше, що варто почати вимірювати.', 'You trade without enough sleep, and the day\'s result ruins your evening. Your state before a session predicts its outcome better than any indicator — it\'s the first thing worth measuring.'),
  },
  {
    id: 'everything',
    when: (a) => no(a, 'q7') && no(a, 'q8'),
    text: tx('Сетапів багато, плану на день немає. Через це кожна угода виглядає обґрунтованою в моменті — і жодна не повторюється достатньо, щоб її можна було перевірити.', 'Lots of setups, no daily plan. So every trade looks justified in the moment — and none repeats often enough to be tested.'),
  },
  {
    id: 'can-skip',
    when: (a) => yes(a, 'q21'),
    text: tx('Ти вмієш пропустити день, коли не в стані. Це рідше, ніж здається, і саме на цьому тримається все інше — тримайся за цю звичку.', 'You can skip a day when you\'re not in shape. That\'s rarer than it seems, and everything else rests on it — hold on to this habit.'),
  },
];

/* ------------------------------------------------------------------
   Портрет.

   Рахуємо не «бали», а частку сильних відповідей у кожному напрямку.
   Далі — найслабший напрямок, бо саме з нього починати найкорисніше:
   людині з готовою системою й розваленою дисципліною не потрібен
   ще один документ про правила.
------------------------------------------------------------------ */

export function portrait(answers = {}) {
  const score = {};

  Object.keys(DIMS).forEach((dim) => {
    const list = QUESTIONS.filter((q) => q.dim === dim);
    const answered = list.filter((q) => typeof answers[q.id] === 'boolean');
    const strong = answered.filter((q) => answers[q.id] === q.good).length;

    score[dim] = {
      total: list.length,
      answered: answered.length,
      strong,
      pct: answered.length ? Math.round((strong / answered.length) * 100) : 0,
    };
  });

  const dims = Object.keys(DIMS);
  const weakest = dims.reduce((a, b) => (score[b].pct < score[a].pct ? b : a));
  const strongest = dims.reduce((a, b) => (score[b].pct > score[a].pct ? b : a));

  /* Три спостереження, не більше. Довший список читається як діагноз
     «у тебе все погано» — і людина закриває вікно, а не змінює
     поведінку. */
  const notes = PATTERNS.filter((p) => p.when(answers)).slice(0, 3);

  return { score, weakest, strongest, notes, ...VERDICT[weakest] };
}

/* Перепройти анкету можна звідки завгодно: подія долітає до модалки,
   де б та не була змонтована. Це дешевше, ніж тягнути стан анкети
   через півзастосунку заради однієї кнопки. */
export const OPEN_EVENT = 'edge:onboarding';
export const openOnboarding = () => window.dispatchEvent(new Event(OPEN_EVENT));

/* Куди вести далі. Один розділ, а не список: людина, якій на вході
   показали чотирнадцять можливостей, не відкриє жодної. */
const VERDICT = {
  exp: {
    title: tx('Ти на початку — і це найкращий момент завести журнал', 'You\'re just starting — the best moment to start a journal'),
    text: tx('Більшість заводить його після того, як віддала ринку перші тисячі. У тебе є шанс увійти в статистику з першої сотні угод, а не зі спогадів про них.', 'Most people start one after giving the market their first few thousand. You get to build stats from your first hundred trades, not from memories of them.'),
    to: '/journal',
    cta: tx('Записати першу угоду', 'Log your first trade'),
  },
  system: {
    title: tx('Правила є в голові, але не на папері', 'Your rules are in your head, not on paper'),
    text: tx('Поки систему не записано, вона змінюється щодня непомітно для тебе — і жодна статистика не покаже, що саме працює. Почни з опису того, чим ти торгуєш насправді.', 'Until your system is written down, it shifts every day without you noticing — and no stats will show what actually works. Start by describing what you really trade.'),
    to: '/system',
    cta: tx('Описати свою систему', 'Describe your system'),
  },
  discipline: {
    title: tx('Проблема не в стратегії, а в її виконанні', 'The problem isn\'t the strategy — it\'s the execution'),
    text: tx('Твої відповіді описують знайому картину: правила є, і саме вони порушуються в конкретні моменти. Це найдорожча й водночас найшвидша до виправлення частина — бо її видно в цифрах.', 'Your answers paint a familiar picture: the rules exist, and they get broken at specific moments. It\'s the most expensive part and also the fastest to fix — because it shows up in the numbers.'),
    to: '/error',
    cta: tx('Зафіксувати першу помилку', 'Log your first mistake'),
  },
  state: {
    title: tx('Ринок забирає в тебе більше, ніж гроші', 'The market takes more from you than money'),
    text: tx('Стан голови до сесії передбачає її результат точніше за будь-який індикатор. Дві хвилини діагностики вранці — і за місяць буде видно, які дні тобі краще пропускати.', 'Your headspace before a session predicts its result better than any indicator. Two minutes of check-in each morning — and within a month you\'ll see which days to skip.'),
    to: '/plan',
    cta: tx('Пройти діагностику', 'Take the check-in'),
  },
  log: {
    title: tx('Рішення є, сліду від них не лишається', 'You make decisions, but they leave no trace'),
    text: tx('Ти торгуєш давно, але пам’ять зберігає кілька останніх угод і найяскравіші емоції — не закономірності. Двадцять записів, і журнал почне казати тобі те, чого ти про себе не знав.', 'You\'ve traded for a while, but memory keeps only your last few trades and strongest emotions — not the patterns. Twenty entries, and the journal will start telling you things you didn\'t know about yourself.'),
    to: '/journal',
    cta: tx('Почати вести журнал', 'Start your journal'),
  },
};

export const LEVEL = (pct) => {
  if (pct >= 80) return { label: tx('сильна сторона', 'strength'), tone: 'ok' };
  if (pct >= 55) return { label: tx('тримається', 'holding up'), tone: 'warn' };
  if (pct >= 30) return { label: tx('провисає', 'slipping'), tone: 'warn' };
  return { label: tx('болить', 'hurts'), tone: 'bad' };
};

export const EMPTY = { status: 'new', answers: {}, at: null };

/* Захист від старих і поламаних значень: анкета може змінитись, і
   відповідь на питання, якого більше немає, не повинна ламати підрахунок. */
export function normalize(v) {
  const known = new Set(QUESTIONS.map((q) => q.id));
  const answers = {};

  if (v?.answers && typeof v.answers === 'object') {
    Object.entries(v.answers).forEach(([k, val]) => {
      if (known.has(k) && typeof val === 'boolean') answers[k] = val;
    });
  }

  const status = ['new', 'later', 'done'].includes(v?.status) ? v.status : 'new';
  return { status, answers, at: v?.at || null };
}

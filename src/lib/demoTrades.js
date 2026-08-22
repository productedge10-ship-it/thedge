/* ==================================================================
   Генератор угод для перевірки симулятора.

   Живе тільки в памʼяті вкладки: нічого не пишеться в базу і не
   змішується з реальним журналом. Це стенд, а не дані.

   Навіщо взагалі: симулятор правил нічого не показує на десятку
   угод — та й не має показувати, він сам про це попереджає. Але
   тоді неможливо ні подивитись, як воно працює, ні перевірити
   верстку. Генератор дає повноцінну історію за одну секунду.

   Головне тут — закономірності мають бути справжні, а не випадкові.
   Якщо насипати рівномірного шуму, всі правила дадуть різницю
   близько нуля, і стенд не покаже нічого, крім того, що код не
   падає. Тому нижче закладені конкретні звички, які симулятор має
   вміти знаходити:

     • відіграш після мінусу — майже завжди мінус;
     • поспішний вхід гірший за спокійний, але не катастрофічно;
     • Нью-Йорк для цього трейдера збитковий, Лондон — навпаки;
     • один сетап явно кращий за решту;
     • дисципліна росте з часом — у другій половині історії порушень
       менше, щоб на кривій було видно перелом.
================================================================== */

/* Свій генератор, а не Math.random: та сама сіть має давати ту саму
   історію. Інакше кожен перерендер вкладки підсовував би нові
   цифри, і порівняти два набори правил було б неможливо. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ASSETS = ['EURUSD', 'XAUUSD', 'GER40', 'NAS100', 'GBPUSD'];
const SETUPS = ['Sweep + BOS', 'OB retest', 'FVG fill', 'Range fade'];
const SESSIONS = ['Asia', 'London', 'New York'];
const ACCOUNTS = ['FTMO 100K', 'Finding Pips 25K'];

/* Базова якість: наскільки цей контекст сам по собі виграшний.
   Значення — приблизна ймовірність плюса. */
/* Числа підбирались не «на око», а від точки беззбитковості. При
   середньому виграші близько 2.5R і мінусі в 1R беззбитковий вінрейт
   ≈ 29%. Тому все, що має бути збитковим, мусить опускатись помітно
   нижче — інакше контекст із гіршим вінрейтом усе одно виходить у
   плюс, і стенд показує протилежне тому, що мав показати. */
const SESSION_EDGE = { Asia: 0.40, London: 0.60, 'New York': 0.22 };
const SETUP_EDGE = {
  'Sweep + BOS': 0.64, 'OB retest': 0.48, 'FVG fill': 0.42, 'Range fade': 0.24,
};

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const r1 = (n) => Math.round(n * 10) / 10;

const dateBack = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const p = (x) => String(x).padStart(2, '0');
  return { iso: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, dow: d.getDay() };
};

export const DEMO_SIZES = [40, 80, 160];

export function generateTrades(count = 80, seed = 7) {
  const r = rng(seed);
  const out = [];

  /* Днів беремо приблизно вдвічі менше за угоди: виходить по одній-двох
     угодах на день, як у живому журналі. */
  const days = Math.max(20, Math.round(count / 1.8));
  let prevLoss = false;

  for (let i = 0; i < count; i += 1) {
    const daysAgo = days - Math.floor((i / count) * days);
    const { iso, dow } = dateBack(daysAgo);

    /* Прогрес у часі: у другій половині історії людина порушує
       рідше. Саме це дає перелом на кривій, а не рівний нахил. */
    const late = i / count > 0.5;
    const slip = late ? 0.45 : 1;

    const session = pick(r, SESSIONS);
    const setup = pick(r, SETUPS);
    const asset = pick(r, ASSETS);

    /* Відіграш можливий тільки після мінусу — інакше це не відіграш,
       а просто позначка настрою. */
    const revenge = prevLoss && r() < 0.28 * slip;
    const rushed = !revenge && r() < 0.22 * slip;
    const anxious = !revenge && !rushed && r() < 0.14;

    const offPlan = revenge || (r() < 0.18 * slip);
    const mistake = revenge ? r() < 0.7 : offPlan ? r() < 0.45 : r() < 0.06;

    /* Шанс плюса: контекст плюс штрафи за поведінку. Відіграш
       коштує найдорожче — саме його симулятор має ловити першим. */
    let p = (SESSION_EDGE[session] + SETUP_EDGE[setup]) / 2;
    if (revenge) p -= 0.34;
    if (rushed) p -= 0.14;
    if (anxious) p -= 0.06;
    if (offPlan) p -= 0.20;
    p = Math.max(0.05, Math.min(0.92, p));

    const roll = r();
    const isBE = roll > 0.96;
    const win = !isBE && r() < p;

    /* R виграшу: зі страхом виходять раніше, тому менший потенціал */
    const baseR = 1.4 + r() * 2.2;
    const rr = win ? r1(anxious ? baseR * 0.6 : baseR) : 1;

    const hour = session === 'Asia' ? 3 + Math.floor(r() * 4)
      : session === 'London' ? 9 + Math.floor(r() * 4)
        : 15 + Math.floor(r() * 4);

    out.push({
      id: `demo-${i}`,
      date: iso,
      dow,
      hour,
      asset,
      side: r() < 0.5 ? 'LONG' : 'SHORT',
      session,
      account: pick(r, ACCOUNTS),
      setup,
      emotion: revenge ? 'tilt' : anxious ? 'anxious' : win ? 'confident' : 'calm',
      result: isBE ? 'BE' : win ? 'WIN' : 'LOSS',
      rr,
      mistakes: mistake ? ['Порушення правила входу'] : [],
      planFollowed: !offPlan && !mistake,
      rushed,
      risk: 1,
      holdMin: 8 + Math.floor(r() * 220),
      note: '',
      demo: true,
    });

    prevLoss = !isBE && !win;
  }

  return out;
}

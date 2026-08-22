export const CATS = [
  { id: 'fomo',    label: 'FOMO Entry',        color: '#ff7a6b' },
  { id: 'haste',   label: 'Поспіх',            color: '#f0b13c' },
  { id: 'fear',    label: 'Страх',             color: '#9d8cff' },
  { id: 'early',   label: 'Ранній вихід',      color: '#4da3ff' },
  { id: 'revenge', label: 'Revenge Trading',   color: '#ff4d6d' },
  { id: 'tilt',    label: 'Тильт',             color: '#ff9f43' },
  { id: 'risk',    label: 'Порушення ризику',  color: '#ff3b4f' },
  { id: 'over',    label: 'Переторгівля',      color: '#3ddc97' }
];

/* ==================================================================
   Причини.

   Категорія відповідає на «що це було» — FOMO, поспіх, тільт.
   Причина відповідає на «чому це сталось», і саме з неї виводиться
   правило на наступний тиждень. «Поспішив» — це діагноз, з якого не
   випливає нічого. «Не дочекався підтвердження, бо боявся впустити
   рух» — уже випливає: чекати підтвердження або не торгувати.

   Список довгий навмисно. Коротким його зробити легко, але тоді
   людина щоразу вибирає найближче замість точного, і через місяць у
   журналі всі помилки виглядають однаково. Довгий список дратує один
   раз при виборі, короткий — знецінює весь розділ назавжди.

   Групи — не декорація: вони показують, що причини бувають різної
   природи, і що «не виспався» лікується не тим самим, що «немає
   правила для цього сценарію».
================================================================== */
/* Чотири головні. Формально це такі самі причини, як решта, але
   саме на них тримається вся статистика розділу — тому вони стоять
   першими й виглядають інакше.

   Питаннями вони бути перестали: окремий блок з «Так/Ні» змушував
   відповідати на всі чотири щоразу, навіть коли помилка була в
   одному. У списку причин людина позначає те, що справді сталось, і
   мовчання про решту лишається мовчанням, а не відповіддю «ні».

   `flag` — куди значення лягає в базі: ці чотири мають окремі
   колонки, бо по них рахується статистика, а не тільки читається
   текст. */
export const MAIN_REASONS = [
  { id: 'q-plan',   label: 'Угода була не по плану', flag: 'followed_plan', value: false },
  { id: 'q-fomo',   label: 'Заходив на FOMO',        flag: 'rushed',        value: true  },
  { id: 'q-system', label: 'Вхід не по своїй ТС',    flag: 'by_system',     value: false },
  { id: 'q-risk',   label: 'Ризик більший за звичайний', flag: 'risk_ok',   value: false },
];

export const REASON_GROUPS = [
  { group: 'Головне', main: true, items: MAIN_REASONS },
  {
    group: 'Вхід',
    items: [
      { id: 'no-confirm',   label: 'Не дочекався підтвердження' },
      { id: 'chased',       label: 'Наздоганяв рух, що вже пішов' },
      { id: 'wrong-level',  label: 'Зайшов не від свого рівня' },
      { id: 'no-setup',     label: 'Сетапу не було взагалі' },
      { id: 'counter-htf',  label: 'Проти старшого таймфрейму' },
      { id: 'early-entry',  label: 'Зайшов зарано, до формування' },
    ],
  },
  {
    group: 'Ведення і вихід',
    items: [
      { id: 'early-exit',   label: 'Вийшов зарано, не дав дійти' },
      { id: 'held-too-long',label: 'Пересидів розворот' },
      { id: 'moved-stop',   label: 'Пересунув стоп проти себе' },
      { id: 'no-partial',   label: 'Не зафіксував частину' },
      { id: 'no-be',        label: 'Не перевів у беззбиток' },
      { id: 'manual-close', label: 'Закрив руками без причини' },
    ],
  },
  {
    group: 'Ризик',
    items: [
      { id: 'oversized',    label: 'Завеликий обсяг' },
      { id: 'added-losing', label: 'Доливав до збиткової' },
      { id: 'no-stop',      label: 'Увійшов без стопа' },
      { id: 'correlated',   label: 'Кілька корельованих позицій' },
      { id: 'daily-limit',  label: 'Продовжив після денного ліміту' },
    ],
  },
  {
    group: 'Голова',
    items: [
      { id: 'fear-miss',    label: 'Боявся пропустити рух' },
      { id: 'revenge',      label: 'Відігравав попередній мінус' },
      { id: 'overconfident',label: 'Розслабився після серії плюсів' },
      { id: 'bored',        label: 'Нудьга — торгував, бо нічого не робив' },
      { id: 'proving',      label: 'Доводив щось собі або ринку' },
      { id: 'impatient',    label: 'Не вистачило терпіння чекати' },
    ],
  },
  {
    group: 'Підготовка',
    items: [
      { id: 'no-plan',      label: 'Не було плану на день' },
      { id: 'ignored-plan', label: 'План був, але я його не відкрив' },
      { id: 'no-rule',      label: 'Немає правила для цього сценарію' },
      { id: 'news',         label: 'Не подивився календар новин' },
      { id: 'tired',        label: 'Втома, недосип, поганий стан' },
      { id: 'distracted',   label: 'Відволікся, торгував між справами' },
    ],
  },
];

export const REASONS = REASON_GROUPS.flatMap((g) => g.items);

/* Своя причина зберігається текстом як є, тому в довіднику її не
   знайти — повертаємо як написано. */
export function reasonLabel(id) {
  if (!id) return '';
  return REASONS.find((r) => r.id === id)?.label || id;
}

/* Чотири головні мають окремі колонки — по них рахується
   статистика. Решта живе тільки в масиві причин.

   Не вибране не означає «ні»: якщо людина не позначила «не по
   плану», це не заява про те, що план був. Тому невибране лишається
   null, а не перетворюється на протилежне значення. */
export function flagsFromReasons(list) {
  const out = { followed_plan: null, rushed: null, by_system: null, risk_ok: null };
  (list || []).forEach((id) => {
    const m = MAIN_REASONS.find((r) => r.id === id);
    if (m) out[m.flag] = m.value;
  });
  return out;
}

/* Зворотний бік: запис, зроблений до появи списку причин, має
   показувати свої галочки як причини — інакше стара помилка виглядає
   так, ніби її не розбирали. */
export function reasonsFromFlags(row) {
  return MAIN_REASONS
    .filter((r) => row?.[r.flag] === r.value)
    .map((r) => r.id);
}

/* ------------------------------------------------------------------
   Категорія з причини.

   Окремого питання «що це було» більше немає — воно питало те саме,
   що й причина, тільки грубіше, і людина двічі описувала один
   промах. Але категорії нікуди не поділись: на них тримається колір
   картки в стрічці та вся статистика розділу.

   Тому виводимо їх з причин. Зв'язок не один-в-один і не має ним
   бути: «доливав до збиткової» і «увійшов без стопа» — різні дії з
   однією природою, і в статистиці вони мають лежати разом.
------------------------------------------------------------------ */
const REASON_TO_CAT = {
  'q-plan': 'risk', 'q-fomo': 'fomo', 'q-system': 'risk', 'q-risk': 'risk',

  'no-confirm': 'haste', chased: 'fomo', 'wrong-level': 'haste',
  'no-setup': 'haste', 'counter-htf': 'haste', 'early-entry': 'haste',

  'early-exit': 'early', 'held-too-long': 'early', 'moved-stop': 'risk',
  'no-partial': 'early', 'no-be': 'risk', 'manual-close': 'early',

  oversized: 'risk', 'added-losing': 'risk', 'no-stop': 'risk',
  correlated: 'risk', 'daily-limit': 'over',

  'fear-miss': 'fomo', revenge: 'revenge', overconfident: 'tilt',
  bored: 'over', proving: 'tilt', impatient: 'haste',

  'no-plan': 'tilt', 'ignored-plan': 'tilt', 'no-rule': 'tilt',
  news: 'haste', tired: 'tilt', distracted: 'tilt',
};

export function catsFromReasons(list) {
  const out = [...new Set((list || []).map((id) => REASON_TO_CAT[id]).filter(Boolean))];
  /* Своя причина в довіднику не значиться, і вгадувати за нею
     категорію нічим. «Поспіх» тут не здогадка, а найширший кошик:
     він не бреше про природу помилки, коли її не встановлено. */
  return out.length ? out : ['haste'];
}

export const SAMPLES = [
  { id: 12, pair: 'EURUSD', date: '2026-07-09', cats: ['fomo','haste'], followedPlan: false, rushed: true, desc: 'Побачив імпульс на Лондоні та зайшов без підтвердження свіпу. Ціна повернулась у діапазон і зняла стоп за 20 хвилин. Класичний вхід на страху впустити рух.' },
  { id: 11, pair: 'GER40', date: '2026-07-07', cats: ['early'], followedPlan: true, rushed: false, desc: 'Закрив позицію на +1.2R при цілі 3R. Після двох червоних днів рука сама тягнеться фіксувати. План був правильний — виконання ні.' },
  { id: 10, pair: 'XAUUSD', date: '2026-07-02', cats: ['risk','tilt'], followedPlan: false, rushed: true, desc: 'Після стопу подвоїв ризик до 2%, щоб «відбити». Другий стоп за день. Нове правило: два стопи поспіль — термінал закривається до завтра.' },
  { id: 9, pair: 'EURUSD', date: '2026-06-24', cats: ['fomo'], followedPlan: false, rushed: true, tvLink: 'https://www.tradingview.com/x/9oCwRebL/', desc: 'Потрібно було очікувати інвалідації 1фта та ресвіпа. Це не завжди працює — але саме тому чекати обовʼязково, а не заходити на першому русі.' },
  { id: 8, pair: 'GER40', date: '2026-06-20', cats: ['revenge'], followedPlan: false, rushed: true, desc: 'Стоп на відкритті Франкфурта — і одразу переворот проти позиції без сетапу. Ринок нічого мені не винен. Реванш — це не стратегія.' },
  { id: 7, pair: 'BTCUSD', date: '2026-06-12', cats: ['over'], followedPlan: false, rushed: false, desc: 'Шість входів за сесію при ліміті три. Кожен наступний — гірший за попередній. Ліміт входів існує не просто так.' },
  { id: 6, pair: 'EURUSD', date: '2026-06-08', cats: ['fear'], followedPlan: false, rushed: false, desc: 'Пропустив валідний сетап за планом — злякався після вчорашнього стопу. Невзята угода за планом — теж помилка, і вона теж коштує грошей.' },
  { id: 5, pair: 'GER40', date: '2026-05-28', cats: ['haste','risk'], followedPlan: false, rushed: true, desc: 'Позиція на 1.5% замість 0.5% — поспішав до новин і не перерахував лот. Чек-лист розміру позиції перед входом тепер обовʼязковий.' },
  { id: 4, pair: 'XAUUSD', date: '2026-05-19', cats: ['early'], followedPlan: true, rushed: false, tvLink: 'https://www.tradingview.com/x/9oCwRebL/', desc: 'Вийшов на першому тесті цілі — ціна дійшла до фінальної через годину. Довіряй рівням, які сам намалював на пре-сесії.' },
  { id: 3, pair: 'EURUSD', date: '2026-05-14', cats: ['tilt'], followedPlan: false, rushed: false, desc: 'Торгував у день без плану, бо «відчував ринок». Відчуття коштувало 0.8R. Немає плану — немає торгівлі.' }
];

export const MONTHS = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

export function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function getCat(id) {
  return CATS.find(c => c.id === id) || { id, label: id, color: '#8b8f9f' };
}

export function generateCandles(seed, n) {
  let s = (seed * 7919 + 104729) % 233280;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  let v = 42 + rnd() * 16;
  const out = [];
  for (let i = 0; i < n; i++) {
    const open = v;
    const close = Math.min(90, Math.max(10, v + (rnd() - 0.48) * 16));
    v = close;
    const hi = Math.min(96, Math.max(open, close) + rnd() * 6);
    const lo = Math.max(4, Math.min(open, close) - rnd() * 6);
    const up = close >= open;
    out.push({
      id: i,
      wick: { position: 'absolute', left: 'calc(50% - 0.5px)', width: '1px', top: (100 - hi) + '%', height: (hi - lo) + '%', background: 'rgba(160,168,190,.38)' },
      body: { position: 'absolute', left: '20%', right: '20%', top: (100 - Math.max(open, close)) + '%', height: Math.max(2.2, Math.abs(open - close)) + '%', background: up ? 'rgba(110,214,170,.8)' : 'rgba(255,112,124,.8)', borderRadius: '1px' }
    });
  }
  return out;
}
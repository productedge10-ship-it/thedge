export const CATS = [
  { id: 'fomo',    label: 'FOMO Entry',        color: '#ff7a6b' },
  { id: 'haste',   label: 'Rushed',            color: '#f0b13c' },
  { id: 'fear',    label: 'Fear',              color: '#9d8cff' },
  { id: 'early',   label: 'Early Exit',        color: '#4da3ff' },
  { id: 'revenge', label: 'Revenge Trading',   color: '#ff4d6d' },
  { id: 'tilt',    label: 'Tilt',              color: '#ff9f43' },
  { id: 'risk',    label: 'Risk Violation',    color: '#ff3b4f' },
  { id: 'over',    label: 'Overtrading',       color: '#3ddc97' }
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
  { id: 'q-plan',   label: 'Trade was off plan', flag: 'followed_plan', value: false },
  { id: 'q-fomo',   label: 'Entered on FOMO',        flag: 'rushed',        value: true  },
  { id: 'q-system', label: 'Entry not per my system',    flag: 'by_system',     value: false },
  { id: 'q-risk',   label: 'Risk larger than usual', flag: 'risk_ok',   value: false },
];

export const REASON_GROUPS = [
  { group: 'Main', main: true, items: MAIN_REASONS },
  {
    group: 'Entry',
    items: [
      { id: 'no-confirm',   label: 'Did not wait for confirmation' },
      { id: 'chased',       label: 'Chased a move already underway' },
      { id: 'wrong-level',  label: 'Entered from the wrong level' },
      { id: 'no-setup',     label: 'There was no setup at all' },
      { id: 'counter-htf',  label: 'Against the higher timeframe' },
      { id: 'early-entry',  label: 'Entered too early, before it formed' },
    ],
  },
  {
    group: 'Management and exit',
    items: [
      { id: 'early-exit',   label: 'Exited too early, did not let it run' },
      { id: 'held-too-long',label: 'Held through the reversal' },
      { id: 'moved-stop',   label: 'Moved the stop against myself' },
      { id: 'no-partial',   label: 'Did not take partial profit' },
      { id: 'no-be',        label: 'Did not move to breakeven' },
      { id: 'manual-close', label: 'Closed manually for no reason' },
    ],
  },
  {
    group: 'Risk',
    items: [
      { id: 'oversized',    label: 'Position size too large' },
      { id: 'added-losing', label: 'Added to a losing position' },
      { id: 'no-stop',      label: 'Entered without a stop' },
      { id: 'correlated',   label: 'Multiple correlated positions' },
      { id: 'daily-limit',  label: 'Kept trading past the daily limit' },
    ],
  },
  {
    group: 'Mindset',
    items: [
      { id: 'fear-miss',    label: 'Afraid of missing the move' },
      { id: 'revenge',      label: 'Trying to win back a loss' },
      { id: 'overconfident',label: 'Got overconfident after a winning streak' },
      { id: 'bored',        label: 'Boredom — traded because there was nothing else to do' },
      { id: 'proving',      label: 'Trying to prove something to myself or the market' },
      { id: 'impatient',    label: 'Ran out of patience to wait' },
    ],
  },
  {
    group: 'Preparation',
    items: [
      { id: 'no-plan',      label: 'No plan for the day' },
      { id: 'ignored-plan', label: 'Had a plan but did not open it' },
      { id: 'no-rule',      label: 'No rule for this scenario' },
      { id: 'news',         label: 'Did not check the news calendar' },
      { id: 'tired',        label: 'Fatigue, lack of sleep, poor condition' },
      { id: 'distracted',   label: 'Distracted, traded between other things' },
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
  { id: 12, pair: 'EURUSD', date: '2026-07-09', cats: ['fomo','haste'], followedPlan: false, rushed: true, desc: 'Saw a London impulse and entered without confirmation of the sweep. Price returned into the range and hit the stop in 20 minutes. Classic entry driven by fear of missing the move.' },
  { id: 11, pair: 'GER40', date: '2026-07-07', cats: ['early'], followedPlan: true, rushed: false, desc: 'Closed the position at +1.2R with a 3R target. After two red days the hand reaches to lock in profit on its own. The plan was right — the execution was not.' },
  { id: 10, pair: 'XAUUSD', date: '2026-07-02', cats: ['risk','tilt'], followedPlan: false, rushed: true, desc: 'Doubled risk to 2% after a stop to "win it back." Second stop of the day. New rule: two stops in a row — the terminal closes until tomorrow.' },
  { id: 9, pair: 'EURUSD', date: '2026-06-24', cats: ['fomo'], followedPlan: false, rushed: true, tvLink: 'https://www.tradingview.com/x/9oCwRebL/', desc: 'Should have waited for the 1H invalidation and resweep. It does not always work — but that is exactly why waiting is mandatory, rather than entering on the first move.' },
  { id: 8, pair: 'GER40', date: '2026-06-20', cats: ['revenge'], followedPlan: false, rushed: true, desc: 'Stopped out at the Frankfurt open — and immediately flipped against the position with no setup. The market owes me nothing. Revenge is not a strategy.' },
  { id: 7, pair: 'BTCUSD', date: '2026-06-12', cats: ['over'], followedPlan: false, rushed: false, desc: 'Six entries in a session with a limit of three. Each one worse than the last. The entry limit exists for a reason.' },
  { id: 6, pair: 'EURUSD', date: '2026-06-08', cats: ['fear'], followedPlan: false, rushed: false, desc: 'Skipped a valid setup that matched the plan — got scared after yesterday\'s stop. A trade not taken according to plan is still a mistake, and it still costs money.' },
  { id: 5, pair: 'GER40', date: '2026-05-28', cats: ['haste','risk'], followedPlan: false, rushed: true, desc: 'Position at 1.5% instead of 0.5% — rushed ahead of news and did not recalculate the lot size. A position-size checklist before entry is now mandatory.' },
  { id: 4, pair: 'XAUUSD', date: '2026-05-19', cats: ['early'], followedPlan: true, rushed: false, tvLink: 'https://www.tradingview.com/x/9oCwRebL/', desc: 'Exited on the first test of the target — price reached the final target an hour later. Trust the levels you drew yourself in the pre-session.' },
  { id: 3, pair: 'EURUSD', date: '2026-05-14', cats: ['tilt'], followedPlan: false, rushed: false, desc: 'Traded on a day with no plan because "felt the market." That feeling cost 0.8R. No plan — no trading.' }
];

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

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

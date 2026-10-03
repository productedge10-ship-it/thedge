/* ==================================================================
   Розбір дня: питання, відповіді й звʼязки між ними.

   Окремо від компонента, бо ці списки читає ще й сторінка плану —
   вона рахує по них прогрес. Тримати їх у розмітці означало б, що
   прогрес і форма одного дня розійдуться в різні боки.

   Дві ідеї, на яких тут усе тримається.

   ПЕРША: відповідей може бути кілька, але не будь-яких. Один день
   рідко буває однорідним — половину сесії людина торгує за планом,
   потім бачить сетап і не заходить. Змушувати вибрати одне означає
   отримати неправду. Але «За планом» і «Торгував не за планом» —
   це не два аспекти дня, а два описи одного й того самого, і разом
   вони бути не можуть. Тому в кожної відповіді є список тих, кого
   вона витісняє: клік не забороняється, а прибирає суперечливе.

   ДРУГА, і вона головна: сам факт «відійшов від плану» нічого не
   пояснює. Важить причина. Тому відхилення й пропуск тягнуть за
   собою друге питання — чому, — а кожна причина вже знає, який стан
   за нею стоїть, і сама його проставляє. Людина не мусить окремо
   згадувати, що нею керувало: вона відповідає на конкретне питання
   про конкретну дію, а стан виводиться з відповіді.
================================================================== */

import { T } from './theme';
import { t as tx } from './lang';

/* Що сталося з торгівлею.

   Найважливіша відповідь — «Був сетап, не торгував». Без неї день без
   угод виглядає однаково і коли сетапу не було, і коли ти його
   побачив та не зайшов. А це протилежні дні: перший — дисципліна,
   другий — майже завжди страх.

   `missed` сумісний із `plan` і `drift`: можна відторгувати свій
   сетап і поруч пропустити другий. Несумісний лише з `flat` — там
   сказано, що сетапу не було взагалі. */
export const FLOW = [
  { id: 'plan',   label: tx('Все зробив за планом', 'Followed the plan'),   hint: tx('Торгував і робив те, що збирався', 'Traded and did what I intended'), rgb: T.okRgb,      excludes: ['drift', 'flat'] },
  { id: 'drift',  label: tx('Торгував не за планом', 'Traded off-plan'),  hint: tx('Заходив там, де не збирався', 'Entered where I didn’t intend to'),      rgb: T.warnRgb,    excludes: ['plan', 'flat'] },
  { id: 'flat',   label: tx('Не торгував — не було сетапу', 'No trades — no setup'), hint: tx('Свого не бачив, і це правильно', 'Didn’t see my setup, and that’s right'), rgb: T.accRgb, excludes: ['plan', 'drift', 'missed'] },
  { id: 'missed', label: tx('Був сетап, не торгував', 'Had a setup, didn’t trade'), hint: tx('Бачив своє й не зайшов', 'Saw my setup and didn’t enter'),           rgb: '251,146,60', excludes: ['flat'] },
];

/* Стани. Спокій не живе поруч із тільтом чи FOMO — це протилежні
   полюси того самого. А от тривога з FOMO уживаються чудово: саме з
   цієї пари й виходить більшість поганих входів. */
export const STATES = [
  { id: 'calm',      label: tx('Спокій', 'Calm'),      rgb: T.okRgb,      excludes: ['tilt', 'fomo', 'anxious'] },
  { id: 'confident', label: tx('Впевненість', 'Confidence'), rgb: T.accRgb,     excludes: ['tilt'] },
  { id: 'anxious',   label: tx('Тривога', 'Anxiety'),     rgb: T.warnRgb,    excludes: ['calm'] },
  { id: 'fomo',      label: 'FOMO',        rgb: '251,146,60', excludes: ['calm'] },
  { id: 'tilt',      label: tx('Тільт', 'Tilt'),       rgb: T.badRgb,     excludes: ['calm', 'confident'] },
];

/* ---------- чому ----------

   Причини сформульовані від першої особи й максимально буквально.
   «Імпульсивність» — це вже висновок, і поставити собі такий діагноз
   важко; «набридло чекати» людина впізнає одразу, бо саме ці слова в
   неї в голові й були.

   `state` — стан, який ця причина проставить у наступному кроці.
   Порожній означає, що причина про обставини, а не про голову:
   відійшов від екрана — це не емоція, і приписувати їй тривогу
   означало б вигадати за людину те, чого не було. */
export const REASONS = [
  /* Відійшов від плану */
  { id: 'revenge',  flow: 'drift',  label: tx('Хотів відіграти мінус', 'Wanted to win back a loss'),        state: 'tilt' },
  { id: 'chase',    flow: 'drift',  label: tx('Боявся пропустити рух', 'Afraid to miss the move'),        state: 'fomo' },
  { id: 'bored',    flow: 'drift',  label: tx('Набридло чекати', 'Got tired of waiting'),              state: 'fomo' },
  { id: 'sure',     flow: 'drift',  label: tx('Здалося, що цього разу точно', 'Felt sure this time'), state: 'confident' },
  { id: 'green',    flow: 'drift',  label: tx('Хотів закрити день у плюс', 'Wanted to end the day green'),    state: 'tilt' },
  { id: 'norules',  flow: 'drift',  label: tx('Не довіряв власним правилам', 'Didn’t trust my own rules'),  state: 'anxious' },

  /* Не зайшов */
  { id: 'fear',     flow: 'missed', label: tx('Страх ще одного мінусу', 'Fear of another loss'),       state: 'anxious' },
  { id: 'doubt',    flow: 'missed', label: tx('Не повірив своєму аналізу', 'Didn’t trust my analysis'),    state: 'anxious' },
  { id: 'perfect',  flow: 'missed', label: tx('Чекав ідеального підтвердження', 'Waited for perfect confirmation'), state: 'anxious' },
  { id: 'drawdown', flow: 'missed', label: tx('Уже був у мінусі за день', 'Was already down for the day'),     state: 'anxious' },
  { id: 'size',     flow: 'missed', label: tx('Лякав розмір позиції', 'Position size scared me'),         state: 'anxious' },
  { id: 'away',     flow: 'missed', label: tx('Не був за екраном', 'Wasn’t at the screen'),            state: null },
  { id: 'late',     flow: 'missed', label: tx('Побачив запізно', 'Spotted it too late'),              state: null },

  /* Витримав план. Питаємо навмисно: журнал, у якому пояснюються
     тільки провали, за місяць перетворюється на реєстр провалів. */
  { id: 'ready',    flow: 'plan',   label: tx('Підготувався заздалегідь', 'Prepared in advance'),     state: 'calm' },
  { id: 'accepted', flow: 'plan',   label: tx('Прийняв ризик до входу', 'Accepted the risk before entry'),       state: 'calm' },
  { id: 'nowatch',  flow: 'plan',   label: tx('Не сидів над графіком', 'Didn’t stare at the chart'),        state: 'calm' },
  { id: 'trust',    flow: 'plan',   label: tx('Довіряв своїй системі', 'Trusted my system'),        state: 'confident' },
];

export const REASON_TITLE = {
  drift:  tx('Що штовхнуло відійти від плану', 'What pushed you off-plan'),
  missed: tx('Чому не зайшов', 'Why you didn’t enter'),
  plan:   tx('Що допомогло втриматись', 'What helped you stay on track'),
};

export const reasonsFor = (flowId) => REASONS.filter((r) => r.flow === flowId);

/* Гілки, які взагалі ставлять питання «чому». `flat` не ставить:
   сетапу не було, пояснювати нічого. */
export const ASKS_WHY = ['plan', 'drift', 'missed'];

/* ---------- що далося найважче ----------

   Питання про дію, а не про почуття, і тому дає те, чого не дає
   стан: «тривога» не каже, що з нею робити, а «важко було тримати
   позицію» каже. Через місяць таких відміток видно вже не настрій, а
   конкретну навичку, якої бракує. */
const HARD_RAW = [
  { id: 'wait',  label: tx('Дочекатись сетапу', 'Waiting for the setup') },
  { id: 'hold',  label: tx('Тримати позицію', 'Holding the position') },
  { id: 'skip',  label: tx('Не зайти', 'Not entering') },
  { id: 'loss',  label: tx('Прийняти мінус', 'Taking the loss') },
  { id: 'close', label: tx('Зафіксувати в плюс', 'Taking profit') },
  { id: 'size',  label: tx('Не збільшити обʼєм', 'Not sizing up') },
  { id: 'stop',  label: tx('Зупинитись вчасно', 'Stopping in time') },
  { id: 'none',  label: tx('Нічого — день дався легко', 'Nothing — the day was easy') },
];

/* «Нічого» витісняє все, і все витісняє «нічого». Прописувати це
   руками — вісім місць, де легко забути одне. */
export const HARD = HARD_RAW.map((h) => ({
  ...h,
  excludes: h.id === 'none'
    ? HARD_RAW.filter((x) => x.id !== 'none').map((x) => x.id)
    : ['none'],
}));

/* ---------- робота зі списками ---------- */

/* Старі плани зберігали одну відповідь рядком. Читаємо обидва
   формати: міграції для jsonb немає, та вона й не потрібна — поле
   саме стане масивом при першому ж збереженні. */
export const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export function toggleWith(value, id, defs) {
  const cur = asList(value);
  if (cur.includes(id)) return cur.filter((x) => x !== id);

  const ex = defs.find((d) => d.id === id)?.excludes || [];
  return [...cur.filter((x) => !ex.includes(x)), id];
}

/* Причини, які більше нема до чого прикріпити.

   Зняли «Торгував не за планом» — і відповідь «набридло чекати»
   лишилась висіти сама по собі, ніби день усе ще про неї. Тому при
   кожній зміні гілок причини перефільтровуються. */
export const pruneReasons = (why, flow) => {
  const live = asList(flow);
  return asList(why).filter((id) => {
    const r = REASONS.find((x) => x.id === id);
    return r && live.includes(r.flow);
  });
};

/* Стан, який ставить сама причина. Тільки додаємо й ніколи не
   прибираємо: людина могла дописати стан руками, і знімати чужу
   відмітку через побічний ефект іншого кліку — найгірше, що може
   зробити форма. */
export function stateWithReason(state, reasonId) {
  const r = REASONS.find((x) => x.id === reasonId);
  if (!r?.state) return asList(state);

  const cur = asList(state);
  if (cur.includes(r.state)) return cur;
  return toggleWith(cur, r.state, STATES);
}

export const labelsOf = (value, defs) =>
  asList(value).map((id) => defs.find((d) => d.id === id)?.label).filter(Boolean);

/* ---------- прогрес ----------
   Чотири кроки. Питання «чому» окремим кроком не рахується: воно
   зʼявляється не завжди, і лічильник, у якого змінюється знаменник,
   читається як поломка. */
export const reviewFilled = (d = {}) => [
  !!d.actualNarrative,
  asList(d.dayFlow).length > 0,
  asList(d.dayState).length > 0,
  asList(d.dayHard).length > 0,
].filter(Boolean).length;

export const REVIEW_STEPS = 4;

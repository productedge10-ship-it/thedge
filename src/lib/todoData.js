/* ==================================================================
   Завдання, матриця Ейзенхауера і помідори.
   Поки що все локально — структура вже така, якою піде в базу.

   Завдання = { id, text, done, doneAt, createdAt, due, dueTime,
                quadrant, pomodoros, note }
   due     — 'YYYY-MM-DD' або null («колись»)
   dueTime — 'HH:MM' або null («будь-коли того дня»)
================================================================== */

export const KEYS = {
  tasks: 'edge_todo_tasks_v1',
  sessions: 'edge_todo_sessions_v1',
  settings: 'edge_todo_settings_v1',
};

/* Квадранти. Підпис — це не назва осі, а дія: матриця корисна саме
   тим, що каже, ЩО робити з завданням, а не куди його покласти. */
export const QUADRANTS = [
  { id: 'q1', label: 'Роби зараз',  axis: 'Терміново · Важливо',        tone: 'bad',   hint: 'Горить і має значення' },
  { id: 'q2', label: 'Заплануй',    axis: 'Не терміново · Важливо',     tone: 'ok',    hint: 'Тут живе розвиток' },
  { id: 'q3', label: 'Швидко зроби', axis: 'Терміново · Неважливо',     tone: 'warn',  hint: 'Зʼїдає день по шматочку' },
  { id: 'q4', label: 'Прибери',     axis: 'Не терміново · Неважливо',   tone: 'muted', hint: 'Чесно спитай, навіщо воно' },
];

export const DEFAULT_SETTINGS = {
  focus: 25,
  short: 5,
  long: 15,
  longEvery: 4,
  autoNext: true,
};

/* ---------- дати ---------- */

export const dayKey = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  const tz = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
};

export const today = () => dayKey(new Date());

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

export const fmtDay = (iso) => {
  if (!iso) return 'без дати';
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' }).replace(/\sр\./, '');
};

export const fmtDayLong = (iso) => {
  if (!iso) return 'Без дати';
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('uk-UA', { weekday: 'long', day: '2-digit', month: 'long' });
};

export const relativeDay = (iso) => {
  if (!iso) return 'колись';
  const t = today();
  if (iso === t) return 'сьогодні';
  if (iso === addDays(t, 1)) return 'завтра';
  if (iso === addDays(t, -1)) return 'вчора';
  return fmtDay(iso);
};

export const isOverdue = (task) => {
  if (task.done || !task.due) return false;
  const t = today();
  if (task.due < t) return true;
  if (task.due > t) return false;
  if (!task.dueTime) return false;
  const now = new Date();
  const [h, m] = task.dueTime.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() > h * 60 + m;
};

/* ==================================================================
   Розбір дати й часу просто з тексту завдання.

   Два правила, обидва з практики.

   Перше: текст не чіпаємо. Раніше розпізнане вирізалось із назви, і
   «завтра в 10 25 подрочити» перетворювалось на «25 подрочити» —
   завдання, яке вже не можна прочитати. Назва належить людині; ми з
   неї лише читаємо, нічого не забираючи.

   Друге: час має бути названий часом. Голе число після «в» часом не
   є — «в 10 25» це або десята двадцять пʼять, або взагалі не час, і
   вгадувати тут гірше, ніж промовчати. Впізнаємо лише те, де межа
   однозначна: «10:25», «о 10», «10 год», «10 вечора».
================================================================== */

const DOW = {
  'понеділок': 1, 'пн': 1, 'вівторок': 2, 'вт': 2, 'середа': 3, 'середу': 3, 'ср': 3,
  'четвер': 4, 'чт': 4, "п'ятниця": 5, "п'ятницю": 5, 'пятниця': 5, 'пятницю': 5, 'пт': 5,
  'субота': 6, 'суботу': 6, 'сб': 6, 'неділя': 7, 'неділю': 7, 'нд': 7,
};

/* Найближчий такий день тижня. Сьогоднішній день не рахуємо за
   «найближчий»: кажучи «у пʼятницю» в пʼятницю ввечері, мають на
   увазі наступну. */
const nextDow = (want) => {
  const base = new Date();
  const cur = base.getDay() === 0 ? 7 : base.getDay();
  const shift = ((want - cur + 7) % 7) || 7;
  return addDays(today(), shift);
};

const pad2 = (n) => String(n).padStart(2, '0');

/* Частина доби. «10 вечора» — двадцять друга, а не десята: людина
   називає годину по циферблату, а не по добі. */
const PART = [
  { re: /ранку|ранком|вранці|зранку|утра/i, shift: (h) => (h === 12 ? 0 : h) },
  { re: /дня|вдень|обід/i,                  shift: (h) => (h < 12 ? h + 12 : h) },
  { re: /вечора|ввечері|увечері|вечером|вечері/i, shift: (h) => (h < 12 ? h + 12 : h) },
  { re: /ночі|вночі|ночью/i,                shift: (h) => (h < 12 ? h + 12 : h) },
];

export function parseWhen(raw) {
  const text = ` ${raw} `;
  let due = null;
  let dueTime = null;

  const setTime = (h, mi, partWord) => {
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return;
    let hh = h;
    if (partWord) {
      const p = PART.find((x) => x.re.test(partWord));
      if (p) hh = p.shift(h);
    }
    if (hh > 23) return;
    dueTime = `${pad2(hh)}:${pad2(mi)}`;
  };

  /* --- час ---

     Один прохід замість купи окремих шаблонів. Шукаємо будь-яке
     «[о|в|у] ГОДИНА [ХВИЛИНИ] [год] [частина доби]» і питаємо:
     чи є хоч один доказ, що це справді час?

     Доказом рахується розділювач («10:55»), слово «год», частина доби
     («10 55 ранку») або будь-який прийменник часу — о, в, у. Назвав
     годину після прийменника — значить, назвав годину: «в 10 25» це
     десята двадцять пʼять, і вдавати, що ми не зрозуміли, безглуздо.

     А от голе число без нічого часом не вважаємо — інакше «купити 20
     30 яєць» стало б восьмою вечора. Без жодного доказу час не
     ставимо: пропущена година дратує менше, ніж вигадана.  */
  const TIME_RE = new RegExp(
    '(?:^|\\s)(?:(о|в|у)\\s+)?(\\d{1,2})'
    + '(?:\\s*[:.]\\s*(\\d{2})|\\s+(\\d{2})(?=\\s|$))?'
    + '\\s*(год\\S*)?'
    + '\\s*(ранку|ранком|вранці|зранку|утра|дня|вдень|обід|вечора|ввечері|увечері|вечором|вечері|ночі|вночі|ночью)?'
    + '(?=\\s|$)',
    'gi',
  );

  let m;
  TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(text)) !== null) {
    const [, prep, hStr, minSep, minSpace, hours, part] = m;
    const h = Number(hStr);
    const mi = Number(minSep ?? minSpace ?? 0);

    const proof = Boolean(minSep) || Boolean(hours) || Boolean(part) || Boolean(prep);
    if (!proof || h > 23 || mi > 59) continue;

    setTime(h, mi, part);
    if (dueTime) break;
  }

  /* Частина доби може стояти й окремо від числа: «завтра ввечері». */
  if (!dueTime) {
    if (/\s(ввечері|увечері|вечором|під вечір)(?=\s)/i.test(text)) dueTime = '19:00';
    else if (/\s(зранку|вранці|ранком)(?=\s)/i.test(text)) dueTime = '09:00';
  }

  /* --- день --- «післязавтра» перевіряємо раніше за «завтра» */
  if (/\sпіслязавтра(?=\s)/i.test(text)) due = addDays(today(), 2);
  else if (/\sзавтра(?=\s)/i.test(text)) due = addDays(today(), 1);
  else if (/\sсьогодні(?=\s)/i.test(text)) due = today();
  else if ((m = text.match(/\sчерез\s+(\d{1,2})\s+(дн[іяв]\S*|тижн\S*|тиждень)(?=\s)/i))) {
    const n = Number(m[1]);
    due = addDays(today(), /тижд|тижн/i.test(m[2]) ? n * 7 : n);
  } else if ((m = text.match(/\s(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/))) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      const y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date().getFullYear();
      const iso = `${y}-${pad2(mo)}-${pad2(d)}`;
      /* Дата без року, що вже минула, означає наступний рік. */
      due = !m[3] && iso < today() ? `${y + 1}-${pad2(mo)}-${pad2(d)}` : iso;
    }
  } else {
    const key = Object.keys(DOW).find((k) => new RegExp(`\\s(?:у|в|до)?\\s*${k.replace("'", "['’]")}(?=\\s)`, 'i').test(text));
    if (key) due = nextDow(DOW[key]);
  }

  /* Час без дня — це сьогодні. Інакше завдання «о 10» осідає в
     «Колись», де його ніхто не побачить о десятій. */
  if (dueTime && !due) due = today();

  /* text повертаємо незмінним — назва належить людині. */
  return { text: raw.trim(), due, dueTime };
}

export const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

/* Сітка місяця: завжди повні тижні з понеділка */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  const shift = (first.getDay() + 6) % 7;          // 0 = понеділок
  start.setDate(first.getDate() - shift);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      iso: dayKey(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month,
      isToday: dayKey(d) === today(),
      isWeekend: [5, 6].includes((d.getDay() + 6) % 7),
    });
    if (i >= 34 && d.getMonth() !== month && (i + 1) % 7 === 0) break;
  }
  return cells;
}

/* ---------- сховище ---------- */

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch { return fallback; }
};

export const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватний режим */ }
};

export const SEED_TASKS = [
  { id: 't1', text: 'Розібрати вчорашню угоду по GBPUSD', done: false, createdAt: today(), due: today(), dueTime: '12:00', quadrant: 'q1', pomodoros: 1, note: '' },
  { id: 't2', text: 'Прогнати 20 сетапів у бектесті', done: false, createdAt: today(), due: today(), dueTime: null, quadrant: 'q2', pomodoros: 2, note: '' },
  { id: 't3', text: 'Оновити правила ризику в системі', done: false, createdAt: today(), due: addDays(today(), 1), dueTime: '18:30', quadrant: 'q2', pomodoros: 0, note: '' },
  { id: 't4', text: 'Відповісти в чаті по співпраці', done: false, createdAt: today(), due: today(), dueTime: '15:00', quadrant: 'q3', pomodoros: 0, note: '' },
  { id: 't5', text: 'Погортати твіттер «за ідеями»', done: false, createdAt: today(), due: null, dueTime: null, quadrant: 'q4', pomodoros: 0, note: '' },
  { id: 't6', text: 'Тижневий розбір', done: false, createdAt: today(), due: addDays(today(), 3), dueTime: '20:00', quadrant: 'q2', pomodoros: 0, note: '' },
  { id: 't7', text: 'Перевірити календар новин', done: true, createdAt: today(), doneAt: today(), due: today(), dueTime: '09:00', quadrant: 'q1', pomodoros: 1, note: '' },
];

/* Нормалізація приходить у гру і для локальних, і для хмарних даних —
   структура завдання не має залежати від того, звідки воно прилетіло */
export const normalizeTasks = (list) => {
  /* Порожньо, а не приклади: нова людина не має бачити чужих справ. */
  if (!Array.isArray(list)) return [];
  return list.map((t) => ({
    id: t.id,
    text: String(t.text || ''),
    done: !!t.done,
    doneAt: t.doneAt || null,
    createdAt: t.createdAt || today(),
    due: t.due || null,
    dueTime: t.dueTime || null,
    quadrant: t.quadrant || null,
    pomodoros: Number(t.pomodoros) || 0,
    note: t.note || '',
    /* Прапорець нагадування в Telegram. Перелічуємо поле явно, як і
       решту: нормалізатор навмисно збирає завдання з нуля, і все, чого
       тут немає, зникає при першому ж перечитуванні з бази. */
    remind: !!t.remind,
  })).filter((t) => t.text);
};

export const normalizeSessions = (list) => (Array.isArray(list) ? list : []);

export const normalizeSettings = (v) => ({ ...DEFAULT_SETTINGS, ...(v && typeof v === 'object' ? v : {}) });

/* Старі назви лишаємо — ними досі читається те, що збереглось на
   цьому пристрої до переїзду в базу */
export const loadTasks = () => normalizeTasks(read(KEYS.tasks, null));
export const loadSessions = () => normalizeSessions(read(KEYS.sessions, []));
export const loadSettings = () => normalizeSettings(read(KEYS.settings, {}));

export const newId = () => `t${Date.now()}${Math.random().toString(16).slice(2, 6)}`;

/* ---------- зведення по днях ---------- */

export function dayStats(tasks, sessions) {
  const map = {};
  const touch = (iso) => (map[iso] = map[iso] || { planned: 0, done: 0, overdue: 0, pomodoros: 0, tasks: [] });

  tasks.forEach((t) => {
    if (t.due) {
      const d = touch(t.due);
      d.planned += 1;
      d.tasks.push(t);
      if (isOverdue(t)) d.overdue += 1;
    }
    if (t.done && t.doneAt) touch(t.doneAt).done += 1;
  });

  sessions.forEach((s) => {
    if (s.mode !== 'focus') return;
    touch(s.day).pomodoros += 1;
  });

  Object.values(map).forEach((d) => {
    d.tasks.sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
  });

  return map;
}

export const todayPomodoros = (sessions) =>
  sessions.filter((s) => s.mode === 'focus' && s.day === today()).length;

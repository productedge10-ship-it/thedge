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
  if (!Array.isArray(list)) return SEED_TASKS;
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

import { supabase } from './supabase';

/* ==================================================================
   Діагностика перед сесією.
   Стан голови — властивість дня, а не плану: якщо зранку ти не
   виспався, це однаково стосується і BTC, і євро. Тому запис один
   на користувача на добу, у власній таблиці daily_diagnostics.

   localStorage тут лише як кеш «сьогодні вже питали», щоб модалка
   не блимала при кожному перезавантаженні, поки летить запит.
================================================================== */

export const DIAG_KEYS = ['sleep', 'mood', 'revenge', 'risk'];

/* Для 'revenge' здорова відповідь — «ні», для решти — «так» */
export const DIAG_QUESTIONS = [
  { key: 'sleep',   label: 'Чи добре ти виспався (7+ годин)?',   goodIsYes: true  },
  { key: 'mood',    label: 'Чи спокійний твій емоційний стан?',  goodIsYes: true  },
  { key: 'revenge', label: 'Чи є бажання відігратись?',          goodIsYes: false },
  { key: 'risk',    label: 'Чи прийняв ти ризик на сьогодні?',   goodIsYes: true  },
];

export const emptyDiagnostics = () => ({
  sleep: null, mood: null, revenge: null, risk: null, note: '',
});

/* Локальний день, не UTC. toISOString() вночі віддає вчорашню дату,
   і діагностика питалась двічі за одну добу. */
export const todayKey = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const answeredCount = (d) =>
  DIAG_KEYS.filter((k) => d?.[k] === true || d?.[k] === false).length;

export const isComplete = (d) => answeredCount(d) === DIAG_KEYS.length;

/* Червоні прапорці: погана відповідь на будь-яке питання */
export const riskFlags = (d) =>
  DIAG_QUESTIONS.filter((q) => d?.[q.key] !== null && d?.[q.key] !== undefined && d[q.key] !== q.goodIsYes);

/* ---------- база ---------- */

export async function loadDiagnostics(userId, date = todayKey()) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('daily_diagnostics')
    .select('sleep, mood, revenge, risk, note, date')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (error || !data) return null;
  return { ...emptyDiagnostics(), ...data, note: data.note || '' };
}

/* upsert по (user_id, date) — унікальний індекс не дасть дублікатів */
export async function saveDiagnostics(userId, date, values) {
  if (!userId) return { error: new Error('Немає користувача') };
  const payload = {
    user_id: userId,
    date,
    sleep: values.sleep ?? null,
    mood: values.mood ?? null,
    revenge: values.revenge ?? null,
    risk: values.risk ?? null,
    note: values.note?.trim() || null,
  };
  return supabase
    .from('daily_diagnostics')
    .upsert(payload, { onConflict: 'user_id,date' });
}

/* ---------- «сьогодні вже показували» ---------- */

const SEEN_KEY = 'edge_diag_seen_date';

export const wasShownToday = () => {
  try { return localStorage.getItem(SEEN_KEY) === todayKey(); } catch { return false; }
};

export const markShownToday = () => {
  try { localStorage.setItem(SEEN_KEY, todayKey()); } catch { /* приватний режим */ }
};

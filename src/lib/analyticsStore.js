import { supabase } from './supabase';

/* ==================================================================
   Угоди для аналітики.

   Сторінка досі рахувала статистику з генератора: гарні графіки, які
   не мали жодного стосунку до людини. Тепер джерело — таблиця
   `trades`, та сама, куди пише журнал.

   Головна робота тут — переклад. Журнал зберігає угоду так, як її
   зручно вводити («Win», «Long», прапорці психології), а аналітика
   рахує так, як зручно рахувати (WIN/LOSS/BE, емоція одним словом,
   список помилок). Тримати обидві мови в одному місці не можна:
   тоді кожна нова колонка в базі ламала б графіки.

   Чого в базі немає — того тут не буде. Порожнє поле лишається
   порожнім і не заповнюється вигаданим: краще розділ, який чесно
   каже «мало даних», ніж графік, який показує неіснуючу
   закономірність.
================================================================== */

/* Тривалість угоди. Через північ рахуємо як наступний день —
   азійська сесія це нормальний робочий час, а не відʼємний час
   утримання. Той самий розрахунок є у формі угоди, але дублювати
   його дешевше, ніж тягнути модалку в шар даних. */
function holdOf(from, to) {
  const at = /^(\d{1,2}):(\d{2})/.exec(from || '');
  const bt = /^(\d{1,2}):(\d{2})/.exec(to || '');
  if (!at || !bt) return null;
  const a = Number(at[1]) * 60 + Number(at[2]);
  const b = Number(bt[1]) * 60 + Number(bt[2]);
  return b >= a ? b - a : b + 1440 - a;
}

/* Журнал знає шість станів угоди, аналітика — три. Решта («в
   роботі», «пропущена») у статистику не йде взагалі: угода, яка ще
   не закрилась, не має ні результату, ні R.

   Ключі — рядковими малими літерами: у базі впереміш лежать «Win» з
   ручної форми і «win»/«loss» з імпорту MT5 (див. той самий словник
   синонімів у TradingJournal.jsx). Порівняння точно по регістру тут
   мовчки відсіювало майже всі угоди — рахувались лише ті кілька, що
   збігались літера в літеру з ручним написанням. `scratch` рахуємо
   як `BE`: свого відра для нього в аналітиці нема, а по суті це та
   сама «вийшов при своїх». */
const RESULT = {
  win: 'WIN',
  lose: 'LOSS',
  loss: 'LOSS',
  be: 'BE',
  scratch: 'BE',
};

/* Емоція збирається з чотирьох прапорців психології. Порядок
   важливий: якщо людина відзначила і страх, і бажання відігратись,
   визначальним є друге — саме воно найдорожче. */
function emotionOf(row) {
  if (row.psy_revenge) return 'tilt';
  if (row.psy_fear) return 'anxious';
  if (row.psy_confident) return 'confident';
  return 'calm';
}

/* Сесія в базі може бути порожньою — у старих записах її не питали */
const sessionOf = (row) => row.session || 'Не вказано';

const toApp = (row) => {
  const date = row.plan_date || (row.created_at || '').slice(0, 10);
  const d = date ? new Date(`${date}T12:00:00`) : null;

  return {
    id: row.id,
    date,
    dow: d ? d.getDay() : 0,
    /* Година входу — ціле число, як його чекають графіки. Якщо часу
       немає, лишається null: розділ має показати «мало даних», а не
       намалювати всі угоди опівночі. */
    hour: row.entry_time ? Number(String(row.entry_time).slice(0, 2)) : null,
    asset: row.plan_pair || '—',
    side: (row.type || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
    session: sessionOf(row),
    account: row.account_name || '—',
    setup: row.setup || null,
    emotion: emotionOf(row),
    result: RESULT[String(row.result || '').trim().toLowerCase()],
    rr: typeof row.rr === 'number' ? row.rr : 0,
    mistakes: row.has_mistake
      ? [row.mistake_category || 'Помилка без категорії']
      : [],
    planFollowed: !!row.followed_plan && !row.has_mistake,
    rushed: !!row.rushed,
    risk: typeof row.risk === 'number' ? row.risk : null,
    /* Як закрилась позиція за даними термінала. Для психології це
       найчесніший сигнал із усіх: рішення вийти руками приймається
       посеред угоди, коли емоція вже працює, — на відміну від стопа,
       який поставлений до входу з холодною головою. */
    exitReason: row.exit_reason || null,
    holdMin: holdOf(row.entry_time, row.exit_time),
    note: row.trade_description || '',
  };
};

export async function fetchTrades(userId, { from, to } = {}) {
  let q = supabase
    .from('trades')
    .select(`
      id, plan_date, plan_pair, account_name, type, result, rr, risk, session,
      setup, entry_time, exit_time,
      followed_plan, rushed, has_mistake, mistake_category, trade_description, exit_reason,
      psy_confident, psy_fear, psy_repeat, psy_revenge, created_at
    `)
    .eq('user_id', userId)
    .order('plan_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (from) q = q.gte('plan_date', from);
  if (to) q = q.lte('plan_date', to);

  const { data, error } = await q;
  if (error) throw error;

  /* Незакриті й пропущені угоди відсіюємо тут, а не в кожному
     графіку окремо: інакше «кількість угод» у різних розділах
     розходилась би між собою. */
  return (data || []).map(toApp).filter((t) => t.result);
}

/* Межі періодів рахуємо на клієнті: вибірка все одно невелика, а
   ходити в базу на кожне перемикання «тиждень / місяць» — це затримка
   там, де її можна не мати. */
export function periodStart(id) {
  const d = new Date();
  if (id === 'Цей тиждень') {
    const shift = (d.getDay() + 6) % 7; /* понеділок як початок */
    d.setDate(d.getDate() - shift);
  } else if (id === 'Останні 30 днів') {
    d.setDate(d.getDate() - 30);
  } else if (id === 'Цей квартал') {
    d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
  } else {
    return null;
  }
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------- розбір дня ----------

   Вечірні відповіді живуть не в угоді, а в плані: `trading_plans.
   plan_data`. Це властивість дня, а не окремого входу — «набридло
   чекати» стосується сесії цілком, і приписувати його кожній угоді
   означало б порахувати одну причину стільки разів, скільки в той
   день було входів.

   Тому вони й приходять окремим запитом і зводяться по днях, а не
   змішуються з угодами.
*/
export async function fetchDayReviews(userId, { from, to } = {}) {
  if (!userId) return [];

  let q = supabase
    .from('trading_plans')
    .select('date, narrative, plan_data')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .limit(500);

  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);

  const { data, error } = await q;
  if (error || !data) return [];

  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

  /* Один день — один запис, навіть якщо планів на нього кілька.
     Розбір ведеться про день, а не про актив: людина заповнює його
     раз, і два плани на ту саму дату дали б подвійний рахунок. */
  const byDate = new Map();
  data.forEach((row) => {
    const d = row.plan_data || {};
    const state = list(d.dayState);
    const why = list(d.dayWhy);
    const hard = list(d.dayHard);
    const flow = list(d.dayFlow);
    if (!state.length && !why.length && !hard.length && !flow.length
        && !d.actualNarrative) return;

    /* Bias беремо з першого плану дня, який його має. Плани на різні
       активи можуть дивитись у різні боки, і «збіглось» тут означає
       не «ринок пішов як ти сказав узагалі», а «твоє читання по цьому
       активу справдилось». Для психології цього досить: питання не
       про точність прогнозу, а про те, що ти робиш, коли помилився. */
    const prev = byDate.get(row.date)
      || { date: row.date, state: [], why: [], hard: [], flow: [], planned: null, actual: null };
    const merge = (a, b) => [...new Set([...a, ...b])];
    byDate.set(row.date, {
      date: row.date,
      state: merge(prev.state, state),
      why: merge(prev.why, why),
      hard: merge(prev.hard, hard),
      flow: merge(prev.flow, flow),
      planned: prev.planned || row.narrative || null,
      actual: prev.actual || d.actualNarrative || null,
    });
  });

  return [...byDate.values()];
}

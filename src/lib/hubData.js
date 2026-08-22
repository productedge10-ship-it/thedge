import { supabase } from './supabase';
import { todayKey } from './diagnostics';

/* ==================================================================
   Дані для стартової сторінки.

   Одна ідея: показати не «скільки всього», а «що не закрито сьогодні».
   Тому всі запити короткі й дивляться на день або тиждень, а не на
   всю історію — стартова сторінка не має вантажитись пів секунди.
================================================================== */

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export async function loadHubState(userId) {
  const today = todayKey();
  const weekAgo = daysAgo(6);

  if (!userId) {
    return {
      planToday: null, diagDone: false, diagCount: 0,
      tradesWeek: 0, netRWeek: 0, mistakesWeek: 0,
      cleanDaysWeek: 0, tradingDaysWeek: 0,
      tasksToday: 0, tasksOverdue: 0,
      lastReviewTo: null, backtests: 0,
    };
  }

  const [plans, diag, trades, tasksRow, review, backtests] = await Promise.all([
    supabase.from('trading_plans')
      .select('id, pair, narrative, date')
      .eq('user_id', userId).eq('date', today),

    supabase.from('daily_diagnostics')
      .select('sleep, mood, revenge, risk')
      .eq('user_id', userId).eq('date', today).maybeSingle(),

    supabase.from('trades')
      .select('result, rr, has_mistake, followed_plan, plan_date')
      .eq('user_id', userId).gte('plan_date', weekAgo).lte('plan_date', today),

    supabase.from('user_state')
      .select('data')
      .eq('user_id', userId).eq('key', 'todo_tasks').maybeSingle(),

    supabase.from('trader_reviews')
      .select('period_to')
      .eq('user_id', userId)
      .order('period_to', { ascending: false }).limit(1).maybeSingle(),

    supabase.from('backtest_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  /* ---------- план ---------- */
  const planRows = plans.data || [];

  /* ---------- діагностика ---------- */
  const d = diag.data || {};
  const diagCount = ['sleep', 'mood', 'revenge', 'risk']
    .filter((k) => d[k] === true || d[k] === false).length;

  /* ---------- тиждень у цифрах ---------- */
  const tw = trades.data || [];
  const netRWeek = tw.reduce((s, t) => {
    const rr = Number(t.rr) || 0;
    if (t.result === 'BE') return s;
    if (t.result === 'Lose') return s - Math.abs(rr || 1);
    if (t.result === 'Win') return s + Math.abs(rr);
    return s;
  }, 0);

  /* ---------- чисті дні ----------

     День вважається чистим, якщо всі угоди в ньому були за планом і
     без помилки. Саме день, а не угода: одна зірвана угода псує
     день цілком, і це чесно — вона його справді псує.

     Дні без угод не рахуються ні в чисті, ні в брудні. Витримана
     пауза — теж дисципліна, але міряти її кількістю чистих днів
     означало б винагороджувати відпустку. */
  const byDay = new Map();
  tw.forEach((t) => {
    const d = t.plan_date;
    if (!d) return;
    const ok = t.followed_plan === true && !t.has_mistake;
    byDay.set(d, (byDay.get(d) ?? true) && ok);
  });
  const cleanDaysWeek = [...byDay.values()].filter(Boolean).length;

  /* ---------- завдання ---------- */
  const tasks = Array.isArray(tasksRow.data?.data) ? tasksRow.data.data : [];
  const open = tasks.filter((t) => !t.done);

  return {
    planToday: planRows[0] || null,
    plansToday: planRows.length,
    diagDone: diagCount === 4,
    diagCount,

    tradesWeek: tw.length,
    netRWeek: Number(netRWeek.toFixed(2)),
    mistakesWeek: tw.filter((t) => t.has_mistake).length,
    cleanDaysWeek,
    tradingDaysWeek: byDay.size,

    tasksToday: open.filter((t) => t.due === today).length,
    tasksOverdue: open.filter((t) => t.due && t.due < today).length,
    tasksOpen: open.length,

    lastReviewTo: review.data?.period_to || null,
    backtests: backtests.count || 0,
  };
}

/* Скільки днів минуло з останнього розбору */
export const daysSince = (iso) => {
  if (!iso) return null;
  const then = new Date(`${iso}T12:00:00`);
  const now = new Date();
  return Math.max(0, Math.round((now - then) / 86400000));
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Ще не спиш';
  if (h < 12) return 'Доброго ранку';
  if (h < 18) return 'Доброго дня';
  return 'Доброго вечора';
};

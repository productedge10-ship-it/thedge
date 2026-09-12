import { startOfWeek, endOfWeek, format } from 'date-fns';
import { uk } from 'date-fns/locale';

/* ==================================================================
   Тижневий план.

   Живе в тій самій таблиці trading_plans, що й денний (див.
   db/2026-09-11_weekly_plans.sql) — просто інший plan_type, інша
   форма plan_data. `date` для тижневого рядка завжди понеділок,
   `pair` завжди сентинел WEEK_PAIR: тижневий план не про один
   інструмент, а список активів живе всередині самого plan_data.
================================================================== */

export const WEEK_PAIR = 'ALL';

const toStr = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const parse = (dateStr) => new Date(`${dateStr || toStr(new Date())}T12:00:00`);

/* Понеділок тижня, у якому лежить довільна дата. */
export const mondayOf = (dateStr) => toStr(startOfWeek(parse(dateStr), { weekStartsOn: 1 }));

/* «8 – 14 вересня» або «29 вересня – 5 жовтня», якщо тиждень зачіпає
   два місяці. Єдине позначення тижня в інтерфейсі — жодних номерів
   ISO-тижня: людина мислить датами, а не «Тиждень 37».

   Місяць — повною назвою у родовому відмінку ('MMMM', а не стандалон
   'LLL'): скорочення на кшталт «верес» без крапки виглядало як
   недописане слово, а не як «вересня». */
export const weekRangeLabel = (mondayStr) => {
  const mon = parse(mondayStr);
  const sun = endOfWeek(mon, { weekStartsOn: 1 });
  const sameMonth = mon.getMonth() === sun.getMonth();
  const day = (d) => format(d, 'd');
  const month = (d) => format(d, 'MMMM', { locale: uk });
  return sameMonth
    ? `${day(mon)} – ${day(sun)} ${month(sun)}`
    : `${day(mon)} ${month(mon)} – ${day(sun)} ${month(sun)}`;
};

/* ---------- порожні заготовки ---------- */

const uid = () => (globalThis.crypto?.randomUUID
  ? crypto.randomUUID()
  : `w${Date.now()}${Math.random().toString(36).slice(2, 7)}`);

/* Та сама сітка 4 таймфреймів, що й у денному плані — тиждень теж
   починається з top-down структури, просто старших ТФ тут більше. */
export const emptyTda = () => [1, 2, 3, 4].map((id) => ({ id, tf: '', image: null, text: '' }));

/* Один top-down розбір — на конкретний актив і з власним плановим
   bias, точнісінько як у денному плані. Тижневих активів може бути
   декілька, тож і розборів декілька: кожен незалежний, свій набір ТФ.
   Немає окремого «загального bias тижня» й окремого списку активів —
   цей запис і є одиницею тижневого плану: актив, план на нього (bias
   + сітка ТФ) і факт по ньому (actualBias/outcome), коли тиждень уже
   пройшов. Порівнювати факт є з чим — із власним планом цього самого
   активу, а не з чужою тезою на весь тиждень. */
export const emptyTdaAnalysis = () => ({
  id: uid(),
  pair: '',
  narrative: '',
  blocks: emptyTda(),
  actualBias: '',
  outcome: '',
});

export const emptyWeekPlan = (monday) => ({
  date: monday,
  pair: WEEK_PAIR,
  tdaAnalyses: [emptyTdaAnalysis()],
  planText: '',
  updates: [],
  conclusionsText: '',
  weekRating: 0,
});

/* Той самий розподіл на Plan/Live/Review, що й у денному плані —
   рахується в одному місці, бо потрібен і самій WeeklyPlanView (кільця
   прогресу під заголовками секцій), і лівій рейці-навігатору в
   DailyPlan.jsx (та сама рейка, що й для денного, просто з іншими
   числами). */
export const weekPlanProgress = (data) => {
  const tdaAnalyses = data.tdaAnalyses || [];
  const named = tdaAnalyses.filter((t) => t.pair && t.narrative).length;
  const namedFrac = tdaAnalyses.length ? named / tdaAnalyses.length : 0;

  const tdaBlocks = tdaAnalyses.flatMap((t) => t.blocks || []);
  const tdaFrac = tdaBlocks.length ? tdaBlocks.filter((b) => b.image || b.text?.trim()).length / tdaBlocks.length : 0;

  const planPart = [namedFrac, tdaFrac, data.planText?.trim() ? 1 : 0];
  const plan = planPart.reduce((a, b) => a + b, 0) / planPart.length;

  const updates = data.updates || [];
  const live = updates.length > 0
    ? Math.min(updates.filter((u) => u.text?.trim()).length / updates.length, 1)
    : 0;

  const reviewPart = [data.conclusionsText?.trim() ? 1 : 0, data.weekRating > 0 ? 1 : 0];
  const review = reviewPart.reduce((a, b) => a + b, 0) / reviewPart.length;

  return { plan, live, review };
};

/* ---------- «сьогодні вже питали, денний чи тижневий» ----------
   Той самий принцип, що й wasShownToday у lib/diagnostics.js: одне
   питання на добу, з віддільного localStorage-прапорця, щоб модалка
   не лізла повторно при кожному відкритті /plan того самого дня. */
const TYPE_ASKED_KEY = 'edge_plan_type_asked_date';

const localDateKey = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const wasPlanTypeAskedToday = () => {
  try { return localStorage.getItem(TYPE_ASKED_KEY) === localDateKey(); } catch { return false; }
};

export const markPlanTypeAskedToday = () => {
  try { localStorage.setItem(TYPE_ASKED_KEY, localDateKey()); } catch { /* приватний режим */ }
};

/* Той самий принцип, що й checkIsPlanEmpty для денного: зберігаємо
   будь-що, у чому людина вже щось написала, і не смітимо в хмару
   заготовкою з порожніми полями. */
export const checkIsWeekPlanEmpty = (data) => {
  if (data.planText?.trim() || data.conclusionsText?.trim() || data.weekRating > 0) return false;

  const tdaAnalyses = data.tdaAnalyses || [];
  if (tdaAnalyses.some((t) => (
    t.pair?.trim() || t.narrative || t.actualBias || t.outcome?.trim()
    || (t.blocks || []).some((b) => b.image || b.text?.trim())
  ))) {
    return false;
  }

  const updates = data.updates || [];
  return !updates.some((u) => u.text?.trim());
};

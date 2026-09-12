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

/* «8–14 вересня» або «29 вер — 5 жовт», якщо тиждень зачіпає два місяці.
   Єдине позначення тижня в інтерфейсі — жодних номерів ISO-тижня:
   людина мислить датами, а не «Тиждень 37». */
export const weekRangeLabel = (mondayStr) => {
  const mon = parse(mondayStr);
  const sun = endOfWeek(mon, { weekStartsOn: 1 });
  const sameMonth = mon.getMonth() === sun.getMonth();
  const day = (d) => format(d, 'd');
  const month = (d) => format(d, 'LLL', { locale: uk }).replace('.', '');
  return sameMonth
    ? `${day(mon)}–${day(sun)} ${month(sun)}`
    : `${day(mon)} ${month(mon)} — ${day(sun)} ${month(sun)}`;
};

/* ---------- порожні заготовки ---------- */

/* Актив додається одним кліком у мультивиборі зверху, а не окремим
   рядком з купою полів — тому тут лишається сам актив і місце для
   факту, а не теза/рівні/нотатки: той самий bias, що визначає весь
   тиждень, тепер один — «Загальний bias тижня» — і по ньому ж звіряється
   факт кожного активу в Review. */
export const emptyAsset = (pair = '') => ({
  id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `w${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
  pair,
  /* заповнюється в Review, коли тиждень уже пройшов */
  actualBias: '', outcome: '',
});

/* Та сама сітка 4 таймфреймів, що й у денному плані — тиждень теж
   починається з top-down структури, просто старших ТФ тут більше. */
export const emptyTda = () => [1, 2, 3, 4].map((id) => ({ id, tf: '', image: null, text: '' }));

export const emptyWeekPlan = (monday) => ({
  date: monday,
  pair: WEEK_PAIR,
  narrative: '',
  tdaBlocks: emptyTda(),
  planText: '',
  assets: [],
  updates: [],
  conclusionsText: '',
  weekRating: 0,
});

/* Той самий розподіл на Plan/Live/Review, що й у денному плані —
   рахується в одному місці, бо потрібен і самій WeeklyPlanView (кільця
   прогресу під заголовками секцій), і лівій рейці-навігатору в
   DailyPlan.jsx (та сама рейка, що й для денного, просто з іншими
   числами). Активи навмисно не рахуються: порожній список — не
   недороблена робота, а можливий чесний стан тижня. */
export const weekPlanProgress = (data) => {
  const tdaFilled = (data.tdaBlocks || []).filter((b) => b.image || b.text?.trim()).length;
  const planPart = [data.narrative ? 1 : 0, Math.min(tdaFilled / 2, 1), data.planText?.trim() ? 1 : 0];
  const plan = planPart.reduce((a, b) => a + b, 0) / planPart.length;

  const updates = data.updates || [];
  const live = updates.length > 0
    ? Math.min(updates.filter((u) => u.text?.trim()).length / updates.length, 1)
    : 0;

  const reviewPart = [data.conclusionsText?.trim() ? 1 : 0, data.weekRating > 0 ? 1 : 0];
  const review = reviewPart.reduce((a, b) => a + b, 0) / reviewPart.length;

  return { plan, live, review };
};

/* Той самий принцип, що й checkIsPlanEmpty для денного: зберігаємо
   будь-що, у чому людина вже щось написала, і не смітимо в хмару
   заготовкою з порожніми полями. */
export const checkIsWeekPlanEmpty = (data) => {
  if (data.planText?.trim() || data.conclusionsText?.trim() || data.weekRating > 0) return false;

  const tdaBlocks = data.tdaBlocks || [];
  if (tdaBlocks.some((b) => b.image || b.text?.trim())) return false;

  const assets = data.assets || [];
  if (assets.some((a) => a.pair?.trim() || a.actualBias || a.outcome?.trim())) {
    return false;
  }

  const updates = data.updates || [];
  return !updates.some((u) => u.text?.trim());
};

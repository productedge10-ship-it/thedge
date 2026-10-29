import { isRestricted } from './propNews';
import { touches } from './propChecks';

/* ==================================================================
   Сторож рахунку пропа: що зараз у нормі, що на межі, що вже порушено.

   Вхід — політика рахунку (propPolicy), живі ліміти (limitsFor) і угоди
   за останні 30 днів. Вихід — список пунктів { id, level, title, text }
   і загальний рівень: ok / warn / bad. Перевіряємо лише те, що реально
   діє на ЦЬОМУ рахунку: якщо новини дозволені — не лякаємо новинами.

   Наближення (пишемо про них у підказці): час угод — місцевий, день —
   від півночі, «тримав через ніч» — за свопом або часом закриття
   раніше за час відкриття.
================================================================== */

const RANK = { ok: 0, info: 0, warn: 1, bad: 2 };
const num = (v) => (v == null || v === '' ? null : Number(v));
const stamp = (day, time) => (day && time ? new Date(`${day}T${String(time).slice(-8).trim()}`).getTime() : null);
const hhmm = (t) => String(t || '').slice(-8, -3) || String(t || '').slice(0, 5);
const dow = (day) => new Date(`${day}T12:00:00`).getDay();
const heldOver = (t) => {
  const a = String(t.entry_time || ''); const b = String(t.exit_time || '');
  return Math.abs(Number(t.swap) || 0) > 0 || (a && b && b.slice(-8) < a.slice(-8));
};

function share(used, limit) {
  const f = limit ? used / limit : 0;
  return { f, level: f >= 0.8 ? 'bad' : f >= 0.5 ? 'warn' : 'ok' };
}

export function guard({ firmId, policy, lim, trades, events, dbList, initial, money, now = Date.now() }) {
  const items = [];
  const add = (id, level, title, text) => items.push({ id, level, title, text });
  const list = trades || [];
  const m = money || ((v) => `$${Math.round(v)}`);

  /* 1. Ліміти з MT5 */
  if (lim?.daily) {
    const { f, level } = share(lim.daily.used, lim.daily.limit);
    add('daily', f >= 1 ? 'bad' : level, f >= 1 ? 'Денний ліміт пробито' : `Денний ліміт: використано ${Math.round(f * 100)}%`,
      `Можна ще втратити ${m(Math.max(lim.daily.left, 0))} сьогодні · не опускайся нижче ${m(lim.daily.floor)}.`);
  }
  if (lim?.max) {
    const { f, level } = share(lim.max.used, lim.max.limit);
    add('max', f >= 1 ? 'bad' : level, f >= 1 ? 'Макс. просадку пробито' : `Макс. просадка: використано ${Math.round(f * 100)}%`,
      `До межі рахунку ${m(Math.max(lim.max.left, 0))} (межа ${m(lim.max.floor)}${lim.max.trailing ? ', трейлінг' : ''}).`);
  }

  if (!policy) return finish(items);

  /* 2. Новини — лише якщо на цьому рахунку вони заборонені */
  if (policy.news.restricted) {
    const { before, after } = policy.news.window;
    const bad = (events || []).filter((ev) => ev.at && isRestricted(firmId, ev, dbList));
    const hits = [];
    for (const t of list) {
      for (const [kind, time] of [['відкрита', t.entry_time], ['закрита', t.exit_time]]) {
        const at = stamp(t.plan_date, time);
        const ev = at && bad.find((e) => touches(t.pair, e.ccy) && at >= e.at.getTime() - before * 60_000 && at <= e.at.getTime() + after * 60_000);
        if (ev) { hits.push(`${t.plan_date} ${t.pair} — ${kind} о ${hhmm(time)}, новина ${ev.ccy} «${ev.title}»`); break; }
      }
    }
    add('news', hits.length ? 'bad' : 'ok', hits.length ? `Угоди у вікні новин: ${hits.length}` : 'Новини: порушень нема',
      hits.length ? hits.slice(0, 4).join('\n') : `Вікно −${before} / +${after} хв. ${policy.news.note}`);
  } else {
    add('news', 'ok', 'Новини на твоєму рахунку дозволені', policy.news.note);
  }

  /* 3. Вихідні й ніч */
  if (!policy.weekend.allowed) {
    const hits = list.filter((t) => dow(t.plan_date) === 5 && heldOver(t));
    const friday = new Date(now).getDay() === 5;
    add('weekend', hits.length ? 'bad' : friday ? 'warn' : 'ok',
      hits.length ? `Схоже, тримав через вихідні: ${hits.length}` : friday ? 'Сьогодні пʼятниця — закрий позиції до кінця сесії' : 'Через вихідні не тримав',
      hits.length ? hits.slice(0, 4).map((t) => `${t.plan_date} ${t.pair}`).join('\n') : policy.weekend.note);
  }
  if (!policy.overnight.allowed) {
    const hits = list.filter((t) => dow(t.plan_date) !== 5 && heldOver(t));
    add('overnight', hits.length ? 'bad' : 'ok', hits.length ? `Схоже, тримав через ніч: ${hits.length}` : 'Через ніч не тримав',
      hits.length ? hits.slice(0, 4).map((t) => `${t.plan_date} ${t.pair}`).join('\n') : policy.overnight.note);
  }

  /* 4. Ризик на угоду / автозакриття */
  if (policy.maxRisk?.pct && initial) {
    const cap = (initial * policy.maxRisk.pct) / 100;
    const hits = list.filter((t) => (num(t.risk_money) || 0) > cap * 1.02 || (num(t.profit_money) || 0) < -cap * 1.02);
    add('risk', hits.length ? 'bad' : 'ok', hits.length ? `Ризик понад ${policy.maxRisk.pct}%: ${hits.length} угод` : `Ризик на угоду в межах ${policy.maxRisk.pct}%`,
      hits.length ? hits.slice(0, 4).map((t) => `${t.plan_date} ${t.pair}: ${m(Math.abs(num(t.risk_money) || num(t.profit_money)))}`).join('\n') : policy.maxRisk.note);
  }
  if (policy.autoClose?.pct && initial) {
    const cap = (initial * policy.autoClose.pct) / 100;
    const hits = list.filter((t) => (num(t.profit_money) || 0) <= -cap * 0.98);
    if (hits.length) add('shield', 'warn', `Угоди зі збитком ≥ ${policy.autoClose.pct}%: ${hits.length}`, `${policy.autoClose.note} На деяких програмах це знижує частку прибутку або закриває рахунок.`);
  }

  /* 5. Денні ліміти в історії */
  if (policy.program?.daily_loss_pct && initial) {
    const limit = (initial * policy.program.daily_loss_pct) / 100;
    const byDay = {};
    for (const t of list) byDay[t.plan_date] = (byDay[t.plan_date] || 0) + (num(t.profit_money) || 0);
    const over = Object.entries(byDay).filter(([, v]) => v <= -limit);
    if (over.length) add('daily-hist', 'bad', `Днів понад денний ліміт: ${over.length}`, over.slice(0, 4).map(([d, v]) => `${d}: ${m(v)}`).join('\n'));
  }

  /* 6. Консистентність */
  if (policy.consistency?.pct) {
    const byDay = {};
    for (const t of list) byDay[t.plan_date] = (byDay[t.plan_date] || 0) + (num(t.profit_money) || 0);
    const total = Object.values(byDay).reduce((s, v) => s + v, 0);
    const best = Math.max(0, ...Object.values(byDay));
    if (total > 0 && best > 0) {
      const pct = Math.round((best / total) * 100);
      const over = pct > policy.consistency.pct;
      add('consistency', over ? (policy.consistency.breach ? 'bad' : 'warn') : 'ok',
        `Найкращий день — ${pct}% прибутку (межа ${policy.consistency.pct}%)`, policy.consistency.note);
    }
  }

  /* 7. Мінімум торгових днів (оцінка) */
  if (policy.minDays) {
    const days = new Set(list.map((t) => t.plan_date)).size;
    add('days', 'info', `Торгових днів: ${Math.min(days, policy.minDays)} з ${policy.minDays}`, days >= policy.minDays ? 'Мінімум виконано.' : `Ще ${policy.minDays - days} — без цього етап не зарахують, навіть із ціллю.`);
  }

  /* 8. Поведінка: серія збитків і розгін */
  const sorted = [...list].sort((a, b) => `${a.plan_date} ${a.entry_time}`.localeCompare(`${b.plan_date} ${b.entry_time}`));
  let streak = 0; let maxStreak = 0;
  for (const t of sorted) { if ((num(t.profit_money) || 0) < 0) { streak += 1; maxStreak = Math.max(maxStreak, streak); } else streak = 0; }
  const today = new Date(now); const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const perDay = list.length / Math.max(1, new Set(list.map((t) => t.plan_date)).size);
  const todayN = list.filter((t) => t.plan_date === key).length;
  if (streak >= 3) add('tilt', 'warn', `${streak} збиткові угоди поспіль`, 'Зроби паузу перед наступною. Серія — головна причина пробитих денних лімітів.');
  if (todayN >= 3 && todayN >= perDay * 2) add('overtrade', 'warn', `Сьогодні ${todayN} угод — удвічі більше, ніж зазвичай`, `Зазвичай ~${perDay.toFixed(1)} на день. Перевір, чи це твій план, а не відігрування.`);
  const week = list.filter((t) => now - new Date(`${t.plan_date}T12:00:00`).getTime() < 7 * 864e5);
  const weekPnl = week.reduce((s, t) => s + (num(t.profit_money) || 0), 0);
  if (lim?.max && weekPnl < 0 && -weekPnl >= lim.max.limit * 0.5) add('week', 'warn', `За тиждень мінус ${m(-weekPnl)}`, `Це ${Math.round((-weekPnl / lim.max.limit) * 100)}% твоєї макс. просадки. Варто зменшити ризик до кінця тижня.`);
  else if (week.length) add('week', 'ok', `Тиждень: ${weekPnl >= 0 ? '+' : '−'}${m(Math.abs(weekPnl))}, ${week.length} угод`, maxStreak >= 3 ? `Найдовша серія мінусів за 30 днів — ${maxStreak}.` : 'Ризик у межах.');

  return finish(items);
}

function finish(items) {
  const level = items.reduce((w, x) => (RANK[x.level] > RANK[w] ? x.level : w), 'ok');
  return { level, items: items.sort((a, b) => RANK[b.level] - RANK[a.level]) };
}

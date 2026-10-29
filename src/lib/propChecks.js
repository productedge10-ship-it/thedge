import { isRestricted, windowOf } from './propNews';

/* ==================================================================
   Ліміти й перевірка угод за правилами пропа.

   Числа брокера (баланс, equity, знімки mt5_snapshots) + правила
   програми. Що рахуємо наближено і чому — пишемо в інтерфейсі:
   день скидаємо о твоїй місцевій півночі (у пропа — свій час, напр.
   00:00 CE(S)T у FTMO), а трейлінг тягнемо від найвищого балансу зі
   знімків, які в нас є.
================================================================== */

const num = (v) => (v == null || v === '' ? null : Number(v));

/* Початковий розмір рахунку: з картки рахунку, з назви («$10 000»), інакше перший знімок. */
export function initialOf(propAcc, mt5, snaps) {
  const a = num(propAcc?.initial_balance);
  if (a) return a;
  const m = String(mt5?.account_title || propAcc?.firm_name || '').replace(/[\s,]/g, '').match(/\$?(\d{4,7})(?!\d)/);
  if (m) return Number(m[1]);
  return num(snaps?.[0]?.balance) || num(mt5?.balance);
}

export function limitsFor(program, { initial, balance, equity, snaps, now = Date.now() }) {
  if (!program || !initial) return null;
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const before = (snaps || []).filter((s) => new Date(s.taken_at) < midnight);
  const dayStart = num(before[before.length - 1]?.balance) ?? num(snaps?.[0]?.balance) ?? balance;
  const eq = equity ?? balance;
  const out = {};
  if (program.daily_loss_pct) {
    const limit = (initial * program.daily_loss_pct) / 100;
    const lost = Math.max(0, dayStart - eq);
    out.daily = { limit, used: lost, left: limit - lost, floor: dayStart - limit, dayStart };
  }
  if (program.max_loss_pct) {
    const limit = (initial * program.max_loss_pct) / 100;
    const trailing = /trail/i.test(program.max_loss_type || '');
    const peak = trailing ? Math.max(initial, balance || 0, ...(snaps || []).map((x) => num(x.balance) || 0)) : initial;
    /* Трейлінг зазвичай тягнеться до початкового балансу і там зупиняється. */
    const floor = trailing ? Math.min(peak - limit, initial) : initial - limit;
    out.max = { limit, floor, left: eq - floor, used: Math.max(0, limit - (eq - floor)), trailing, peak };
  }
  const target = (program.phases || []).find((p) => p.profit_target_pct)?.profit_target_pct;
  if (target) {
    const goal = (initial * target) / 100;
    out.target = { goal, done: Math.max(0, (balance ?? initial) - initial), pct: target };
  }
  return out;
}

/* Інструмент зачіпає подію? EURUSD ↔ EUR/USD; долар — ще золото й американські індекси. */
const US = /XAU|GOLD|US30|US100|US500|NAS|SPX|DJ|DOW|USTEC|USOIL|WTI/i;
export const touches = (pair, ccy) => {
  const p = String(pair || '').toUpperCase();
  if (!p || !ccy) return false;
  return p.includes(ccy) || (ccy === 'USD' && US.test(p)) || (ccy === 'EUR' && /GER|DE40|DAX|EU50/.test(p)) || (ccy === 'GBP' && /UK100|FTSE/.test(p)) || (ccy === 'JPY' && /JP225|NIK/.test(p));
};

const stamp = (day, time) => (day && time ? new Date(`${day}T${String(time).slice(0, 8)}`).getTime() : null);

/* Можливі порушення: угода відкрита/закрита у вікні забороненої новини по своєму інструменту
   і дні, де збиток перевищив денний ліміт. */
export function checkTrades(firmId, data, program, trades, events, dbList, initial) {
  const { before, after } = windowOf(data);
  const bad = (events || []).filter((ev) => ev.at && isRestricted(firmId, ev, dbList));
  const out = [];
  for (const t of trades || []) {
    for (const [kind, time] of [['відкрита', t.entry_time], ['закрита', t.exit_time]]) {
      const at = stamp(t.plan_date, time);
      if (!at) continue;
      const ev = bad.find((e) => touches(t.pair, e.ccy) && at >= e.at.getTime() - before * 60_000 && at <= e.at.getTime() + after * 60_000);
      if (ev) { out.push({ type: 'news', trade: t, kind, ev, at }); break; }
    }
  }
  if (program?.daily_loss_pct && initial) {
    const limit = (initial * program.daily_loss_pct) / 100;
    const byDay = {};
    for (const t of trades || []) byDay[t.plan_date] = (byDay[t.plan_date] || 0) + (Number(t.profit_money) || 0);
    for (const [day, pnl] of Object.entries(byDay)) if (pnl <= -limit) out.push({ type: 'daily', day, pnl, limit });
  }
  return out.sort((a, b) => String(b.trade?.plan_date || b.day).localeCompare(String(a.trade?.plan_date || a.day)));
}

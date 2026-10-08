import { supabase } from './supabase';
import { setupsOfTags } from './backtestTags';

/* ==================================================================
   Два способи вести бектест.

   • «chart»  — на реальному графіку: реплей свічок, угоди пишуться
                самі разом зі знімками входу й виходу;
   • «manual» — ручний журнал: торгуєш де завгодно (TradingView, MT5)
                і записуєш угоди сам.

   Режим і налаштування (ризик, таймфрейм, дата старту) лежать у
   backtest_sessions.mode / .settings. Поки міграцію не запущено,
   колонок немає — тоді тримаємо їх у браузері, а для старих бектестів
   вгадуємо режим за угодами (угода з графіка має tda_data.chart).
================================================================== */

const LKEY = 'edge_bt_meta';

const readLocal = () => {
  try { return JSON.parse(localStorage.getItem(LKEY) || '{}') || {}; } catch { return {}; }
};

const writeLocal = (id, patch) => {
  try {
    const all = readLocal();
    const cur = all[id] || {};
    all[id] = { ...cur, ...patch, settings: { ...(cur.settings || {}), ...(patch.settings || {}) } };
    localStorage.setItem(LKEY, JSON.stringify(all));
  } catch { /* приватний режим — нічого страшного */ }
};

const inferMode = (s) => ((s?.trades || []).some((t) => t?.tda_data?.chart?.entry_time) ? 'chart' : 'manual');

export function sessionMeta(s) {
  const local = (s?.id && readLocal()[s.id]) || {};
  const settings = { ...(local.settings || {}), ...(s?.settings && typeof s.settings === 'object' ? s.settings : {}) };
  return { mode: s?.mode || local.mode || inferMode(s), settings };
}

export const isChartSession = (s) => sessionMeta(s).mode === 'chart';

export const chartUrl = (s) => `/backtest/chart?session=${s.id}`;
export const statsUrl = (s) => `/backtest/${s.id}`;

/* Колонки mode/settings ще не створені (міграцію не запускали). */
const missingColumn = (err) => !!err && /\b(mode|settings)\b|column|schema cache/i.test(`${err.message || ''} ${err.details || ''}`);

export async function insertSession(payload) {
  const { mode = 'manual', settings = {}, ...base } = payload;
  let r = await supabase.from('backtest_sessions').insert([{ ...base, mode, settings }]).select().single();
  if (r.error && missingColumn(r.error)) {
    r = await supabase.from('backtest_sessions').insert([base]).select().single();
    if (!r.error && r.data) writeLocal(r.data.id, { mode, settings });
  }
  if (r.error) throw r.error;
  return { ...r.data, mode: r.data?.mode || mode, settings: r.data?.settings || settings };
}

/* Змінити налаштування бектесту (наприклад, ризик з панелі угоди). */
export async function updateSessionSettings(s, patch) {
  if (!s?.id) return null;
  const settings = { ...sessionMeta(s).settings, ...patch };
  const { error } = await supabase.from('backtest_sessions').update({ settings }).eq('id', s.id);
  if (error) writeLocal(s.id, { settings: patch });
  return settings;
}

/* Угода з графіка (рядок backtest_trades) → формат рушія графіка.
   null — угода записана вручну, рівнів і часу в ній немає. */
export function chartTradeFromRow(row) {
  const m = (row && typeof row.tda_data === 'object' && row.tda_data) || {};
  const c = m.chart;
  if (!c?.entry_time || !c?.exit_time) return null;
  const rr = Math.abs(Number(row.rr) || 0);
  const r = c.r ?? (row.result === 'LOSS' ? -rr : row.result === 'BE' ? 0 : rr);
  return {
    id: `db${row.id}`, dbId: row.id, saved: true, fromDb: true,
    symbol: m.pair || c.symbol || '', side: c.side || row.type, tf: c.tf,
    entry: c.entry, sl: c.sl, slFinal: c.sl_final ?? c.sl, tp: c.tp, exit: c.exit,
    entryT: c.entry_time, exitT: c.exit_time, r, result: row.result, reason: c.exit_reason,
    note: row.notes || '', partials: c.partials || [], trail: !!c.trail, snaps: c.snaps || null,
    meta: { setups: setupsOfTags(m.tags), emotions: m.emotions || [], mistakes: m.mistakes || [] },
  };
}

import { supabase } from './supabase';

/* ==================================================================
   Акаунти й рух грошей на них.

   Раніше вся деталка була намальована: графік по вигаданих точках,
   виплати списком-заглушкою. Тепер кожна зміна балансу — рядок у
   таблиці `account_events`, і графік малюється рівно по ньому.

   Головний сценарій, заради якого це все:
   акаунт на 10 000 → наторгував до 11 000 → вписав виплату 1 000 →
   баланс знову 10 000, а тисяча назавжди лишилась в історії.
   Тому подія зберігає і суму, і баланс ПІСЛЯ неї: історію не треба
   перераховувати, вона вже готова до малювання.
================================================================== */

/* ------------------------------------------------------------------
   Розмір рахунку — база для ризику й R.

   Ризик у пропі рахують від номіналу рахунку (10k, 100k), а не від
   поточного балансу: 1% на рахунку 100k — це $1 000 і при балансі
   $104 000, і при $97 000. Рахувати від балансу означало б, що той
   самий «1R» гуляє разом з P&L, і R перестає бути одиницею.

   Номінал пропа завжди круглий (10k, 50k, 100k), а рахунки, які завів
   воркер MT5, записували в initial_balance баланс на момент першої
   синхронізації — $9 569 замість 10k, $45 970 замість 50k. Тому і
   initial_balance, і баланс «притягуємо» до найближчого стандартного
   розміру, якщо до нього не далі 10%. Далі — не вгадуємо й беремо
   число як є: це, найімовірніше, особистий рахунок.
------------------------------------------------------------------ */
const STD_SIZES = [2500, 5000, 6000, 10000, 15000, 20000, 25000, 50000, 60000, 75000,
  80000, 100000, 125000, 150000, 200000, 250000, 300000, 400000, 500000];

export function guessAccountSize(balance) {
  const b = Number(balance) || 0;
  if (b <= 0) return 0;
  let best = null;
  for (const s of STD_SIZES) {
    const d = Math.abs(b - s) / s;
    if (d <= 0.1 && (!best || d < best.d)) best = { s, d };
  }
  return best ? best.s : b;
}

export const accountSize = (acc) => {
  const init = Number(acc?.initial_balance);
  return guessAccountSize(init > 0 ? init : acc?.balance);
};

export const KINDS = {
  start:   { label: 'Старт',        sign: 0 },
  payout:  { label: 'Виплата',      sign: -1 },
  deposit: { label: 'Поповнення',   sign: +1 },
  adjust:  { label: 'Коригування',  sign: 0 },
  trade:   { label: 'Угода',        sign: 0 },
};

/* Деталка акаунта англійською: цю картку показують іншим, і
   змішані мови в одному вікні виглядають як недороблений переклад. */
export const KINDS_EN = {
  start:   { label: 'Opening',    hint: 'account size at start' },
  payout:  { label: 'Payout',     hint: 'balance goes down, stays in history' },
  deposit: { label: 'Deposit',    hint: 'top-up or account upgrade' },
  adjust:  { label: 'Adjustment', hint: 'set balance to an exact number' },
  trade:   { label: 'Trade',      hint: 'automatic — profit or loss from a logged trade' },
};

/* Причини закриття акаунта — переважно проп-порушення. Вільний
   текст теж можна дописати нотаткою поруч, тому список короткий. */
export const CLOSE_REASONS = [
  'Max daily loss breached',
  'Max total loss breached',
  'Traded during news',
  'Inconsistent lot sizing',
  'Held over the weekend',
  'Account passed / paid out',
  'Other',
];

export const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const money = (n) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(Number(n) || 0);

export const money2 = (n) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(n) || 0);

/* ---------- акаунти ---------- */

export async function fetchAccounts(userId) {
  const { data, error } = await supabase
    .from('prop_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/* ---------- події ---------- */

export async function fetchEvents(accountId) {
  const { data, error } = await supabase
    .from('account_events')
    .select('id, kind, amount, balance_after, note, happened_at, created_at')
    .eq('account_id', accountId)
    .order('happened_at', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/* Акаунти, створені до появи журналу подій, не мають стартової
   точки — дописуємо її з дати створення, інакше графік починається
   нізвідки. */
export async function ensureStart(userId, account, events) {
  if (events.some((e) => e.kind === 'start')) return events;

  const size = accountSize(account);
  const row = {
    user_id: userId,
    account_id: account.id,
    kind: 'start',
    amount: size,
    balance_after: size,
    note: '',
    happened_at: (account.created_at || todayLocal()).slice(0, 10),
  };

  const { data, error } = await supabase.from('account_events').insert(row).select().single();
  if (error) return events;          // не критично: просто малюємо без старту
  return [data, ...events];
}

/* ---------- етапи проп-челенджу ----------
   Фаза 1 → Фаза 2 → Funded. Кожен етап — свій рядок у account_phases
   зі своєю ціллю й, за потреби, власними лімітами; рівно один зі
   status='active' на рахунок (це тримає унікальний індекс у базі,
   не сам код). daily_loss_pct/max_drawdown_pct тут можуть бути null —
   це означає «як на рахунку», а не «нуль». */

export const PHASE_STATUS = {
  active: { label: 'Активна' },
  passed: { label: 'Пройдена' },
  failed: { label: 'Провалена' },
};

export async function fetchPhases(accountId) {
  const { data, error } = await supabase
    .from('account_phases')
    .select('*')
    .eq('account_id', accountId)
    .order('started_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/* Рахунки, створені до появи етапів, не мають жодного рядка в
   account_phases — заводимо «Фазу 1» заднім числом, з тим самим
   принципом, що й ensureStart: без цього Survival не має від чого
   рахувати прогрес. */
export async function ensurePhase(userId, account, phases) {
  if (phases.some((p) => p.status === 'active')) return phases;

  const row = {
    user_id: userId,
    account_id: account.id,
    label: 'Фаза 1',
    starting_balance: accountSize(account),
    status: 'active',
    started_at: account.created_at || new Date().toISOString(),
  };

  const { data, error } = await supabase.from('account_phases').insert(row).select().single();
  if (error) return phases;          // не критично: сторінка просто без редактора етапу
  return [...phases, data];
}

/* Редагування цілі/лімітів поточного етапу — саме те, заради чого
   Survival існує: цифри чужого пропа нікуди не годяться, людина
   підставляє свої. */
export async function updatePhase(userId, phaseId, fields) {
  const { data, error } = await supabase
    .from('account_phases')
    .update(fields)
    .eq('id', phaseId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* Перехід у наступний етап — новий старт, а не зміна цифр на тому
   самому рядку: інакше Survival і графік балансу далі рахували б
   від попередньої фази, і ціль виглядала б уже пройденою. Дві дії
   за раз (закрити старий етап, відкрити новий), і саме в цьому
   порядку: унікальний індекс account_phases_one_active_idx дозволяє
   лише один активний рядок на рахунок, тож вставити новий активний,
   поки старий ще активний, база просто не дасть. Якщо впаде другий
   запит, лишається рахунок без жодної активної фази — не страшно,
   ensurePhase заводить нову при наступному відкритті картки. */
export async function advancePhase(userId, account, currentPhase, { label, target_pct, daily_loss_pct, max_drawdown_pct }) {
  if (currentPhase) {
    const { error: closeError } = await supabase
      .from('account_phases')
      .update({ status: 'passed', ended_at: new Date().toISOString() })
      .eq('id', currentPhase.id)
      .eq('user_id', userId);
    if (closeError) throw closeError;
  }

  const { data: opened, error: openError } = await supabase
    .from('account_phases')
    .insert({
      user_id: userId,
      account_id: account.id,
      label: label || 'Фаза 2',
      target_pct: target_pct === '' || target_pct == null ? null : Number(target_pct),
      daily_loss_pct: daily_loss_pct === '' || daily_loss_pct == null ? null : Number(daily_loss_pct),
      max_drawdown_pct: max_drawdown_pct === '' || max_drawdown_pct == null ? null : Number(max_drawdown_pct),
      starting_balance: Number(account.balance) || 0,
      status: 'active',
    })
    .select()
    .single();

  if (openError) throw openError;

  return opened;
}

/* Провал етапу — рахунок закрився (проп-порушення), а не пройшов
   далі. Окремо від advancePhase: тут не заводимо нового рядка, лише
   позначаємо, чим скінчився цей. */
export async function failPhase(userId, phaseId) {
  const { error } = await supabase
    .from('account_phases')
    .update({ status: 'failed', ended_at: new Date().toISOString() })
    .eq('id', phaseId)
    .eq('user_id', userId);
  if (error) throw error;
}

/* ---------- виплата ----------
   Дві дії за раз: подія в історію і новий баланс на акаунті.
   Порядок важливий — спершу подія. Якщо впаде другий запит, у нас
   лишиться слід виплати, а не тихо зменшений баланс без причини. */
export async function addEvent(userId, account, { kind, amount, happened_at, note }) {
  const sign = KINDS[kind]?.sign ?? 0;
  const value = Math.abs(Number(amount) || 0);
  const nextBalance = kind === 'adjust'
    ? value
    : Number(account.balance) + sign * value;

  const { data: ev, error: evError } = await supabase
    .from('account_events')
    .insert({
      user_id: userId,
      account_id: account.id,
      kind,
      amount: value,
      balance_after: nextBalance,
      note: note || '',
      happened_at: happened_at || todayLocal(),
    })
    .select()
    .single();

  if (evError) throw evError;

  const { data: acc, error: accError } = await supabase
    .from('prop_accounts')
    .update({ balance: nextBalance })
    .eq('id', account.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (accError) throw accError;

  return { event: ev, account: acc };
}

/* ---------- авто-рух від угоди ----------
   Тільки для нових угод (форма викликає це лише при insert, не при
   редагуванні) — щоб не рахувати той самий трейд у баланс двічі й
   не переписувати заднім числом угоди, залоговані до цієї фічі.
   profit — вже підписане число ($ прибуток чи збиток), а не сума
   по модулю: додатне збільшує баланс, відʼємне зменшує. */
export async function logTradeMovement(userId, account, { profit, happened_at, note }) {
  const nextBalance = Number(account.balance) + profit;

  const { data: ev, error: evError } = await supabase
    .from('account_events')
    .insert({
      user_id: userId,
      account_id: account.id,
      kind: 'trade',
      amount: Math.abs(profit),
      balance_after: nextBalance,
      note: note || '',
      happened_at: happened_at || todayLocal(),
    })
    .select()
    .single();

  if (evError) throw evError;

  const { data: acc, error: accError } = await supabase
    .from('prop_accounts')
    .update({ balance: nextBalance })
    .eq('id', account.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (accError) throw accError;

  return { event: ev, account: acc };
}

/* ---------- закриття акаунта ----------
   Акаунт не видаляється — лишається в списку зі статусом Closed і
   причиною. Баланс і історія не чіпаються: людині може ще знадобитись
   подивитись, як усе було до закриття. */
export async function closeAccount(userId, accountId, reason) {
  const { data, error } = await supabase
    .from('prop_accounts')
    .update({ status: 'Closed', closed_reason: reason || null, closed_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function setBalance(userId, accountId, value) {
  const { data, error } = await supabase
    .from('prop_accounts')
    .update({ balance: value })
    .eq('id', accountId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeEvent(userId, event) {
  const { error } = await supabase
    .from('account_events')
    .delete()
    .eq('id', event.id)
    .eq('user_id', userId);
  if (error) throw error;
}

/* ---------- угоди акаунта ----------
   У журналі акаунт зберігається назвою фірми — тим самим рядком,
   що стоїть у картці. Тому статистика збирається без окремого
   звʼязку в базі. */
export async function fetchAccountTrades(userId, firmName) {
  const { data, error } = await supabase
    .from('trades')
    /* `profit_money` і `exit_time` потрібні кривій балансу: знімки з
       терміналу існують лише з дня, коли воркер навчився їх писати, а
       все, що було раніше, відтворюється саме з угод. */
    .select('id, plan_date, result, rr, risk, followed_plan, has_mistake, profit_money, exit_time')
    .eq('user_id', userId)
    .eq('account_name', firmName)
    .order('plan_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

/* R однієї угоди. Той самий підрахунок, що на стартовій сторінці:
   виграш дає свій rr, програш — мінус один R, якщо rr не вказано. */
export const tradeR = (t) => {
  const rr = Number(t.rr) || 0;
  if (t.result === 'Win') return Math.abs(rr);
  if (t.result === 'Lose') return -Math.abs(rr || 1);
  return 0;
};

export function tradeStats(trades) {
  const closed = trades.filter((t) => ['Win', 'Lose', 'BE'].includes(t.result));
  const wins = closed.filter((t) => t.result === 'Win').length;
  const losses = closed.filter((t) => t.result === 'Lose').length;
  const netR = closed.reduce((s, t) => s + tradeR(t), 0);
  const decided = wins + losses;

  return {
    total: closed.length,
    wins,
    losses,
    netR: Math.round(netR * 10) / 10,
    avgR: closed.length ? Math.round((netR / closed.length) * 100) / 100 : 0,
    winrate: decided ? Math.round((wins / decided) * 100) : 0,
    clean: closed.length
      ? Math.round((closed.filter((t) => t.followed_plan && !t.has_mistake).length / closed.length) * 100)
      : 0,
  };
}

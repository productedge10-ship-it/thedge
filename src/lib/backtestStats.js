/* ==================================================================
   Уся математика бектесту в одному місці.
   Головна сторінка і сторінка сесії рахують однаково — інакше
   цифри на картці й усередині розходяться, і довіри до них нуль.

   Ризик фіксований: 1R = 1% депозиту. Тому R — головна одиниця,
   а гроші — похідна від нього.
================================================================== */

export const SESSIONS = ['Asia', 'London', 'New York'];
export const QUALITIES = ['A+', 'A', 'B', 'C'];
/* Стартовий список активів. Він не претендує на повноту — це те, з
   чого починають, коли ще немає власної історії. Щойно в бектесті
   зʼявляються угоди, вибір активу підказує вже їх, а не цей масив. */
export const COMMON_PAIRS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'USDJPY', 'BTCUSD', 'NAS100', 'US30', 'GER40'];
export const RESULTS = ['WIN', 'LOSS', 'BE'];
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'];

/* R угоди. LOSS завжди -1R: у бектесті ризик однаковий. */
export const rOf = (t) => {
  const rr = Number(t.rr);
  if (t.result === 'BE') return 0;
  if (t.result === 'LOSS') return rr < 0 ? rr : -Math.abs(rr || 1);
  if (t.result === 'WIN') return Math.abs(rr) || 0;
  return Number.isFinite(rr) ? rr : 0;
};

export const rText = (t) => {
  const r = rOf(t);
  return `${r > 0 ? '+' : ''}${Number(r.toFixed(2))}R`;
};

/* Витягуємо те, що лежить у tda_data, не ламаючись на старих записах */
export const metaOf = (t) => (t && typeof t.tda_data === 'object' && t.tda_data) || {};
export const sessionOf = (t) => metaOf(t).session || t.session || '—';
export const qualityOf = (t) => metaOf(t).quality || t.quality || null;
export const tagsOf = (t) => metaOf(t).tags || t.tags || [];
export const pairOf = (t, fallback) => metaOf(t).pair || t.pair || fallback || '';

export const money = (v) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('uk-UA', { maximumFractionDigits: 0 })}`;

const weekdayIndex = (iso) => {
  const d = new Date(String(iso) + (String(iso).length <= 10 ? 'T12:00:00' : ''));
  if (isNaN(d)) return null;
  const day = d.getDay();          // 0 нд … 6 сб
  return day === 0 || day === 6 ? null : day - 1;  // 0 пн … 4 пт
};

/* ==================================================================
   Головний розрахунок. Приймає масив угод (у порядку створення)
   і початковий баланс сесії.
================================================================== */
export function computeStats(rawTrades, initialBalance = 10000) {
  const trades = [...(rawTrades || [])].sort((a, b) => {
    const da = new Date(a.date || a.created_at || 0);
    const db = new Date(b.date || b.created_at || 0);
    if (da - db !== 0) return da - db;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });

  const total = trades.length;
  const wins = trades.filter((t) => t.result === 'WIN');
  const losses = trades.filter((t) => t.result === 'LOSS');
  const bes = trades.filter((t) => t.result === 'BE');
  const decisive = total - bes.length;

  const rs = trades.map(rOf);
  const netR = rs.reduce((s, r) => s + r, 0);
  const grossWin = rs.filter((r) => r > 0).reduce((s, r) => s + r, 0);
  const grossLoss = Math.abs(rs.filter((r) => r < 0).reduce((s, r) => s + r, 0));

  const winrate = decisive ? (wins.length / decisive) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const expectancy = total ? netR / total : 0;              // середній R на угоду
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;

  /* крива еквіті + просадка (в R і у %) */
  const riskPerTrade = initialBalance * 0.01;
  const equity = [{ i: 0, label: 'Старт', r: 0, balance: initialBalance, dd: 0, date: null }];
  let cum = 0, peak = 0, maxDD = 0;
  trades.forEach((t, i) => {
    cum += rs[i];
    peak = Math.max(peak, cum);
    const dd = cum - peak;                                   // ≤ 0
    maxDD = Math.min(maxDD, dd);
    equity.push({
      i: i + 1,
      label: `#${i + 1}`,
      r: Number(cum.toFixed(2)),
      balance: Math.round(initialBalance + cum * riskPerTrade),
      dd: Number(dd.toFixed(2)),
      date: t.date || null,
      result: t.result,
      tradeR: Number(rs[i].toFixed(2)),
    });
  });
  const maxDrawdownR = Math.abs(maxDD);
  const currentDDR = Math.abs(cum - peak);

  /* серії */
  let bestWinStreak = 0, worstLossStreak = 0, curW = 0, curL = 0;
  trades.forEach((t) => {
    if (t.result === 'WIN') { curW++; curL = 0; }
    else if (t.result === 'LOSS') { curL++; curW = 0; }
    else { curW = 0; curL = 0; }
    bestWinStreak = Math.max(bestWinStreak, curW);
    worstLossStreak = Math.max(worstLossStreak, curL);
  });
  const last = trades[trades.length - 1];
  const currentStreak = (() => {
    if (!last || last.result === 'BE') return null;
    const type = last.result;
    let n = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
      if (trades[i].result !== type) break;
      n++;
    }
    return { type, count: n };
  })();

  /* розподіл R по кошиках */
  const BUCKETS = [
    { key: '≤ −1R', test: (r) => r <= -1 },
    { key: '−1…0R', test: (r) => r > -1 && r < 0 },
    { key: '0R',    test: (r) => r === 0 },
    { key: '0…1R',  test: (r) => r > 0 && r < 1 },
    { key: '1…2R',  test: (r) => r >= 1 && r < 2 },
    { key: '2…3R',  test: (r) => r >= 2 && r < 3 },
    { key: '3R+',   test: (r) => r >= 3 },
  ];
  const distribution = BUCKETS.map((b) => ({
    key: b.key,
    count: rs.filter(b.test).length,
    positive: !b.key.startsWith('≤') && !b.key.startsWith('−'),
    neutral: b.key === '0R',
  }));
  const distMax = Math.max(1, ...distribution.map((d) => d.count));
  distribution.forEach((d) => { d.pct = (d.count / distMax) * 100; });

  /* розбивка: сесії та дні тижня */
  const groupStats = (list) => {
    const r = list.reduce((s, t) => s + rOf(t), 0);
    const w = list.filter((t) => t.result === 'WIN').length;
    const dec = list.filter((t) => t.result !== 'BE').length;
    return { count: list.length, netR: Number(r.toFixed(2)), winrate: dec ? (w / dec) * 100 : 0 };
  };

  const bySession = SESSIONS.map((name) => ({
    name,
    ...groupStats(trades.filter((t) => sessionOf(t) === name)),
  })).filter((s) => s.count > 0);

  const byWeekday = WEEKDAYS.map((name, idx) => ({
    name,
    ...groupStats(trades.filter((t) => weekdayIndex(t.date) === idx)),
  }));

  const byQuality = QUALITIES.map((q) => ({
    name: q,
    ...groupStats(trades.filter((t) => qualityOf(t) === q)),
  })).filter((q) => q.count > 0);

  const balance = initialBalance + netR * riskPerTrade;

  return {
    trades, total, wins: wins.length, losses: losses.length, bes: bes.length, decisive,
    netR: Number(netR.toFixed(2)),
    winrate, profitFactor, expectancy,
    avgWin, avgLoss,
    grossWin, grossLoss,
    balance, initialBalance, riskPerTrade,
    returnPct: initialBalance ? ((balance - initialBalance) / initialBalance) * 100 : 0,
    equity, maxDrawdownR, currentDDR,
    bestWinStreak, worstLossStreak, currentStreak,
    distribution,
    bySession, byWeekday, byQuality,
    bestR: rs.length ? Math.max(...rs) : 0,
    worstR: rs.length ? Math.min(...rs) : 0,
    lastDate: last?.date || null,
  };
}

/* Компактна серія для спарклайна на картці списку */
export function sparkFromTrades(trades) {
  let cum = 0;
  return [{ i: 0, r: 0 }, ...(trades || []).map((t, i) => {
    cum += rOf(t);
    return { i: i + 1, r: Number(cum.toFixed(2)) };
  })];
}

export const fmtPF = (pf) => (pf === Infinity ? '∞' : pf.toFixed(2));
export const fmtR = (r) => `${r > 0 ? '+' : ''}${Number(r).toFixed(2)}R`;

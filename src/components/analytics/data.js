import { useMemo } from 'react';

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ASSETS = ['EURUSD', 'GBPUSD', 'GER40', 'XAUUSD', 'US100', 'USDJPY'];
export const ACCOUNTS = ['FTMO 100K', 'Finding Pips', 'MFF 50K'];
export const SETUPS = ['Sweep + BOS', 'OB retest', 'FVG fill', 'Trendline break', 'Range fade', 'News spike'];
export const EMOTIONS = ['calm', 'confident', 'anxious', 'tilt'];
export const EMOTION_LABEL = { calm: 'Спокій', confident: 'Впевненість', anxious: 'Тривога', tilt: 'Тільт' };
export const EMOTION_COLOR = { calm: '#34d399', confident: 'var(--edge-acc, #8b7bff)', anxious: '#fbbf24', tilt: '#f87171' };
export const MISTAKES = [
  'Вхід до підтвердження', 'Наздогнав рух', 'Пересунув стоп',
  'Завеликий обʼєм', 'Торгував поза сесією', 'Не зафіксував по плану',
];
export const DOW = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function buildTrades() {
  const rnd = mulberry32(20260714);
  const out = [];
  const start = new Date(Date.UTC(2026, 3, 17));
  const end = new Date(Date.UTC(2026, 6, 14));
  let id = 1;

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const count = rnd() < 0.42 ? 0 : rnd() < 0.78 ? 1 : 2;

    for (let k = 0; k < count; k++) {
      const asset = ASSETS[Math.floor(rnd() * ASSETS.length)];
      const side = rnd() < 0.52 ? 'LONG' : 'SHORT';
      const hour = 7 + Math.floor(rnd() * 12);
      const session = hour < 10 ? 'Asia' : hour < 15 ? 'London' : 'New York';
      const account = ACCOUNTS[Math.floor(rnd() * ACCOUNTS.length)];
      const setup = SETUPS[Math.floor(rnd() * SETUPS.length)];

      const lastTwo = out.slice(-2);
      const recentLoss = lastTwo.filter((t) => t.rr < 0).length;
      const er = rnd() + recentLoss * 0.22;
      const emotion = er > 1.02 ? 'tilt' : er > 0.78 ? 'anxious' : er > 0.42 ? 'confident' : 'calm';

      let p = 0.5;
      p += { calm: 0.2, confident: 0.12, anxious: -0.12, tilt: -0.3 }[emotion];
      p += { London: 0.12, 'New York': 0.02, Asia: -0.14 }[session];
      p += dow === 3 ? 0.14 : dow === 1 ? -0.07 : 0;
      p += asset === 'EURUSD' ? 0.11 : asset === 'GER40' && side === 'LONG' ? -0.2 : 0;
      p += setup === 'Sweep + BOS' ? 0.09 : setup === 'News spike' ? -0.14 : 0;

      const roll = rnd();
      let result, rr;
      if (roll < 0.14 + (emotion === 'anxious' ? 0.1 : 0)) {
        result = 'BE'; rr = 0;
      } else if (roll < 0.14 + p * 0.86) {
        result = 'WIN';
        rr = +(1 + rnd() * 2.6 + (emotion === 'calm' ? 0.5 : 0)).toFixed(1);
      } else {
        result = 'LOSS';
        rr = -+(0.7 + rnd() * 0.5 + (emotion === 'tilt' ? 0.5 : 0)).toFixed(1);
      }

      const mistakes = [];
      const mp = { calm: 0.08, confident: 0.18, anxious: 0.45, tilt: 0.8 }[emotion];
      if (rnd() < mp) mistakes.push(MISTAKES[Math.floor(rnd() * MISTAKES.length)]);
      if (rnd() < mp * 0.35) {
        const m = MISTAKES[Math.floor(rnd() * MISTAKES.length)];
        if (!mistakes.includes(m)) mistakes.push(m);
      }

      const risk = +(0.5 + (emotion === 'tilt' ? rnd() * 1.4 : rnd() * 0.5)).toFixed(2);
      const mae = +(0.2 + rnd() * 0.7).toFixed(1);
      const mfe = +Math.max(rr, 0.3 + rnd() * 3).toFixed(1);

      out.push({
        id: id++, date: d.toISOString().slice(0, 10), dow, hour, asset, side, session,
        account, setup, emotion, result, rr, mistakes, planFollowed: mistakes.length === 0,
        risk, holdMin: 12 + Math.floor(rnd() * 240), mae, mfe,
      });
    }
  }
  return out;
}

export const TRADES = buildTrades();

export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const r1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
export const r2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
export const signed = (n, d = 1) => (n > 0 ? '+' : '') + (d === 1 ? r1(n) : r2(n));

export function groupStats(trades, keyFn) {
  const map = new Map();
  trades.forEach((t) => {
    const k = keyFn(t);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  });
  return [...map.entries()].map(([key, list]) => {
    const wins = list.filter((t) => t.result === 'WIN');
    const losses = list.filter((t) => t.result === 'LOSS');
    const decided = wins.length + losses.length;
    return {
      key, trades: list.length, net: +sum(list.map((t) => t.rr)).toFixed(1),
      avg: +(sum(list.map((t) => t.rr)) / list.length).toFixed(2),
      wr: decided ? Math.round((wins.length / decided) * 100) : 0,
      mistakes: sum(list.map((t) => t.mistakes.length)), list,
    };
  });
}

/* Статистика рахується з переданих угод. Раніше вона брала їх із
   генератора всередині себе — і сторінка показувала однакові гарні
   графіки будь-якій людині. Тепер джерело приходить ззовні, а
   генератор лишається тільки для демо. */
export function useStats(trades) {
  return useMemo(() => {
    const t = Array.isArray(trades) ? trades : TRADES;

    /* Порожній журнал — не помилка, а нормальний стан першого дня.
       Тому всюди нижче ділення захищене: NaN у картці виглядає як
       поламаний застосунок, хоча означає лише «ще нема даних». */
    const n = t.length;
    const wins = t.filter((x) => x.result === 'WIN');
    const losses = t.filter((x) => x.result === 'LOSS');
    const be = t.filter((x) => x.result === 'BE');
    const gross = sum(wins.map((x) => x.rr));
    const grossLoss = Math.abs(sum(losses.map((x) => x.rr)));
    const net = gross - grossLoss;

    let acc = 0, peak = 0, maxDD = 0;
    const equity = t.map((x) => {
      acc += x.rr;
      peak = Math.max(peak, acc);
      maxDD = Math.min(maxDD, acc - peak);
      return { date: x.date.slice(5), value: +acc.toFixed(2), dd: +(acc - peak).toFixed(2) };
    });

    let curW = 0, curL = 0, bestW = 0, worstL = 0, cleanStreak = 0;
    t.forEach((x) => {
      if (x.result === 'WIN') { curW++; curL = 0; } else if (x.result === 'LOSS') { curL++; curW = 0; }
      bestW = Math.max(bestW, curW); worstL = Math.max(worstL, curL);
    });
    for (let i = t.length - 1; i >= 0; i--) { if (t[i].planFollowed) cleanStreak++; else break; }

    const tiltCost = sum(t.filter((x) => x.rr < 0 && (x.mistakes.length > 0 || x.emotion === 'tilt' || x.emotion === 'anxious')).map((x) => x.rr));

    /* Перелік помилок беремо з самих угод, а не зі списку в коді:
       журнал зберігає власні категорії, і фіксований перелік давав би
       рівно нулі навпроти шести чужих назв. */
    const mistakeNames = [...new Set(t.flatMap((x) => x.mistakes))];
    const mistakeLedger = (mistakeNames.length ? mistakeNames : MISTAKES).map((m) => {
      const list = t.filter((x) => x.mistakes.includes(m));
      return {
        name: m, count: list.length,
        cost: +sum(list.filter((x) => x.rr < 0).map((x) => x.rr)).toFixed(1),
        net: +sum(list.map((x) => x.rr)).toFixed(1),
      };
    }).sort((a, b) => a.cost - b.cost);

    const afterLoss = [];
    const afterWin = [];
    t.forEach((x, i) => {
      if (i === 0) return;
      if (t[i - 1].result === 'LOSS') afterLoss.push(x);
      if (t[i - 1].result === 'WIN') afterWin.push(x);
    });
    const avgAfterLoss = afterLoss.length ? sum(afterLoss.map((x) => x.rr)) / afterLoss.length : 0;
    const avgAfterWin = afterWin.length ? sum(afterWin.map((x) => x.rr)) / afterWin.length : 0;
    /* Без часу утримання угода в цей розріз не потрапляє. Раніше
       порожнє поле мовчки ставало нулем, і кожна угода без часу
       зараховувалась як «швидкий вхід після мінусу» — тобто
       відігравання рахувалось там, де його не було. */
    const revenge = afterLoss.filter(
      (x) => typeof x.holdMin === 'number' && x.holdMin < 60 && x.mistakes.length > 0,
    ).length;

    const chain = [0, 1, 2, 3].map((depth) => {
      const bucket = t.filter((x, i) => {
        let c = 0;
        for (let j = i - 1; j >= 0; j--) { if (t[j].result === 'LOSS') c++; else break; }
        return c === depth;
      });
      return {
        depth: depth === 0 ? 'Свіжа голова' : `Після ${depth} збитк${depth === 1 ? 'у' : 'ів'}`,
        avg: bucket.length ? +(sum(bucket.map((x) => x.rr)) / bucket.length).toFixed(2) : 0,
        n: bucket.length,
      };
    });

    const emotionStats = EMOTIONS.map((e) => {
      const g = groupStats(t.filter((x) => x.emotion === e), () => e)[0];
      return g ? { ...g, emotion: e } : { key: e, emotion: e, trades: 0, net: 0, avg: 0, wr: 0, mistakes: 0, list: [] };
    });

    const followed = t.filter((x) => x.planFollowed);
    const broken = t.filter((x) => !x.planFollowed);

    const buckets = [
      { name: '≤ −1R', min: -99, max: -1, color: '#f87171' },
      { name: '−1…0R', min: -1, max: 0, color: '#f87171' },
      { name: '0R (BE)', min: 0, max: 0.001, color: 'var(--edge-text3, #7A7A85)' },
      { name: '0…1R', min: 0.001, max: 1, color: 'var(--edge-acc, #8b7bff)' },
      { name: '1…2R', min: 1, max: 2, color: 'var(--edge-acc, #8b7bff)' },
      { name: '2…3R', min: 2, max: 3, color: '#34d399' },
      { name: '> 3R', min: 3, max: 99, color: '#34d399' },
    ].map((b) => ({ ...b, value: t.filter((x) => x.rr > b.min && x.rr <= b.max).length }));

    const byDow = [1, 2, 3, 4, 5].map((d) => {
      const g = groupStats(t.filter((x) => x.dow === d), () => d)[0];
      return { day: DOW[d], avg: g ? g.avg : 0, net: g ? g.net : 0, wr: g ? g.wr : 0, trades: g ? g.trades : 0 };
    });

    const bySession = ['Asia', 'London', 'New York'].map((s) => {
      const g = groupStats(t.filter((x) => x.session === s), () => s)[0];
      return { session: s, net: g ? g.net : 0, wr: g ? g.wr : 0, trades: g ? g.trades : 0, avg: g ? g.avg : 0 };
    });

    /* Діапазон годин беремо з реальних входів, а не з фіксованих
       7:00–19:00. Азійська сесія починається до сьомої, і при жорстких
       межах ті угоди просто зникали з графіка — разом із висновком,
       що людина торгує вночі. Порожній масив краще за тринадцять
       нульових стовпців: розділ покаже, що часу ще немає. */
    const hours = [...new Set(t.map((x) => x.hour).filter((h) => typeof h === 'number'))];
    const byHour = hours.length
      ? Array.from(
        { length: Math.max(...hours) - Math.min(...hours) + 1 },
        (_, i) => Math.min(...hours) + i,
      ).map((h) => {
        const list = t.filter((x) => x.hour === h);
        return { hour: `${h}:00`, net: +sum(list.map((x) => x.rr)).toFixed(1), trades: list.length };
      })
      : [];

    const byAsset = groupStats(t, (x) => x.asset).sort((a, b) => b.net - a.net);
    /* Сетап журнал поки не запитує. Угоди без нього в розріз не
       потрапляють — інакше зʼявився б розділ «—» на весь список. */
    const bySetup = groupStats(t.filter((x) => x.setup), (x) => x.setup)
      .sort((a, b) => b.net - a.net);
    const byAccount = groupStats(t, (x) => x.account).sort((a, b) => b.net - a.net);

    /* Активи беремо з того, чим людина справді торгувала, а не зі
       списку в коді */
    const assetList = [...new Set(t.map((x) => x.asset))];
    const matrix = assetList.map((a) => {
      const l = groupStats(t.filter((x) => x.asset === a && x.side === 'LONG'), () => 'l')[0];
      const s = groupStats(t.filter((x) => x.asset === a && x.side === 'SHORT'), () => 's')[0];
      return { asset: a, l: l || null, s: s || null };
    });

    const byMonth = groupStats(t, (x) => x.date.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key));

    return {
      trades: t, wins, losses, be, gross, grossLoss, net, equity, maxDD,
      wr: wins.length + losses.length
        ? Math.round((wins.length / (wins.length + losses.length)) * 100)
        : 0,
      pf: grossLoss ? gross / grossLoss : gross,
      expectancy: n ? net / n : 0,
      avgWin: wins.length ? gross / wins.length : 0,
      avgLoss: losses.length ? -grossLoss / losses.length : 0,
      bestW, worstL, cleanStreak,
      tiltCost, mistakeLedger, emotionStats, chain,
      avgAfterLoss, avgAfterWin, revenge,
      followed, broken, buckets, byDow, bySession, byHour,
      byAsset, bySetup, byAccount, matrix, byMonth,
      mistakeRate: n ? Math.round((t.filter((x) => x.mistakes.length).length / n) * 100) : 0,
      adherence: n ? Math.round((followed.length / n) * 100) : 0,
      recovery: maxDD ? net / Math.abs(maxDD) : 0,
    };
  }, [trades]);
}
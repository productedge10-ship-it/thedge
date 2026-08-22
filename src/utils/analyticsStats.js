import { useMemo } from 'react';
import { TRADES, ASSETS, EMOTIONS, MISTAKES, DOW } from './tradingData';

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
      key,
      trades: list.length,
      net: +sum(list.map((t) => t.rr)).toFixed(1),
      avg: +(sum(list.map((t) => t.rr)) / list.length).toFixed(2),
      wr: decided ? Math.round((wins.length / decided) * 100) : 0,
      mistakes: sum(list.map((t) => t.mistakes.length)),
      list,
    };
  });
}

export function useStats() {
  return useMemo(() => {
    const t = TRADES;
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

    const tiltCost = sum(
      t.filter((x) => x.rr < 0 && (x.mistakes.length > 0 || x.emotion === 'tilt' || x.emotion === 'anxious'))
        .map((x) => x.rr)
    );

    const mistakeLedger = MISTAKES.map((m) => {
      const list = t.filter((x) => x.mistakes.includes(m));
      return {
        name: m,
        count: list.length,
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
    const revenge = afterLoss.filter((x) => x.holdMin < 60 && x.mistakes.length > 0).length;

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
      { name: '≤ −1R', min: -99, max: -1, color: '#e0455f' },
      { name: '−1…0R', min: -1, max: 0, color: '#f0546c' },
      { name: '0R (BE)', min: 0, max: 0.001, color: '#5b6b80' },
      { name: '0…1R', min: 0.001, max: 1, color: '#4c8df6' },
      { name: '1…2R', min: 1, max: 2, color: '#4c8df6' },
      { name: '2…3R', min: 2, max: 3, color: '#34d399' },
      { name: '> 3R', min: 3, max: 99, color: '#22c07f' },
    ].map((b) => ({ ...b, value: t.filter((x) => x.rr > b.min && x.rr <= b.max).length }));

    const byDow = [1, 2, 3, 4, 5].map((d) => {
      const g = groupStats(t.filter((x) => x.dow === d), () => d)[0];
      return { day: DOW[d], avg: g ? g.avg : 0, net: g ? g.net : 0, wr: g ? g.wr : 0, trades: g ? g.trades : 0 };
    });

    const bySession = ['Asia', 'London', 'New York'].map((s) => {
      const g = groupStats(t.filter((x) => x.session === s), () => s)[0];
      return { session: s, net: g ? g.net : 0, wr: g ? g.wr : 0, trades: g ? g.trades : 0, avg: g ? g.avg : 0 };
    });

    const byHour = Array.from({ length: 13 }, (_, i) => i + 7).map((h) => {
      const list = t.filter((x) => x.hour === h);
      return { hour: `${h}:00`, net: +sum(list.map((x) => x.rr)).toFixed(1), trades: list.length };
    });

    const byAsset = groupStats(t, (x) => x.asset).sort((a, b) => b.net - a.net);
    const bySetup = groupStats(t, (x) => x.setup).sort((a, b) => b.net - a.net);
    const byAccount = groupStats(t, (x) => x.account).sort((a, b) => b.net - a.net);

    const matrix = ASSETS.map((a) => {
      const l = groupStats(t.filter((x) => x.asset === a && x.side === 'LONG'), () => 'l')[0];
      const s = groupStats(t.filter((x) => x.asset === a && x.side === 'SHORT'), () => 's')[0];
      return { asset: a, l: l || null, s: s || null };
    });

    const byMonth = groupStats(t, (x) => x.date.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key));

    return {
      trades: t, wins, losses, be, gross, grossLoss, net, equity, maxDD,
      wr: Math.round((wins.length / (wins.length + losses.length)) * 100),
      pf: grossLoss ? gross / grossLoss : gross,
      expectancy: net / t.length,
      avgWin: gross / wins.length,
      avgLoss: -grossLoss / losses.length,
      bestW, worstL, cleanStreak,
      tiltCost, mistakeLedger, emotionStats, chain,
      avgAfterLoss, avgAfterWin, revenge,
      followed, broken, buckets, byDow, bySession, byHour,
      byAsset, bySetup, byAccount, matrix, byMonth,
      mistakeRate: Math.round((t.filter((x) => x.mistakes.length).length / t.length) * 100),
      adherence: Math.round((followed.length / t.length) * 100),
      recovery: maxDD ? net / Math.abs(maxDD) : 0,
    };
  }, []);
}
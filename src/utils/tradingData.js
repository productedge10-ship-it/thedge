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
export const EMOTION_COLOR = { calm: '#34d399', confident: '#4c8df6', anxious: '#d4a843', tilt: '#f0546c' };
export const MISTAKES = [
  'Вхід до підтвердження',
  'Наздогнав рух',
  'Пересунув стоп',
  'Завеликий обʼєм',
  'Торгував поза сесією',
  'Не зафіксував по плану',
];
export const DOW = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function buildTrades() {
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
        id: id++, date: d.toISOString().slice(0, 10), dow, hour,
        asset, side, session, account, setup, emotion, result, rr, mistakes,
        planFollowed: mistakes.length === 0, risk,
        holdMin: 12 + Math.floor(rnd() * 240), mae, mfe,
      });
    }
  }
  return out;
}

export const TRADES = buildTrades();
/* ==================================================================
   Монте-Карло: що буде з рахунком.

   Це калькулятор, а не звіт по журналу. Усі параметри задає людина:
   вінрейт, середній RR, ризик на угоду, межі пропа. Журнал потрібен
   тільки як зручність — кнопкою можна підставити свої реальні цифри,
   але працює воно й на порожньому акаунті, з першого дня.

   Так і має бути: питання «а що буде, якщо я торгуватиму з вінрейтом
   45% і RR 2 при ризику 1%» не потребує історії взагалі. Воно
   потребує арифметики, повтореної тисячу разів.

   Відповідь — не прогноз прибутку. Три речі, які насправді вирішують
   долю рахунку:

     • яка ймовірність дійти до цілі раніше, ніж до межі;
     • яка ймовірність злити — і на чому саме;
     • яка серія мінусів для таких параметрів нормальна.

   Останнє важить найбільше. Більшість зривів стається не тоді, коли
   система зламалась, а тоді, коли звичайна серія мінусів сприймається
   як поломка — і людина міняє правила посеред нормальної просадки.
================================================================== */

/* Свій генератор, щоб та сама сітка давала ту саму відповідь. Інакше
   людина двічі відкриває вкладку, бачить різні відсотки — і
   правильно перестає їм вірити. */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* Тисяча двісті, а не десять тисяч. Точність відсотка після тисячі
   прогонів міняється в межах похибки, а час рахунку росте лінійно —
   і на кожному русі повзунка це вже помітно рукою. */
export const DEFAULT_RUNS = 1200;

export const PRESET = {
  winRate: 45,     /* % виграшних */
  rr: 2,           /* середній RR виграшу */
  riskPct: 1,      /* ризик на угоду, % від депозиту */
  dailyPct: 5,     /* денний ліміт збитку, % */
  ddPct: 10,       /* максимальна просадка, % */
  targetPct: 8,    /* ціль етапу, % */
  perDay: 2,       /* угод на день — від цього залежить денний ліміт */
  horizon: 100,    /* скільки угод дивимось уперед */
};

/* ---------- підказка з журналу ----------
   Не обовʼязкова: якщо історії немає, калькулятор працює й так.
   Але коли вона є, підставити свої реальні цифри корисніше, ніж
   вигадувати їх з голови. */
export function fromTrades(trades) {
  const closed = (trades || []).filter((t) => t.result === 'WIN' || t.result === 'LOSS');
  if (closed.length < 10) return null;

  const wins = closed.filter((t) => t.result === 'WIN');
  const rr = wins.length
    ? wins.reduce((s, t) => s + Math.abs(Number(t.rr) || 0), 0) / wins.length
    : 0;

  const days = new Set(closed.map((t) => t.date).filter(Boolean));

  return {
    trades: closed.length,
    winRate: Math.round((wins.length / closed.length) * 100),
    rr: Math.round(rr * 10) / 10,
    perDay: days.size ? Math.max(1, Math.round(closed.length / days.size)) : 1,
  };
}

/* ---------- один прогін ----------

   Порядок перевірок відповідає реальності: спершу денний ліміт (його
   ловлять протягом дня), потім загальна просадка, і аж потім ціль —
   бо злити можна й на тій угоді, яка мала стати останньою до цілі. */
function runOnce(cfg, rnd, path) {
  const { winRate, rr, riskPct, dailyPct, ddPct, targetPct, perDay, horizon } = cfg;
  const p = winRate / 100;

  let equity = 0;          /* у відсотках від депозиту */
  let peak = 0;
  let dayStart = 0;
  let inDay = 0;

  let worstStreak = 0;
  let streak = 0;
  let maxDD = 0;

  const stop = (end, at) => {
    /* Після зупинки шлях не обривається, а завмирає. Інакше у віялі
       закінчені сценарії просто зникали б, і смуги ставали б тим
       оптимістичнішими, чим більше рахунків зливається — тобто
       графік брехав би рівно там, де має лякати. */
    if (path) for (let k = at; k < horizon; k += 1) path[k] = equity;
    return { end, at, worstStreak, maxDD, final: equity };
  };

  for (let i = 0; i < horizon; i += 1) {
    /* Мінус коштує рівно ризик — це і є визначення R. Виграш дає
       ризик, помножений на RR. */
    const win = rnd() < p;
    equity += win ? riskPct * rr : -riskPct;
    if (path) path[i] = equity;

    if (win) streak = 0;
    else { streak += 1; worstStreak = Math.max(worstStreak, streak); }

    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);

    if (dailyPct > 0 && dayStart - equity >= dailyPct) return stop('daily', i + 1);
    if (ddPct > 0 && -equity >= ddPct) return stop('drawdown', i + 1);
    if (targetPct > 0 && equity >= targetPct) return stop('target', i + 1);

    inDay += 1;
    if (inDay >= perDay) { inDay = 0; dayStart = equity; }
  }

  return { end: 'open', at: horizon, worstStreak, maxDD, final: equity };
}

/* ---------- симуляція ---------- */
export function simulate(input, runs = DEFAULT_RUNS, seed = 12345) {
  const cfg = {
    ...PRESET,
    ...input,
    perDay: Math.max(1, Math.round(input?.perDay ?? PRESET.perDay)),
    horizon: Math.max(10, Math.round(input?.horizon ?? PRESET.horizon)),
  };

  const rnd = rng(seed);
  const { horizon } = cfg;

  const ends = { target: 0, daily: 0, drawdown: 0, open: 0 };
  const streaks = [];
  const dds = [];
  const lens = [];
  const finals = [];

  /* Шляхи тримаємо в одному плоскому масиві: тисяча окремих масивів
     по сто чисел — це тисяча обʼєктів на кожен перерахунок, і збирач
     сміття це помітить. */
  const paths = new Float32Array(runs * horizon);
  const buf = new Float32Array(horizon);

  for (let k = 0; k < runs; k += 1) {
    const r = runOnce(cfg, rnd, buf);
    paths.set(buf, k * horizon);
    ends[r.end] += 1;
    streaks.push(r.worstStreak);
    dds.push(r.maxDD);
    finals.push(r.final);
    if (r.end === 'target') lens.push(r.at);
  }

  const pct = (n) => Math.round((n / runs) * 1000) / 10;
  const q = (arr, p) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  };

  /* ---------- віяло ----------
     Не сто ліній-спагеті, а смуги за процентилями. Спагеті виглядають
     ефектно й не читаються: з них неможливо сказати, де ти опинишся
     скоріш за все. Смуга «половина сценаріїв тут» відповідає на це
     одним поглядом. */
  const col = new Float64Array(runs);
  const band = [];
  for (let i = 0; i < horizon; i += 1) {
    for (let k = 0; k < runs; k += 1) col[k] = paths[k * horizon + i];
    const s = Array.from(col).sort((a, b) => a - b);
    const at = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
    band.push({
      i: i + 1,
      p05: +at(0.05).toFixed(2),
      p25: +at(0.25).toFixed(2),
      p50: +at(0.5).toFixed(2),
      p75: +at(0.75).toFixed(2),
      p95: +at(0.95).toFixed(2),
      /* recharts не вміє малювати діапазони, тому подаємо смугу як
         невидиму основу плюс товщину, складені стеком */
      lo: +at(0.05).toFixed(2),
      midBase: +at(0.25).toFixed(2),
      wideSpan: +(at(0.95) - at(0.05)).toFixed(2),
      midSpan: +(at(0.75) - at(0.25)).toFixed(2),
    });
  }

  /* ---------- розподіл результатів ---------- */
  const lo = Math.min(...finals);
  const hi = Math.max(...finals);
  const bins = 24;
  const step = (hi - lo) / bins || 1;
  const hist = Array.from({ length: bins }, (_, i) => ({
    x: +(lo + step * (i + 0.5)).toFixed(1),
    n: 0,
  }));
  finals.forEach((f) => {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((f - lo) / step)));
    hist[i].n += 1;
  });

  /* Матсподівання на угоду — те, з чого все випливає. Від'ємне
     означає, що жодні межі не врятують: питання тільки коли. */
  const edge = (cfg.winRate / 100) * cfg.rr - (1 - cfg.winRate / 100);

  return {
    runs,
    horizon,
    perDay: cfg.perDay,
    edge: Math.round(edge * 1000) / 1000,
    breakEvenWR: Math.round((100 / (cfg.rr + 1)) * 10) / 10,

    band,
    hist,

    target: pct(ends.target),
    daily: pct(ends.daily),
    drawdown: pct(ends.drawdown),
    open: pct(ends.open),
    /* Злив — це обидві межі разом: людині байдуже, на якій із них
       рахунок закрили. Розклад показуємо окремо. */
    bust: pct(ends.daily + ends.drawdown),

    /* Типова найгірша серія — медіана, а не максимум: максимум завжди
       страшний і трапляється раз на тисячу прогонів. */
    streakTypical: q(streaks, 0.5),
    streakBad: q(streaks, 0.95),

    ddTypical: Math.round(q(dds, 0.5) * 10) / 10,
    ddBad: Math.round(q(dds, 0.95) * 10) / 10,

    toTarget: lens.length ? q(lens, 0.5) : null,
  };
}

/* Коротка чесна фраза під цифрами. Без неї відсоток читається як
   передбачення, а це лише наслідок уведених припущень. */
export function verdict(s, cfg) {
  if (!s) return null;

  if (s.edge <= 0) {
    return {
      tone: 'bad',
      text: `З вінрейтом ${cfg.winRate}% і RR ${cfg.rr} кожна угода в середньому втрачає гроші: беззбитковий вінрейт тут ${s.breakEvenWR}%. Межі вже не мають значення — питання лише в тому, коли саме.`,
    };
  }
  if (s.bust >= 50) {
    return { tone: 'bad', text: 'Більш ніж у половині сценаріїв рахунок не доживає до цілі. Перевага є, але ризик на угоду завеликий для таких меж.' };
  }
  if (s.bust >= 25) {
    return { tone: 'warn', text: 'Кожен четвертий сценарій закінчується зливом. Найпростіше, що це виправляє, — менший ризик на угоду.' };
  }
  if (s.target >= 60) {
    return { tone: 'ok', text: 'Здебільшого рахунок доходить до цілі раніше, ніж до межі. Це не гарантія, але запас є.' };
  }
  return { tone: 'ok', text: 'Межі не тиснуть, але й ціль за горизонтом дістається не завжди — більшість сценаріїв просто триває далі.' };
}

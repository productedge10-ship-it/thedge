/* ==================================================================
   «Що якби» — скільки коштували власні звички.

   Береться реальна історія угод і з неї прибираються ті, що
   порушують обране правило. Далі дві криві поруч: як було і як було
   б без цих угод.

   Про формулювання — і це не дрібниця. Показуємо «скільки це тобі
   коштувало», а не «скільки б ти заробив». Друге було б прогнозом, а
   прогнозів ми тут не робимо свідомо: викидання угод з історії не
   доводить, що без них людина заробила б більше — можливо, замість
   відіграшу вона взяла б іншу угоду, теж мінусову.

   А от «угоди в тільті забрали 8.4R за три місяці» — не прогноз, це
   те, що вже сталося. І саме тому воно й переконує: заперечити факт
   про минуле неможливо.

   Друга річ, яку тут легко зробити погано, — дати нафільтрувати
   ідеальну криву з трьох угод. Тому кожен результат іде разом з
   розміром вибірки, на якій він побудований, і чесним попередженням,
   коли її замало.
================================================================== */

/* Правила описані даними, а не кодом: додати нове — це рядок у
   масиві, а не правка компонента. Кожне знає, як себе назвати в
   підсумку («без угод у тільті»), бо саме цей текст читає людина. */
export const RULES = [
  {
    id: 'revenge',
    label: 'Не відігруватись',
    hint: 'прибрати угоди, де було бажання відігратись',
    tag: 'угоди у відіграші',
    test: (t) => t.emotion === 'tilt',
  },
  {
    id: 'rushed',
    label: 'Не поспішати',
    hint: 'прибрати входи з поспіхом і FOMO',
    tag: 'поспішні входи',
    test: (t) => t.rushed,
  },
  {
    id: 'offplan',
    label: 'Тільки за планом',
    hint: 'прибрати все, що йшло повз план',
    tag: 'угоди поза планом',
    test: (t) => !t.planFollowed,
  },
  {
    id: 'mistake',
    label: 'Без помилок виконання',
    hint: 'прибрати угоди з позначеною помилкою',
    tag: 'угоди з помилкою',
    test: (t) => (t.mistakes || []).length > 0,
  },
  {
    id: 'anxious',
    label: 'Не входити зі страхом',
    hint: 'прибрати входи, де фіксувалась тривога',
    tag: 'входи зі страхом',
    test: (t) => t.emotion === 'anxious',
  },
];

/* Правила-фільтри по значенню: сесія, актив, сетап, день тижня.
   Вони не «прибрати погане», а «торгувати тільки ось це», тому й
   рахуються окремо: людина обирає, що лишити, а не що викинути. */
export const DIMS = [
  { id: 'session', label: 'Сесія', of: (t) => t.session },
  { id: 'asset', label: 'Актив', of: (t) => t.asset },
  { id: 'setup', label: 'Сетап', of: (t) => t.setup },
];

export const DOW = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const r2 = (n) => Math.round(n * 100) / 100;

/* R угоди для кривої. Мінус завжди коштує рівно ризик, тому у LOSS
   беремо −1, а не записане RR: у полі rr лежить потенціал угоди, і
   якщо взяти його зі знаком мінус, кожен зрив виглядав би вчетверо
   дорожчим, ніж він був. */
export const rOf = (t) => {
  if (t.result === 'BE') return 0;
  if (t.result === 'LOSS') return -1;
  return Math.abs(Number(t.rr) || 0);
};

/* Крива й просадка за один прохід */
export function curveOf(trades) {
  let acc = 0;
  let peak = 0;
  let maxDD = 0;
  const points = [];

  trades.forEach((t, i) => {
    acc += rOf(t);
    peak = Math.max(peak, acc);
    maxDD = Math.max(maxDD, peak - acc);
    points.push({ i: i + 1, date: t.date, r: r2(acc) });
  });

  return { points, net: r2(acc), maxDD: r2(maxDD) };
}

export function statsOf(trades) {
  const closed = trades.filter((t) => t.result === 'WIN' || t.result === 'LOSS');
  const wins = closed.filter((t) => t.result === 'WIN').length;
  const { points, net, maxDD } = curveOf(trades);

  return {
    points,
    net,
    maxDD,
    trades: trades.length,
    wr: closed.length ? Math.round((wins / closed.length) * 100) : 0,
  };
}

/* ---------- застосування набору правил ----------

   `on` — увімкнені правила-заборони, `keep` — обрані значення по
   вимірах ({ session: ['London'] } тощо). Порожній вимір означає «усі
   значення», а не «жодного»: інакше перший же клік по фільтру
   обнуляв би графік. */
export function apply(trades, on, keep) {
  const active = RULES.filter((r) => on.includes(r.id));

  const removed = [];
  const kept = trades.filter((t) => {
    const brokeRule = active.find((r) => r.test(t));
    if (brokeRule) { removed.push({ t, why: brokeRule }); return false; }

    const outside = DIMS.find((d) => {
      const picked = keep?.[d.id];
      if (!picked || !picked.length) return false;
      return !picked.includes(d.of(t));
    });
    if (outside) { removed.push({ t, why: { id: outside.id, tag: `інші ${outside.label.toLowerCase()}` } }); return false; }

    return true;
  });

  return { kept, removed };
}

/* Розклад втрат по правилах — саме він дає фразу «це коштувало тобі
   стільки-то». Рахуємо по кожному правилу окремо, тому сума часток
   може не збігатись із загальною різницею: одна угода буває і в
   тільті, і поза планом. Про це чесно пишемо в інтерфейсі. */
export function breakdown(trades, on) {
  return RULES
    .filter((r) => on.includes(r.id))
    .map((r) => {
      const hit = trades.filter(r.test);
      const cost = r2(hit.reduce((s, t) => s + rOf(t), 0));
      return { id: r.id, label: r.label, tag: r.tag, count: hit.length, cost };
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => a.cost - b.cost);
}

/* ---------- надійність висновку ----------

   Симулятор дуже спокушає нафільтрувати красиву криву з трьох угод.
   Тому кожен результат супроводжується оцінкою: на скількох угодах
   він побудований і чи можна з цього робити правило.

   Пороги грубі навмисно. Точне число тут не важливе — важливо, щоб
   людина побачила різницю між «є закономірність» і «є збіг». */
export function confidence(removedCount, keptCount) {
  if (removedCount === 0) {
    return { level: 'none', text: 'Це правило не прибрало жодної угоди — у твоїй історії його вже дотримано.' };
  }
  if (removedCount < 5) {
    return {
      level: 'low',
      text: `Всього ${removedCount} ${removedCount === 1 ? 'угода' : 'угоди'} — це надто мало для висновку. Цифра нижче показує, що сталось, але правилом це ще не робить.`,
    };
  }
  if (removedCount < 15) {
    return {
      level: 'mid',
      text: `${removedCount} угод — уже помітно, але ще в межах випадковості. Подивись знову, коли їх стане більше.`,
    };
  }
  if (keptCount < 20) {
    return {
      level: 'mid',
      text: `Після фільтра лишилось ${keptCount} угод — замало, щоб довіряти кривій. Пом'якшуй умови або чекай на історію.`,
    };
  }
  return {
    level: 'high',
    text: `${removedCount} угод — вибірка достатня, щоб говорити про звичку, а не про збіг.`,
  };
}

/* Значення виміру, які реально є в історії. Список з коду тут не
   годиться: він показував би сесії й активи, якими людина не
   торгувала. */
export function valuesOf(trades, dim) {
  const d = DIMS.find((x) => x.id === dim);
  if (!d) return [];
  return [...new Set(trades.map(d.of).filter(Boolean))].sort();
}

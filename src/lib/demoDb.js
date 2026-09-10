/* ==================================================================
   Пісочниця: підроблений клієнт бази для демо-режиму.

   Навіщо саме так. Демо мусить показувати справжні сторінки —
   ті самі кнопки, ті самі модалки, ту саму поведінку. Переписувати
   сторінки під «демо-версію» означало б тримати другий застосунок,
   який роз'їдеться з першим за тиждень.

   Тому підмінюється не інтерфейс, а найнижчий шар: клієнт бази.
   Сторінки не знають, що вони в демо — вони роблять ті самі запити,
   просто відповідає на них localStorage, а не Supabase.

   Правило безпеки: підміна вмикається виключно на шляху /demo.
   Справжній застосунок туди не заходить ніколи, тож переплутати
   демо-дані з чужими угодами неможливо.
================================================================== */

/* Версія в ключі — щоб зміна насіння підхопилась у всіх, хто вже
   відкривав демо: старий кеш під іншим ключем просто ігнорується. */
const KEY = 'edge.demo.db.v5';

export const DEMO_USER_ID = 'demo-user-0000-0000-000000000001';

export const isDemo = () => typeof window !== 'undefined'
  && window.location.pathname.startsWith('/demo');

const today = (shift = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + shift);
  return d.toISOString().slice(0, 10);
};

const iso = (shiftDays = 0, hh = 12, mm = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + shiftDays);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};

const uid = () => (globalThis.crypto?.randomUUID
  ? crypto.randomUUID()
  : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

/* ---------- насіння ----------

   Дані підібрані так, щоб сторінки мали що показати з першої
   секунди: у журналі є і прибуткові, і збиткові угоди, серед них
   дві взяті повз план — саме на них тримається половина висновків
   аналітики й розділу помилок. */
const seed = () => ({
  /* Журнал планів для розділу «Аналізи»: кожен план — гіпотеза
     напряму на день, і поруч видно, чи ринок її підтвердив. Схема
     справжня (date / pair / narrative / plan_data), щоб сторінка
     аналізів і денний план читали ті самі поля. Набір навмисно
     різний: є влучні, є мимо, дві з помилкою в розборі, один
     вихідний — рівно те, з чого складається зведення зверху. */
  trading_plans: [
    {
      id: uid(), user_id: DEMO_USER_ID, date: today(-2), pair: 'XAUUSD',
      narrative: 'Bullish', is_public: false,
      plan_data: {
        date: today(-2), pair: 'XAUUSD', narrative: 'Bullish',
        actualNarrative: 'Bullish',
        planText: 'Лондон. Тренд вгору, чекаю відкат до 4h OB і вхід після зняття лоу азії з FVG на 1m. Стоп за OB, ціль — попередній хай.',
        sessionRating: 4, analysisMistake: false, analysisMistakeText: '',
        conclusionsText: 'Дочекався умови, зайшов з першого тесту. Тримати руки далі від графіка після входу.',
        updates: [
          { id: 1, text: 'Зняли лоу азії рівно на відкритті Лондона, чекаю реакцію.' },
          { id: 2, text: 'FVG сформувалась, вхід за планом.' },
        ],
        tdaBlocks: [], reviewBlocks: [],
      },
      created_at: iso(-2, 8, 40), updated_at: iso(-2, 18, 10),
    },
    {
      id: uid(), user_id: DEMO_USER_ID, date: today(-4), pair: 'GER40',
      narrative: 'Bearish', is_public: false,
      plan_data: {
        date: today(-4), pair: 'GER40', narrative: 'Bearish',
        actualNarrative: 'Bearish',
        planText: 'Judas swing на відкритті Франкфурта: чекаю фальшивий вихід угору й розворот вниз під час першої години.',
        sessionRating: 5, analysisMistake: false, analysisMistakeText: '',
        conclusionsText: 'Найкраще виконання за тиждень — план описав рух майже дослівно.',
        updates: [
          { id: 1, text: 'Фальшивий вихід угору, шорт від рівня.' },
        ],
        tdaBlocks: [], reviewBlocks: [],
      },
      created_at: iso(-4, 8, 20), updated_at: iso(-4, 17, 0),
    },
    {
      id: uid(), user_id: DEMO_USER_ID, date: today(-6), pair: 'EURUSD',
      narrative: 'Bullish', is_public: false,
      plan_data: {
        date: today(-6), pair: 'EURUSD', narrative: 'Bullish',
        actualNarrative: 'Bearish',
        planText: 'Чекаю продовження вгору після пробою. Умови входу так і не зʼявились.',
        sessionRating: 2, analysisMistake: true,
        analysisMistakeText: 'Зайшов без сетапу від нудьги, коли ринок стояв. Пробою не було, я вигадав рух.',
        conclusionsText: 'Немає умови — немає угоди. Закривати термінал, а не шукати вхід силою.',
        updates: [],
        tdaBlocks: [], reviewBlocks: [],
      },
      created_at: iso(-6, 9, 0), updated_at: iso(-6, 16, 30),
    },
    {
      id: uid(), user_id: DEMO_USER_ID, date: today(-9), pair: 'NAS100',
      narrative: 'Neutral', is_public: false,
      plan_data: {
        date: today(-9), pair: 'NAS100', narrative: 'Neutral',
        actualNarrative: 'Neutral',
        planText: 'День даних: до виходу цифри сиджу в стороні, торгую тільки чітку реакцію на рівні.',
        sessionRating: 3, analysisMistake: false, analysisMistakeText: '',
        conclusionsText: 'Пропустив дві сумнівні угоди — це теж результат.',
        updates: [
          { id: 1, text: 'Дані вийшли по консенсусу, реакція слабка.' },
          { id: 2, text: 'Діапазон тримається, залишаюсь поза ринком.' },
          { id: 3, text: 'Закрив день без угод, як і планував.' },
        ],
        tdaBlocks: [], reviewBlocks: [],
      },
      created_at: iso(-9, 8, 45), updated_at: iso(-9, 20, 0),
    },
    {
      id: uid(), user_id: DEMO_USER_ID, date: today(-16), pair: 'BTCUSD',
      narrative: 'Bearish', is_public: false,
      plan_data: {
        date: today(-16), pair: 'BTCUSD', narrative: 'Bearish',
        actualNarrative: 'Bullish',
        planText: 'Чекаю злив під діапазон вихідних. Замість цього ринок викупив і пішов угору.',
        sessionRating: 2, analysisMistake: true,
        analysisMistakeText: 'Тримав шорт проти імпульсу занадто довго, переніс стоп. Ризик вийшов 2R замість 1R.',
        conclusionsText: 'Стоп — це стоп. Не рухати його руками, коли рух іде проти.',
        updates: [
          { id: 1, text: 'Пробили діапазон угору, ідея не спрацювала.' },
        ],
        tdaBlocks: [], reviewBlocks: [],
      },
      created_at: iso(-16, 9, 30), updated_at: iso(-16, 15, 0),
    },
    {
      id: uid(), user_id: DEMO_USER_ID, date: today(-24), pair: 'US100',
      narrative: 'Bullish', is_public: false,
      plan_data: {
        date: today(-24), pair: 'US100', narrative: 'Bullish',
        actualNarrative: 'Bullish',
        planText: 'Свіп лоу + FVG на відкритті Лондона, ціль по 3R на попередній хай.',
        sessionRating: 4, analysisMistake: false, analysisMistakeText: '',
        conclusionsText: 'Взяв 2R, закрив рано перед новиною — норм рішення.',
        updates: [
          { id: 1, text: 'Свіп відбувся, вхід від FVG.' },
          { id: 2, text: 'Перед виходом даних зафіксував частину.' },
        ],
        tdaBlocks: [], reviewBlocks: [],
      },
      created_at: iso(-24, 8, 30), updated_at: iso(-24, 14, 20),
    },
    {
      id: uid(), user_id: DEMO_USER_ID, date: today(-33), pair: 'XAUUSD',
      narrative: 'Day off', is_public: false,
      plan_data: {
        date: today(-33), pair: 'XAUUSD', narrative: 'Day off',
        actualNarrative: '',
        planText: 'Банківський вихідний у США, ліквідності немає. Не торгую.',
        sessionRating: 0, analysisMistake: false, analysisMistakeText: '',
        conclusionsText: '', updates: [],
        tdaBlocks: [], reviewBlocks: [],
      },
      created_at: iso(-33, 9, 0), updated_at: iso(-33, 9, 0),
    },
  ],

  /* Схема угоди — справжня, з analyticsStore: plan_date, plan_pair,
     result, rr, session, setup і психологічні прапорці. Вигадати
     «схожі» назви полів не можна: журнал і аналітика читають саме
     ці, і будь-яке розходження дало б порожні графіки. */
  trades: [
    { pair: 'XAUUSD', setup: 'Свінг + FVG', rr: 2.4, res: 'Win', ses: 'Лондон', plan: true, mood: {}, d: -1, h: 10 },
    { pair: 'GER40', setup: 'Judas swing', rr: 1.8, res: 'Win', ses: 'Франкфурт', plan: true, mood: {}, d: -1, h: 11 },
    { pair: 'EURUSD', setup: 'Без сетапу', rr: -1, res: 'Lose', ses: 'Нью-Йорк', plan: false, mood: { psy_repeat: true }, d: -2, h: 13 },
    { pair: 'XAUUSD', setup: 'Сплеск на новині', rr: -1, res: 'Lose', ses: 'Нью-Йорк', plan: false, mood: { psy_fear: true }, d: -2, h: 15 },
    { pair: 'NAS100', setup: 'Ретест OB', rr: 1.6, res: 'Win', ses: 'Нью-Йорк', plan: true, mood: { psy_confident: true }, d: -3, h: 16 },
    { pair: 'BTCUSD', setup: 'Азійський діапазон', rr: 2.2, res: 'Win', ses: 'Азія', plan: true, mood: {}, d: -4, h: 9 },
    { pair: 'US100', setup: 'Свіп лоу + FVG', rr: 1.9, res: 'Win', ses: 'Лондон', plan: true, mood: {}, d: -5, h: 14 },
    { pair: 'EURUSD', setup: 'Подвоїв обсяг', rr: -1.4, res: 'Lose', ses: 'Нью-Йорк', plan: false, mood: { psy_revenge: true }, d: -6, h: 16 },
    { pair: 'XAUUSD', setup: 'Свінг + FVG', rr: 3.1, res: 'Win', ses: 'Лондон', plan: true, mood: {}, d: -7, h: 10 },
    { pair: 'GER40', setup: 'Ретест OB', rr: -1, res: 'Lose', ses: 'Франкфурт', plan: true, mood: {}, d: -8, h: 11 },
  ].map((t) => ({
    id: uid(), user_id: DEMO_USER_ID,
    plan_date: today(t.d), plan_pair: t.pair, account_name: 'Основний',
    type: t.rr >= 0 ? 'Long' : 'Short',
    result: t.res, rr: t.rr, risk: 1, session: t.ses, setup: t.setup,
    entry_time: `${String(t.h).padStart(2, '0')}:15`, exit_time: `${String(t.h).padStart(2, '0')}:48`,
    followed_plan: t.plan, rushed: !t.plan, has_mistake: !t.plan,
    mistake_category: t.plan ? null : 'Вхід без умов',
    trade_description: t.plan
      ? 'Вхід за планом: ціна зняла ліквідність і закрилась над FVG.'
      : 'Зайшов навздогін руху, плану на цю пару не було.',
    psy_confident: !!t.mood.psy_confident, psy_fear: !!t.mood.psy_fear,
    psy_repeat: !!t.mood.psy_repeat, psy_revenge: !!t.mood.psy_revenge,
    created_at: iso(t.d, t.h, 50), updated_at: iso(t.d, t.h, 50),
  })),

  trade_errors: [
    {
      id: uid(), user_id: DEMO_USER_ID, pair: 'XAUUSD',
      description: 'Подвоїв обсяг після двох стопів поспіль. Стоп поставив за структурою, але ризик вийшов 2.4R замість звичного 1R. Наступного разу: обʼєм рахую до входу, а не після того, як побачив рух.',
      cats: ['risk', 'tilt'], tv_link: '', reasons: ['q-risk', 'big-size'],
      followed_plan: false, rushed: true, by_system: false, risk_ok: false,
      error_date: today(-2), trade_id: null, source: 'manual', resolved: false,
      shots: [], created_at: iso(-2, 19, 0), updated_at: iso(-2, 19, 0),
    },
    {
      id: uid(), user_id: DEMO_USER_ID, pair: 'EURUSD',
      description: 'Зайшов без сетапу від нудьги. Ринок стояв, я вигадав рух.',
      cats: ['fomo'], tv_link: '', reasons: ['no-setup'],
      followed_plan: false, rushed: true, by_system: false, risk_ok: true,
      error_date: today(-6), trade_id: null, source: 'manual', resolved: true,
      shots: [], created_at: iso(-6, 20, 0), updated_at: iso(-6, 20, 0),
    },
  ],

  /* Колонка називається саме `name`: застосунок читає її напряму,
     і «схоже за змістом» поле symbol давало падіння в модалці угоди. */
  user_assets: [
    { id: uid(), user_id: DEMO_USER_ID, name: 'XAUUSD', created_at: iso(-30) },
    { id: uid(), user_id: DEMO_USER_ID, name: 'EURUSD', created_at: iso(-30) },
    { id: uid(), user_id: DEMO_USER_ID, name: 'GER40', created_at: iso(-30) },
    { id: uid(), user_id: DEMO_USER_ID, name: 'NAS100', created_at: iso(-30) },
    { id: uid(), user_id: DEMO_USER_ID, name: 'BTCUSD', created_at: iso(-30) },
  ],

  notes: [
    {
      id: uid(), user_id: DEMO_USER_ID, title: 'Правила входу',
      body: '• Чекаю закриття свічки\n• Ризик 1% на угоду\n• Після двох мінусів — стоп на день',
      folder_id: null, pinned: true, archived: false, card: {},
      created_at: iso(-9), updated_at: iso(-9),
    },
  ],

  note_folders: [],
  /* Проп-рахунок із історією: сторінка «Accounts» без нього
     показує порожній стан, а саме він пояснює, навіщо вона є. */
  prop_accounts: [
    {
      id: 'demo-acc-1', user_id: DEMO_USER_ID, firm_name: 'FTMO · 100K',
      balance: 104820, initial_balance: 100000, status: 'Active',
      daily_dd: 5, total_dd: 10, profit_target: 10,
      created_at: iso(-38), updated_at: iso(-1),
    },
    {
      id: 'demo-acc-2', user_id: DEMO_USER_ID, firm_name: 'Особистий',
      balance: 6420, initial_balance: 5000, status: 'Active',
      daily_dd: null, total_dd: null, profit_target: null,
      created_at: iso(-90), updated_at: iso(-2),
    },
  ],

  account_events: [
    { id: uid(), user_id: DEMO_USER_ID, account_id: 'demo-acc-1', kind: 'start', amount: 100000, balance_after: 100000, note: '', happened_at: today(-38), created_at: iso(-38) },
    { id: uid(), user_id: DEMO_USER_ID, account_id: 'demo-acc-1', kind: 'trade', amount: 3200, balance_after: 103200, note: 'Тиждень за планом', happened_at: today(-20), created_at: iso(-20) },
    { id: uid(), user_id: DEMO_USER_ID, account_id: 'demo-acc-1', kind: 'payout', amount: 1400, balance_after: 104820, note: 'Перша виплата', happened_at: today(-6), created_at: iso(-6) },
    { id: uid(), user_id: DEMO_USER_ID, account_id: 'demo-acc-2', kind: 'start', amount: 5000, balance_after: 5000, note: '', happened_at: today(-90), created_at: iso(-90) },
  ],
  backtest_sessions: [],
  backtest_trades: [],
  trader_reviews: [],
  user_sessions: [],
  /* Анкету «про тебе» позначаємо пройденою: у демо вона відкривалась
     першою й закривала собою весь застосунок. */
  user_state: [{
    id: uid(), user_id: DEMO_USER_ID, key: 'onboarding',
    data: { status: 'done', answers: {}, at: iso(-40) },
    created_at: iso(-40), updated_at: iso(-40),
  }],
  instruments: [],

  /* Профіль із підтвердженою поштою: інакше застосунок одразу
     показує вікно «підтвердь email», і замість продукту людина в
     демо бачить прохання перевірити скриньку. */
  profiles: [{
    id: DEMO_USER_ID, user_id: DEMO_USER_ID,
    email: 'demo@edgejournal.app', email_verified: true,
    verified_at: iso(-40), name: 'Демо-трейдер',
  }],
});

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* приватний режим */ }
  const fresh = seed();
  write(fresh);
  return fresh;
};

const write = (db) => {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* нічого */ }
};

export const resetDemoDb = () => {
  try { localStorage.removeItem(KEY); } catch { /* нічого */ }
};

/* ---------- будівник запитів ----------

   Повторює рівно ту частину API Supabase, якою користується
   застосунок: фільтри, сортування, зрізи й чотири дії. Усе інше
   свідомо відсутнє — краще впасти на незнайомому методі під час
   розробки, ніж тихо повернути неправильні дані. */
class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.rangeV = null;
    this.action = 'select';
    this.payload = null;
    this.one = false;
    this.maybe = false;
  }

  select() { return this; }
  insert(rows) { this.action = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  update(patch) { this.action = 'update'; this.payload = patch; return this; }
  upsert(rows) { this.action = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  delete() { this.action = 'delete'; return this; }

  eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
  neq(col, val) { this.filters.push((r) => r[col] !== val); return this; }
  is(col, val) { this.filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return this; }
  in(col, list) { this.filters.push((r) => list.includes(r[col])); return this; }
  gte(col, val) { this.filters.push((r) => r[col] >= val); return this; }
  lte(col, val) { this.filters.push((r) => r[col] <= val); return this; }
  gt(col, val) { this.filters.push((r) => r[col] > val); return this; }
  lt(col, val) { this.filters.push((r) => r[col] < val); return this; }
  ilike(col, pat) {
    const re = new RegExp(String(pat).replace(/%/g, '.*'), 'i');
    this.filters.push((r) => re.test(String(r[col] ?? '')));
    return this;
  }
  /* `.not(col, 'is', null)` та подібні: застосунок ними користується
     нечасто, але падати на незнайомому фільтрі демо не має права. */
  not(col, op, val) {
    if (op === 'is' && val === null) this.filters.push((r) => r[col] != null);
    else if (op === 'eq') this.filters.push((r) => r[col] !== val);
    else if (op === 'in') this.filters.push((r) => !val.includes(r[col]));
    return this;
  }

  or(expr) {
    /* Формат Supabase: "a.eq.1,b.eq.2". Розбираємо найпростіший
       випадок — рівність або is null через кому. */
    const parts = String(expr).split(',').map((x) => x.trim()).filter(Boolean);
    const tests = parts.map((p) => {
      const [col, op, raw] = p.split('.');
      const val = raw === 'null' ? null : raw;
      if (op === 'is') return (r) => (val === null ? r[col] == null : r[col] === val);
      if (op === 'neq') return (r) => String(r[col]) !== val;
      return (r) => String(r[col]) === val;
    });
    if (tests.length) this.filters.push((r) => tests.some((t) => t(r)));
    return this;
  }

  contains(col, val) {
    const want = Array.isArray(val) ? val : [val];
    this.filters.push((r) => Array.isArray(r[col]) && want.every((v) => r[col].includes(v)));
    return this;
  }

  match(obj) {
    Object.entries(obj || {}).forEach(([k, v]) => this.filters.push((r) => r[k] === v));
    return this;
  }

  order(col, opts = {}) { this.orders.push({ col, asc: opts.ascending !== false }); return this; }
  limit(n) { this.limitN = n; return this; }
  range(a, b) { this.rangeV = [a, b]; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; this.maybe = true; return this; }

  run() {
    const db = read();

    /* Профіль у демо завжди підтверджений і не залежить від того, що
       лежить у сховищі: інакше перша ж дія впирається у вікно
       «підтвердь пошту», якого в пісочниці не існує. */
    if (this.table === 'profiles') {
      const row = { id: DEMO_USER_ID, user_id: DEMO_USER_ID, email: 'demo@edgejournal.app', email_verified: true, verified_at: iso(-40) };
      if (this.action !== 'select') return { data: this.one ? row : [row], error: null };
      return { data: this.one ? row : [row], error: null };
    }

    const rows = db[this.table] || (db[this.table] = []);
    const match = (r) => this.filters.every((f) => f(r));

    if (this.action === 'insert' || this.action === 'upsert') {
      const stamped = this.payload.map((r) => ({
        id: r.id || uid(),
        user_id: r.user_id || DEMO_USER_ID,
        created_at: r.created_at || new Date().toISOString(),
        ...r,
      }));

      stamped.forEach((row) => {
        const i = rows.findIndex((x) => x.id === row.id);
        if (i >= 0 && this.action === 'upsert') rows[i] = { ...rows[i], ...row };
        else if (i < 0) rows.unshift(row);
      });

      write(db);
      return { data: this.one ? stamped[0] : stamped, error: null };
    }

    if (this.action === 'update') {
      const touched = [];
      rows.forEach((r, i) => {
        if (!match(r)) return;
        rows[i] = { ...r, ...this.payload, updated_at: new Date().toISOString() };
        touched.push(rows[i]);
      });
      write(db);
      return { data: this.one ? touched[0] ?? null : touched, error: null };
    }

    if (this.action === 'delete') {
      const keep = rows.filter((r) => !match(r));
      db[this.table] = keep;
      write(db);
      return { data: null, error: null };
    }

    let out = rows.filter(match);

    this.orders.forEach(({ col, asc }) => {
      out = [...out].sort((a, b) => {
        const x = a[col]; const y = b[col];
        if (x === y) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x > y ? 1 : -1) * (asc ? 1 : -1);
      });
    });

    if (this.rangeV) out = out.slice(this.rangeV[0], this.rangeV[1] + 1);
    if (this.limitN != null) out = out.slice(0, this.limitN);

    if (this.one) {
      const row = out[0] ?? null;
      if (!row && !this.maybe) return { data: null, error: { message: 'Рядок не знайдено', code: 'PGRST116' } };
      return { data: row, error: null };
    }

    return { data: out, error: null };
  }

  /* Робимо об'єкт «очікуваним»: застосунок пише await на ланцюжку,
     а не викликає .run() — саме так поводиться справжній клієнт. */
  then(resolve, reject) {
    try { return Promise.resolve(this.run()).then(resolve, reject); } catch (e) {
      return Promise.resolve({ data: null, error: e }).then(resolve, reject);
    }
  }
}

const DEMO_SESSION = {
  user: {
    id: DEMO_USER_ID,
    email: 'demo@edgejournal.app',
    email_confirmed_at: iso(-40),
    confirmed_at: iso(-40),
    user_metadata: { name: 'Демо-трейдер', full_name: 'Демо-трейдер' },
    created_at: iso(-40),
  },
  access_token: 'demo',
};

/* Будь-який метод, якого тут немає, не валить застосунок: він просто
   нічого не робить і пише попередження в консоль. У пісочниці білий
   екран гірший за трохи неточну вибірку. */
const forgiving = (q) => new Proxy(q, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (typeof prop === 'string' && !prop.startsWith('_')) {
      return (...args) => {
        // eslint-disable-next-line no-console
        console.warn(`[demo] метод .${prop}() не реалізовано`, args);
        return forgiving(target);
      };
    }
    return undefined;
  },
});

export const demoClient = {
  from: (table) => forgiving(new Query(table)),

  auth: {
    getSession: async () => ({ data: { session: DEMO_SESSION }, error: null }),
    getUser: async () => ({ data: { user: DEMO_SESSION.user }, error: null }),
    onAuthStateChange: (cb) => {
      /* Викликаємо асинхронно: справжній клієнт теж не смикає
         підписника всередині виклику, і код розраховує саме на це. */
      setTimeout(() => cb('SIGNED_IN', DEMO_SESSION), 0);
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    signOut: async () => {
      resetDemoDb();
      if (typeof window !== 'undefined') window.location.href = '/';
      return { error: null };
    },
    updateUser: async () => ({ data: { user: DEMO_SESSION.user }, error: null }),
    signInWithPassword: async () => ({ data: { session: DEMO_SESSION }, error: null }),
    signUp: async () => ({ data: { session: DEMO_SESSION }, error: null }),
    signInWithOtp: async () => ({ data: {}, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    resend: async () => ({ data: {}, error: null }),
  },

  /* Сховище картинок у демо не працює — і не має: завантаження
     файлів у пісочниці лише збирало б сміття. Повертаємо чесну
     помилку, застосунок її показує. */
  storage: {
    from: () => ({
      upload: async () => ({ data: null, error: { message: 'У демо-режимі файли не завантажуються' } }),
      remove: async () => ({ data: null, error: null }),
      getPublicUrl: (path) => ({ data: { publicUrl: path } }),
    }),
  },

  functions: {
    invoke: async () => ({ data: null, error: { message: 'Недоступно в демо' } }),
  },

  channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
  removeChannel: () => {},
};

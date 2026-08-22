/* ==================================================================
   Демо-бектести.
   Показуються, поки в базі порожньо (або поки немає звʼязку), щоб
   сторінка не зустрічала порожнім екраном і було видно, як воно
   виглядає з даними. Живуть у памʼяті: додавати угоди в демо можна,
   але після перезавантаження все повернеться до початкового.
================================================================== */

export const DEMO_PREFIX = 'demo-';
export const isDemo = (id) => String(id || '').startsWith(DEMO_PREFIX);

const day = (n) => {
  const d = new Date('2026-06-01T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const mk = (i, type, result, rr, quality, session, tags, notes) => ({
  id: `${DEMO_PREFIX}t${i}`,
  date: day(i * 2),
  type, result, rr,
  entry_price: null, stop_loss: null, take_profit: null,
  notes, screenshot_url: null,
  followed_plan: result !== 'LOSS' || i % 3 !== 0,
  rushed: i % 5 === 0,
  has_mistake: i % 4 === 0,
  mistake_description: i % 4 === 0 ? 'Зайшов до підтвердження на LTF.' : '',
  tda_data: { session, quality, tags },
  created_at: day(i * 2),
});

export const DEMO_SESSIONS = [
  {
    id: `${DEMO_PREFIX}sb`,
    name: 'Silver Bullet · London',
    pair: 'EURUSD',
    strategy_name: 'Silver Bullet',
    initial_balance: 10000,
    created_at: '2026-06-01',
    demo: true,
    trades: [
      mk(0,  'LONG',  'WIN',  2,   'A',  'London',   ['Silver Bullet'], 'Вхід на 15m FVG після зняття азійського максимуму.'),
      mk(1,  'SHORT', 'LOSS', 1,   'B',  'London',   ['SFP'], 'Поспішив, не дочекався підтвердження.'),
      mk(2,  'LONG',  'WIN',  2.5, 'A+', 'London',   ['Silver Bullet'], 'Чистий рух після маніпуляції під сесійний low.'),
      mk(3,  'LONG',  'WIN',  1.8, 'A',  'New York', ['Manipulation'], 'Kill-zone, ідеальний вхід.'),
      mk(4,  'SHORT', 'BE',   1,   'B',  'London',   ['SFP'], 'Вийшов у беззбиток після затягування.'),
      mk(5,  'SHORT', 'WIN',  3.2, 'A+', 'New York', ['Silver Bullet'], 'Найкраща угода серії, тримав до денного таргету.'),
      mk(6,  'LONG',  'LOSS', 1,   'C',  'Asia',     ['FOMO'], 'Азія — не моя сесія, ліз від нудьги.'),
      mk(7,  'LONG',  'WIN',  2.1, 'A',  'London',   ['Manipulation'], 'Ретест OB після BOS.'),
      mk(8,  'SHORT', 'LOSS', 1,   'B',  'New York', ['Impatience'], 'Другий вхід поспіль після стопу.'),
      mk(9,  'LONG',  'WIN',  2.6, 'A',  'London',   ['Silver Bullet'], 'За планом від і до.'),
      mk(10, 'SHORT', 'WIN',  1.4, 'B',  'London',   ['SFP'], 'Забрав швидко, бо наближались новини.'),
      mk(11, 'LONG',  'LOSS', 1,   'C',  'New York', ['FOMO'], 'Здогнав рух, який уже пішов без мене.'),
    ],
  },
  {
    id: `${DEMO_PREFIX}sfp`,
    name: 'SFP на золоті',
    pair: 'XAUUSD',
    strategy_name: 'SFP',
    initial_balance: 5000,
    created_at: '2026-05-12',
    demo: true,
    trades: [
      mk(0, 'SHORT', 'WIN',  1.9, 'A',  'London',   ['SFP'], 'Свіп хаю попереднього дня.'),
      mk(1, 'SHORT', 'WIN',  2.2, 'A',  'New York', ['SFP'], 'Реакція на CPI, вхід після першого імпульсу.'),
      mk(2, 'LONG',  'LOSS', 1,   'B',  'London',   ['Manipulation'], 'Структура була брудна, все одно поліз.'),
      mk(3, 'SHORT', 'WIN',  1.5, 'A+', 'London',   ['SFP'], 'Ідеальний свіп під азійський лоу.'),
      mk(4, 'LONG',  'LOSS', 1,   'C',  'Asia',     ['Impatience'], 'Нічний вхід — знову мінус.'),
      mk(5, 'SHORT', 'BE',   1,   'B',  'New York', ['SFP'], 'Закрив руками, злякався відкату.'),
    ],
  },
];

/* Проста памʼять на час сесії — щоб демо було живим, а не картинкою */
const runtime = new Map();

export function getDemoSession(id) {
  if (!runtime.has(id)) {
    const base = DEMO_SESSIONS.find((s) => s.id === id);
    if (!base) return null;
    runtime.set(id, { ...base, trades: [...base.trades] });
  }
  return runtime.get(id);
}

export function addDemoTrade(id, trade) {
  const s = getDemoSession(id);
  if (!s) return null;
  const next = { ...trade, id: `${DEMO_PREFIX}t${Date.now()}` };
  s.trades = [...s.trades, next];
  return next;
}

export function updateDemoTrade(id, tradeId, patch) {
  const s = getDemoSession(id);
  if (!s) return;
  s.trades = s.trades.map((t) => (t.id === tradeId ? { ...t, ...patch } : t));
}

export function deleteDemoTrade(id, tradeId) {
  const s = getDemoSession(id);
  if (!s) return;
  s.trades = s.trades.filter((t) => t.id !== tradeId);
}

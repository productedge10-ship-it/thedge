/* ==================================================================
   Демо-бектести.
   Показуються, поки в базі порожньо (або поки немає звʼязку), щоб
   сторінка не зустрічала порожнім екраном і було видно, як воно
   виглядає з даними. Живуть у памʼяті: додавати угоди в демо можна,
   але після перезавантаження все повернеться до початкового.
================================================================== */

import { t as tx } from './lang';

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
  mistake_description: i % 4 === 0 ? tx('Зайшов до підтвердження на LTF.', 'Entered before LTF confirmation.') : '',
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
      mk(0,  'LONG',  'WIN',  2,   'A',  'London',   ['Silver Bullet'], tx('Вхід на 15m FVG після зняття азійського максимуму.', 'Entry on the 15m FVG after the Asian high got swept.')),
      mk(1,  'SHORT', 'LOSS', 1,   'B',  'London',   ['SFP'], tx('Поспішив, не дочекався підтвердження.', 'Rushed it, didn’t wait for confirmation.')),
      mk(2,  'LONG',  'WIN',  2.5, 'A+', 'London',   ['Silver Bullet'], tx('Чистий рух після маніпуляції під сесійний low.', 'Clean move after the manipulation below the session low.')),
      mk(3,  'LONG',  'WIN',  1.8, 'A',  'New York', ['Manipulation'], tx('Kill-zone, ідеальний вхід.', 'Kill zone, perfect entry.')),
      mk(4,  'SHORT', 'BE',   1,   'B',  'London',   ['SFP'], tx('Вийшов у беззбиток після затягування.', 'Moved to breakeven after it stalled.')),
      mk(5,  'SHORT', 'WIN',  3.2, 'A+', 'New York', ['Silver Bullet'], tx('Найкраща угода серії, тримав до денного таргету.', 'Best trade of the run, held to the daily target.')),
      mk(6,  'LONG',  'LOSS', 1,   'C',  'Asia',     ['FOMO'], tx('Азія — не моя сесія, ліз від нудьги.', 'Asia isn’t my session, traded out of boredom.')),
      mk(7,  'LONG',  'WIN',  2.1, 'A',  'London',   ['Manipulation'], tx('Ретест OB після BOS.', 'OB retest after BOS.')),
      mk(8,  'SHORT', 'LOSS', 1,   'B',  'New York', ['Impatience'], tx('Другий вхід поспіль після стопу.', 'Second entry in a row right after a stop.')),
      mk(9,  'LONG',  'WIN',  2.6, 'A',  'London',   ['Silver Bullet'], tx('За планом від і до.', 'By the plan, start to finish.')),
      mk(10, 'SHORT', 'WIN',  1.4, 'B',  'London',   ['SFP'], tx('Забрав швидко, бо наближались новини.', 'Took it fast because news was coming.')),
      mk(11, 'LONG',  'LOSS', 1,   'C',  'New York', ['FOMO'], tx('Здогнав рух, який уже пішов без мене.', 'Chased a move that had already left without me.')),
    ],
  },
  {
    id: `${DEMO_PREFIX}sfp`,
    name: tx('SFP на золоті', 'SFP on gold'),
    pair: 'XAUUSD',
    strategy_name: 'SFP',
    initial_balance: 5000,
    created_at: '2026-05-12',
    demo: true,
    trades: [
      mk(0, 'SHORT', 'WIN',  1.9, 'A',  'London',   ['SFP'], tx('Свіп хаю попереднього дня.', 'Sweep of the previous day’s high.')),
      mk(1, 'SHORT', 'WIN',  2.2, 'A',  'New York', ['SFP'], tx('Реакція на CPI, вхід після першого імпульсу.', 'CPI reaction, entered after the first impulse.')),
      mk(2, 'LONG',  'LOSS', 1,   'B',  'London',   ['Manipulation'], tx('Структура була брудна, все одно поліз.', 'Structure was messy, went in anyway.')),
      mk(3, 'SHORT', 'WIN',  1.5, 'A+', 'London',   ['SFP'], tx('Ідеальний свіп під азійський лоу.', 'Perfect sweep below the Asian low.')),
      mk(4, 'LONG',  'LOSS', 1,   'C',  'Asia',     ['Impatience'], tx('Нічний вхід — знову мінус.', 'Night entry — another loss.')),
      mk(5, 'SHORT', 'BE',   1,   'B',  'New York', ['SFP'], tx('Закрив руками, злякався відкату.', 'Closed manually, got scared of the pullback.')),
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

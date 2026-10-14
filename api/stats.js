/* Публічний лічильник для лендингу: скільки угод записано в журналах
   і скільки трейдерів їх веде. Лише дві цифри, жодних даних людей.
   Рахуємо службовим ключем раз на годину й тримаємо в памʼяті:
   лендинг відкривають часто, а цифра за годину майже не змінюється. */
import { admin } from '../netlify/functions/_mono.mjs';

const TTL = 60 * 60 * 1000;
let cache = null;

async function compute() {
  const db = admin();
  const { count: trades } = await db.from('trades').select('id', { count: 'exact', head: true });
  /* Трейдери з хоча б однією угодою — через RPC не йдемо, тягнемо лише
     колонку user_id. Поки угод десятки тисяч, це дешево. */
  const ids = new Set();
  let from = 0;
  for (;;) {
    const { data, error } = await db.from('trades').select('user_id').range(from, from + 9999);
    if (error || !data?.length) break;
    data.forEach((r) => ids.add(r.user_id));
    if (data.length < 10000) break;
    from += 10000;
  }
  return { trades: trades || 0, traders: ids.size, at: new Date().toISOString() };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'public, max-age=600');
  try {
    if (!cache || Date.now() - cache.t > TTL) cache = { t: Date.now(), v: await compute() };
    res.status(200).json(cache.v);
  } catch (e) {
    console.error('stats:', e.message);
    res.status(200).json({ trades: 0, traders: 0 });
  }
}

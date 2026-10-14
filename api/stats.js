/* Публічний лічильник для лендингу: скільки угод записано в журналах
   і скільки трейдерів їх веде. Лише дві цифри, жодних даних людей.
   Рахуємо службовим ключем раз на годину й тримаємо в памʼяті:
   лендинг відкривають часто, а цифра за годину майже не змінюється. */
import { admin } from '../netlify/functions/_mono.mjs';

const TTL = 60 * 60 * 1000;
let cache = null;

async function compute() {
  const db = admin();
  /* Угоди — журнал плюс бектест: обидва справжні записи людей. */
  const [{ count: journal }, { count: backtest }] = await Promise.all([
    db.from('trades').select('id', { count: 'exact', head: true }),
    db.from('backtest_trades').select('id', { count: 'exact', head: true }),
  ]);
  /* Зареєстровані акаунти. Юзерів сотні, тож одна сторінка listUsers;
     коли перевалить за 1000 — гортати далі. */
  let users = 0;
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    const n = data?.users?.length || 0;
    users += n;
    if (n < 1000) break;
  }
  return { trades: (journal || 0) + (backtest || 0), traders: users, at: new Date().toISOString() };
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

/* ==================================================================
   Курс долара до гривні — для цін у гривнях.

   Ціна тарифу живе в доларах ($15 / $144), а гривня рахується з
   офіційного курсу НБУ на сьогодні. Так ціна в гривнях сама йде за
   курсом, і руками її ніхто не переписує.

   Чому через наш сервер, а не з браузера напряму: курс потрібен і
   сервісу оплати (сума списання має рахуватись тут, а не в браузері,
   де її можна підмінити), і один запит на кілька годин замість
   запиту від кожного відвідувача лендінга.

   Запасне джерело — open.er-api.com: якщо НБУ не відповідає, ціна не
   має зникати зі сторінки.
================================================================== */

const TTL = 6 * 60 * 60 * 1000; // курс НБУ міняється раз на добу
let cache = null;

async function fromNbu() {
  const r = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json', {
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`nbu ${r.status}`);
  const [row] = await r.json();
  const rate = Number(row?.rate);
  if (!(rate > 0)) throw new Error('nbu: no rate');
  return { rate, date: row.exchangedate || null, source: 'nbu' };
}

async function fromFallback() {
  const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`er-api ${r.status}`);
  const data = await r.json();
  const rate = Number(data?.rates?.UAH);
  if (!(rate > 0)) throw new Error('er-api: no rate');
  return { rate, date: data.time_last_update_utc || null, source: 'er-api' };
}

export async function usdUahRate() {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  let value;
  try {
    value = await fromNbu();
  } catch {
    value = await fromFallback();
  }
  cache = { at: Date.now(), value };
  return value;
}

export default async function handler(req, res) {
  try {
    const value = await usdUahRate();
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json(value);
  } catch (e) {
    /* Старий курс кращий за жоден: ціна в гривнях — довідкова. */
    if (cache) return res.status(200).json({ ...cache.value, stale: true });
    res.status(502).json({ error: 'rate unavailable' });
  }
}

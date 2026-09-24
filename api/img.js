/* global Buffer */
/* ==================================================================
   Проксі для скрінів графіків.

   TradingView віддає знімки без CORS-заголовків. Показати таку
   картинку в <img> браузер дозволяє, а от прочитати її пікселі —
   ні: і canvas, і будь-який fetch по ній падають. Через це мовчки
   не працювали обидві наші перевірки — і приглушення світлих
   графіків, і читання таймфрейму зі скріна.

   Тому картинка їде через нас: сервер тягне її сам (для нього CORS
   не існує) і віддає браузеру вже зі своїм заголовком.

   Проксі навмисно вузький. Відкритий проксі на будь-яку адресу — це
   спосіб ходити чужими руками куди завгодно, включно з внутрішньою
   мережею хостингу. Тут дозволені рівно ті хости, звідки в нас
   бувають графіки.
================================================================== */

const ALLOWED = new Set([
  's3.tradingview.com',
  'www.tradingview.com',
  'tradingview.com',
  'charts-storage.tradingview.com',
]);

export default async function handler(req, res) {
  const raw = req.query?.u;
  if (!raw) return res.status(400).json({ error: 'no url' });

  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ error: 'bad url' });
  }

  if (target.protocol !== 'https:' || !ALLOWED.has(target.hostname)) {
    return res.status(403).json({ error: 'host not allowed' });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EdgeJournal/1.0)' },
      /* Редірект міг би вивести запит за межі дозволених хостів. */
      redirect: 'error',
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'upstream' });

    const type = upstream.headers.get('content-type') || 'image/png';
    if (!type.startsWith('image/')) return res.status(415).json({ error: 'not an image' });

    const buf = Buffer.from(await upstream.arrayBuffer());

    res.setHeader('Content-Type', type);
    res.setHeader('Access-Control-Allow-Origin', '*');
    /* Знімок за посиланням незмінний — тримаємо його довго й у
       браузера, і на краю: друга перевірка тієї самої картинки не
       має знову йти в мережу. */
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
}

import { useEffect, useRef, useState } from 'react';
import { T } from '../trading/planTheme';

/* ==================================================================
   Сцени на замкнених розділах.

   Замок каже «тобі не дали», але не каже, чого саме. Людина бачить
   перешкоду й не бачить призу, а платять за приз. Тому тут показано
   роботу розділу — рухом, а не списком.

   --------------------------------------------------------------
   Чому це більше не CSS-цикл.

   Попередні версії були одним набором keyframes на три зашиті угоди.
   Скільки їх не розтягуй, у кінці циклу все одно доводиться все
   згасити й почати спочатку — а згасання читається як «записи
   кудись поділись», тобто рівно як заперечення того, що розділ
   обіцяє. Плюс на третьому повторі видно, що угоди ті самі, і сцена
   перетворюється на гіфку.

   Тепер угоди генеруються на ходу й черга не кінчається ніколи:
   голова відривається, решта підтягується вгору, знизу заходить
   нова. У журналі новий запис стає зверху й штовхає попередні вниз,
   поки вони не зникнуть під краєм блоку. Смуги прокрутки немає —
   край розмивається маскою.

   --------------------------------------------------------------
   Рядки позиціонуються абсолютно, і це не примха.

   У звичайному потоці зміна порядку елементів не анімується: браузер
   просто перемальовує їх на нових місцях. Тому кожен рядок стоїть на
   `top: індекс × крок` і переїжджає транзишеном, коли індекс
   змінюється. Звідси ж і горизонтальний політ: обидва блоки мають
   однакову розкладку, тож слот 0 ліворуч і слот 0 праворуч — на
   одній висоті, і картці достатньо перелетіти вбік.
================================================================== */

/* Геометрія. Живе в JS, бо за нею рахується позиція кожного рядка, і
   розʼїхатись із CSS воно не має права. Міняєш тут — міняй і у
   .gate-row / .gate-rows. */
const ROW_STEP = 37;   /* висота 30 + проміжок 7 */
const MSG_STEP = 50;   /* висота повідомлення 41 + проміжок 9 */

const QUEUE_LEN = 5;   /* видно ~3.5 — обрізаний рядок і каже, що черга довша */
const JOURNAL_LEN = 5; /* більше все одно під маскою */

const TICK = 2400;     /* пауза між угодами */

/* Політ трохи довший за переїзд рядків (.72s у .gate-row), щоб слот у
   журналі встиг доїхати й зупинитись ДО посадки. Якщо зробити
   навпаки, картка сідає на місце, яке ще рухається, — і саме це
   раніше читалось як сіпання. */
const FLIGHT = 760;
const FLY_OUT = 140;   /* ще стільки картка гасне поверх рядка, що вже сів */

const SYMBOLS = ['EURUSD', 'GER40', 'XAUUSD', 'GBPUSD', 'US100', 'USDJPY', 'BTCUSD', 'AUDUSD', 'SP500', 'ETHUSD'];

let seq = 0;

/* Випадкова угода.

   Мінусові — приблизно кожна третя, і прибирати їх не можна. Сцена
   продає автоімпорт, а не прибутковість; стрічка з самих плюсів
   читається як обіцянка заробітку, якої продукт не дає й дати не
   може. Заодно так видно, що в журнал їде все підряд, а не вибране. */
function makeTrade() {
  const up = Math.random() > 0.34;
  const r = Math.random() * 2.3 + 0.2;
  return {
    id: ++seq,
    pair: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    side: Math.random() > 0.5 ? 'Long' : 'Short',
    up,
    r: `${up ? '+' : '−'}${r.toFixed(1)}R`,
  };
}

/* Системна вимога «менше руху» — не побажання. Для когось анімація,
   що не спиняється, означає нудоту або напад, а тут вона ще й
   всередині екрана оплати, звідки не вийдеш. */
function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  return reduce;
}

function TradeRow({ trade, index }) {
  return (
    <span
      className="gate-row"
      style={{
        /* Саме transform, а не top: зсув через top — це перерахунок
           розкладки на кожному кадрі, і на десятку рядків одразу
           видно ривки. transform живе на композиторі й нічого не
           перераховує. */
        transform: `translateY(${index * ROW_STEP}px)`,
        /* Порожній слот у журналі, який чекає на картку (див. beat). */
        opacity: trade.pending ? 0 : 1,
      }}
    >
      <span className="gate-row-pair">{trade.pair}</span>
      <span className="gate-row-side">{trade.side}</span>
      <span className="gate-row-r" style={{ color: trade.up ? T.ok : T.bad }}>{trade.r}</span>
    </span>
  );
}

function Mt5Scene() {
  const reduce = usePrefersReducedMotion();

  const [queue, setQueue] = useState(() => Array.from({ length: QUEUE_LEN }, makeTrade));
  /* Журнал стартує не порожнім: людина може глянути на екран і піти
     через секунду, так і не побачивши, що праворуч узагалі щось
     буває. */
  const [journal, setJournal] = useState(() => Array.from({ length: 3 }, makeTrade));
  const [flying, setFlying] = useState(null);

  /* Актуальна черга для таймера. Читати queue з замикання не можна —
     ефект налаштовується раз, а черга змінюється щотика. */
  const queueRef = useRef(queue);
  queueRef.current = queue;

  useEffect(() => {
    if (reduce) return undefined;

    const pending = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => { pending.delete(id); fn(); }, ms);
      pending.add(id);
    };

    const beat = setInterval(() => {
      const head = queueRef.current[0];
      if (!head) return;

      /* Угода йде з черги — решта підтягується вгору. */
      setQueue((q) => [...q.slice(1), makeTrade()]);
      setFlying(head);

      /* Місце в журналі звільняється ОДРАЗУ, а не в мить посадки.

         Раніше записи роз'їжджались рівно тоді, коли картка долітала:
         виходило, що вона приземляється на зайняте, і все сіпається
         під нею. Тепер рядок вставляється прозорим на початку
         польоту — поки картка летить, журнал спокійно розсувається, і
         до її приходу слот уже стоїть порожній і чекає. */
      setJournal((j) => [{ ...head, pending: true }, ...j].slice(0, JOURNAL_LEN));

      later(
        () => setJournal((j) => j.map((r) => (r.id === head.id ? { ...r, pending: false } : r))),
        FLIGHT,
      );
      later(() => setFlying((f) => (f && f.id === head.id ? null : f)), FLIGHT + FLY_OUT);
    }, TICK);

    return () => {
      clearInterval(beat);
      pending.forEach(clearTimeout);
    };
  }, [reduce]);

  return (
    <div className="gate-scene" aria-hidden>
      <div className="gate-box">
        <span className="gate-box-title">MT5 · термінал</span>
        <span className="gate-rows">
          {queue.map((t, i) => <TradeRow key={t.id} trade={t} index={i} />)}
        </span>
      </div>

      <span className="gate-gap">
        <span className="gate-wire" />
      </span>

      <div className="gate-box">
        <span className="gate-box-title">Journal</span>
        <span className="gate-rows">
          {journal.map((t, i) => <TradeRow key={t.id} trade={t} index={i} />)}
        </span>
      </div>

      {/* Картка в польоті — поверх сцени, бо перетинає обидва блоки. */}
      {flying && (
        <span className="gate-fly" key={flying.id}>
          <span className="gate-row-pair">{flying.pair}</span>
          <span className="gate-row-side">{flying.side}</span>
          <span className="gate-row-r" style={{ color: flying.up ? T.ok : T.bad }}>{flying.r}</span>
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Telegram.

   Повідомлення — рівно те, що бот справді вміє: нова угода, закриття,
   таймер з плану, підсумок дня, попередження про ризик. Вигадувати
   красивіші не можна: людина побачить справжні через хвилину після
   підключення й звірить.

   Попередження про ризик підсвічене окремо. Решта інформує, а це
   єдине, що здатне зупинити збиток до того, як він стався — заради
   нього бота й тримають.
------------------------------------------------------------------ */
const CHAT_MSGS = 5;
const CHAT_TICK = 2200;

function makeMessage() {
  const t = makeTrade();
  const pick = Math.random();

  if (pick < 0.3) return { id: ++seq, text: `📥 Нова угода: ${t.pair} · ${t.side}` };
  if (pick < 0.58) return { id: ++seq, text: `${t.up ? '🟢' : '🔴'} ${t.pair} закрито · ${t.r}` };
  if (pick < 0.74) return { id: ++seq, text: `⏰ ${t.pair} — час перевірити рівень` };
  if (pick < 0.87) {
    const used = (Math.random() * 1.6 + 1.2).toFixed(1);
    return { id: ++seq, warn: true, text: `⚠️ Ризик дня ${used}% з 3% — лишилась одна угода` };
  }

  const n = Math.floor(Math.random() * 4) + 2;
  return { id: ++seq, text: `📊 День закрито: ${n} угод · ${t.r}` };
}

function TelegramScene() {
  const reduce = usePrefersReducedMotion();
  const [msgs, setMsgs] = useState(() => Array.from({ length: 3 }, makeMessage));

  useEffect(() => {
    if (reduce) return undefined;
    const beat = setInterval(
      /* Новіше — на початку масиву; знизу вгору його розкладає CSS
         (`bottom: індекс × крок`). Так «підростання» стрічки —
         це та сама зміна індексу, що й у черзі MT5. */
      () => setMsgs((m) => [makeMessage(), ...m].slice(0, CHAT_MSGS)),
      CHAT_TICK,
    );
    return () => clearInterval(beat);
  }, [reduce]);

  return (
    <div className="gate-scene gate-scene-chat" aria-hidden>
      <div className="gate-phone">
        <span className="gate-phone-bar">
          <span className="gate-phone-dot" />
          <span className="gate-box-title">The Edge · bot</span>
        </span>

        <span className="gate-msgs">
          {msgs.map((m, i) => (
            <span
              key={m.id}
              className={`gate-msg${m.warn ? ' is-warn' : ''}`}
              /* Прикріплені до низу, підіймаються вгору — тому мінус. */
              style={{ transform: `translateY(${-i * MSG_STEP}px)` }}
            >
              {m.text}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

export default function GateScene({ feature }) {
  if (feature === 'telegram') return <TelegramScene />;
  if (feature === 'mt5') return <Mt5Scene />;
  return null;
}

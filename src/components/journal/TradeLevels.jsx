import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AssetIcon from '../ui/AssetIcon';
import { T, EASE } from '../../lib/theme';
import { getTradeCandles, peekTradeCandles } from '../../lib/mt5Store';

/* Одна тривалість на всі переходи кольору: фон, свічки, стрілки й
   підписи мусять їхати разом, інакше перемикання читається як
   послідовність дрібних смикань, а не як зміна освітлення. */
const SKIN = 'fill .45s ease, stroke .45s ease';
const PAINT = 'background-color .45s ease, border-color .45s ease, color .45s ease';

/* ==================================================================
   Графік угоди, імпортованої з терміналу.

   Свічки беремо з того самого MT5, з якого приїхала угода: у нього
   котирування вже є, і вони саме того брокера, у якого торгували.

   Малюємо вручну, а не бібліотекою: графік статичний, без зуму й
   панорами, — а за бібліотеку довелося б платити ще однією
   залежністю в бандлі й чужою темою, яку потім підганяти під нашу.

   Свідомо мінімалістично, як позиція в терміналі: свічки, трикутник
   входу, трикутник виходу і пунктир між ними. Ні рамок рівнів, ні
   підписів, ні залитих зон — усе це з'їдає площу й перетягує увагу
   з того єдиного, заради чого сюди дивляться: як ішла ціна між
   входом і виходом.

   Масштаб рахуємо по свічках, а не по рівнях. Через це далекий тейк
   може лишитись за кадром — і це правильний компроміс: краще бачити
   рух у повний зріст, ніж тиснути його в смужку заради лінії, до
   якої ціна й близько не підходила.
================================================================== */

const VW = 1000;   // внутрішня система координат SVG
const VH = 420;

const STYLE_KEY = 'edge_trade_chart_style';
const TF_KEY = 'edge_trade_chart_tf';

/* Порядок щаблів. Потрібен саме такий список: ключі обʼєкта
   приходять у довільному порядку, і сортування за назвою дає
   «H1 H4 M15 M30» — алфавіт замість шкали часу. */
const LADDER = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
const byLadder = (a, b) => LADDER.indexOf(a) - LADDER.indexOf(b);

/* Три манери, а не три теми: людина звикає до однієї й читає графік
   швидше, ніж якби кожен виглядав по-новому.

   «Edge» — наша: колір сам каже напрямок свічки.
   «Mono» — та сама темрява, але порожнє тіло на зростанні й залите
   на падінні; так робить термінал, і так видно форму, а не колір.
   «Classic» — білий фон MetaTrader для тих, хто дивиться на графіки
   саме там і не хоче перемикатись очима. */
const STYLES = {
  edge: {
    label: 'Edge',
    bg: T.bg,
    line: T.line,
    text: T.text,
    muted: T.text4,
    soft: T.text3,
    up: { fill: T.ok, stroke: T.ok },
    down: { fill: T.bad, stroke: T.bad },
    wick: null,                 // null = колір свічки
    arrowIn: null,              // null = за напрямком угоди
    arrowOut: T.acc,
    link: null,                 // null = за результатом
    tp: T.ok,
  },
  mono: {
    label: 'Mono',
    bg: '#08080a',
    line: 'rgba(255,255,255,0.10)',
    text: '#e9e9ee',
    muted: 'rgba(233,233,238,0.42)',
    soft: 'rgba(233,233,238,0.62)',
    up: { fill: 'transparent', stroke: '#e9e9ee' },
    down: { fill: '#e9e9ee', stroke: '#e9e9ee' },
    wick: '#e9e9ee',
    arrowIn: '#e9e9ee',
    arrowOut: '#8b7bff',
    link: '#8b7bff',
    tp: 'rgba(233,233,238,0.5)',
  },
  classic: {
    label: 'Classic',
    bg: '#ffffff',
    line: '#d8d8de',
    text: '#101014',
    muted: '#8a8a94',
    soft: '#5a5a64',
    up: { fill: '#ffffff', stroke: '#101014' },
    down: { fill: '#101014', stroke: '#101014' },
    wick: '#101014',
    arrowIn: '#d22b2b',
    arrowOut: '#1f6fd0',
    link: '#d22b2b',
    tp: '#3a9a5c',
  },
};

const ORDER = ['edge', 'mono', 'classic'];

/* Ціни різної точності: 1.09123 у валютах, 26134.77 в індексах. Тому
   не фіксуємо знаки після коми, а прибираємо хвостові нулі. */
function price(v) {
  if (!Number.isFinite(v)) return '—';
  return String(Number(v.toFixed(5)));
}

export default function TradeLevels({ trade, category, className = '' }) {
  const t = trade || {};

  /* Свічки довантажуємо самі, а не чекаємо їх у рядку угоди: у списку
     їх немає навмисно, бо він возить по сорок рядків за раз.

     Початкове значення беремо з кешу синхронно. Список передзавантажує
     свічки для всієї сторінки, тож у переважній більшості випадків
     вони вже тут, і картка відкривається з готовим графіком — без
     кадру порожнечі, який виглядав би як підвисання. */
  const [loaded, setLoaded] = useState(() => peekTradeCandles(t) ?? null);

  useEffect(() => {
    const ready = peekTradeCandles(t);
    if (ready !== undefined) { setLoaded(ready); return undefined; }

    let alive = true;
    getTradeCandles(t).then((v) => { if (alive) setLoaded(v); });
    return () => { alive = false; };
  }, [t.source, t.external_id]);

  /* Вибір манери переживає перезахід: хто один раз перемкнувся на
     білий фон, не хоче робити це щоразу. */
  const [styleId, setStyleId] = useState(() => {
    const saved = localStorage.getItem(STYLE_KEY);
    return ORDER.includes(saved) ? saved : 'edge';
  });

  useEffect(() => { localStorage.setItem(STYLE_KEY, styleId); }, [styleId]);

  const S = STYLES[styleId] || STYLES.edge;

  /* Свічки приїжджають у трьох можливих виглядах, бо формат мінявся
     разом із розумінням задачі:

       {tf, s:{M5:{b,i,o}, …}} — кілька таймфреймів на вибір;
       {b, i, o}               — один, з індексами входу й виходу;
       [[t,o,h,l,c], …]        — найперший, голий масив без індексів.

     Старі два лишаємо живими: угоди, завантажені до перезапису, не
     мусять раптово втратити графік. */
  const sets = useMemo(() => {
    const raw = loaded || t.candles;
    if (!raw) return null;

    const parse = (one) => {
      const list = Array.isArray(one) ? one : one?.b;
      if (!Array.isArray(list) || list.length < 2) return null;

      const bars = list
        .map((c) => ({ o: +c[1], h: +c[2], l: +c[3], c: +c[4] }))
        .filter((c) => Number.isFinite(c.o) && Number.isFinite(c.h)
                    && Number.isFinite(c.l) && Number.isFinite(c.c));

      if (bars.length < 2) return null;

      const i = Array.isArray(one) ? null : one.i;
      const o = Array.isArray(one) ? null : one.o;

      return {
        bars,
        inAt: Number.isInteger(i) ? i : null,
        outAt: Number.isInteger(o) ? o : null,
      };
    };

    if (raw.s && typeof raw.s === 'object') {
      const out = {};
      for (const [name, one] of Object.entries(raw.s)) {
        const parsed = parse(one);
        if (parsed) out[name] = parsed;
      }
      const names = Object.keys(out).sort(byLadder);
      if (!names.length) return null;
      return { map: out, names, def: out[raw.tf] ? raw.tf : names[0] };
    }

    const only = parse(raw);
    if (!only) return null;
    const name = raw.tf || '—';
    return { map: { [name]: only }, names: [name], def: name };
  }, [loaded, t.candles]);

  /* Обраний таймфрейм памʼятаємо між угодами: хто дивиться свій
     журнал на M15, не хоче перемикати його в кожній картці. */
  const [tfWanted, setTfWanted] = useState(() => localStorage.getItem(TF_KEY) || '');

  const tfName = sets
    ? (sets.map[tfWanted] ? tfWanted : sets.def)
    : null;

  const data = tfName ? sets.map[tfName] : null;

  const model = useMemo(() => {
    const entry = Number(t.entry_price);
    const exit = Number(t.exit_price);

    if (!data) {
      /* Свічок немає — лишається шкала з самих цін угоди. Краще за
         порожню плашку: принаймні видно, куди вона пішла. */
      const vals = [entry, exit, Number(t.sl_price), Number(t.tp_price)]
        .filter((v) => Number.isFinite(v) && v !== 0);
      if (vals.length < 2) return null;

      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const pad = (hi - lo) * 0.15 || 1;
      return { lo: lo - pad, hi: hi + pad, bars: null };
    }

    /* Межі рахуємо ТІЛЬКИ по свічках.

       Спокуса дотягнути шкалу до ціни входу чи виходу коштувала
       дорого: варто було воркеру не знайти бар виходу — і одна
       стороння ціна розтягувала графік так, що всі свічки збивались
       у смужку внизу. */
    const lo = Math.min(...data.bars.map((c) => c.l));
    const hi = Math.max(...data.bars.map((c) => c.h));

    const span = hi - lo || Math.abs(hi) * 0.002 || 1;
    return { lo: lo - span * 0.06, hi: hi + span * 0.06, bars: data.bars };
  }, [t.entry_price, t.exit_price, t.sl_price, t.tp_price, data]);

  if (!model) return null;

  const { lo, hi } = model;
  const pct = (v) => ((hi - v) / (hi - lo)) * 100;
  const y = (v) => (pct(v) / 100) * VH;

  const bars = model.bars;
  const step = bars ? VW / bars.length : 0;

  /* Пропорції як у терміналі: тіло вужче за півкроку, між сусідніми
     лишається повітря. Заповнені впритул тіла читаються суцільною
     стрічкою, а не окремими барами. */
  const body = Math.min(step * 0.56, 18);
  const wick = Math.min(Math.max(step * 0.1, 1.2), 2.4);

  const xAt = (i) => ((i * step + step / 2) / VW) * 100;

  const long = t.type !== 'Short';
  const won = Number(t.profit_money) >= 0;

  const entry = Number(t.entry_price);
  const exit = Number(t.exit_price);
  const tp = Number(t.tp_price);
  const tpIn = Number.isFinite(tp) && tp !== 0 && tp > lo && tp < hi;

  /* Притискаємо позначку до країв кадру: зазвичай обидві ціни й так
     усередині, але якщо одна вибилась — хай стоїть на межі, а не
     їде за поле разом із пунктиром у нікуди. */
  const clamp = (v) => Math.max(0, Math.min(100, pct(v)));

  const marks = bars && data?.inAt != null && data.inAt < bars.length
    ? {
      in: { x: xAt(data.inAt), y: clamp(entry) },
      out: data.outAt != null && data.outAt < bars.length && Number.isFinite(exit)
        ? { x: xAt(data.outAt), y: clamp(exit) }
        : null,
    }
    : null;

  const dirColor = long ? T.ok : T.bad;
  const arrowIn = S.arrowIn || dirColor;
  const link = S.link || (won ? T.ok : T.bad);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl ${className}`}
      style={{ background: S.bg, border: `1px solid ${S.line}`, transition: PAINT }}
    >
      {/* flex-wrap: актив + бейдж + перемикачі таймфрейму й манери
          разом не влазять у 320px, а рядок раніше не переносився —
          хвіст (перемикач манери) обрізало межею картки */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3" style={{ borderBottom: `1px solid ${S.line}`, transition: PAINT }}>
        <span className="grid w-8 shrink-0 place-items-center">
          <AssetIcon symbol={t.plan_pair || ''} category={category} />
        </span>
        <span className="text-[15px] font-bold" style={{ fontFamily: T.sans, color: S.text, transition: PAINT }}>
          {t.plan_pair || '—'}
        </span>
        <span
          className="rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]"
          style={{
            fontFamily: T.sans,
            color: long ? T.ok : T.bad,
            background: `rgba(${long ? T.okRgb : T.badRgb},0.12)`,
            border: `1px solid rgba(${long ? T.okRgb : T.badRgb},0.24)`,
          }}
        >
          {t.type || 'Long'}
        </span>

        {/* Таймфрейм — вибір людини, а не здогадка алгоритму.

            Автопідбір лишається як початкове значення, але останнє
            слово за оком: формула не знає, що на цьому русі краще
            видно на M15, хоч за тривалістю «правильний» M30. Усі
            варіанти воркер поклав заздалегідь, бо браузер до
            термінала не ходить. */}
        {sets && sets.names.length > 1 ? (
          <span
            className="flex shrink-0 items-center rounded-lg p-0.5"
            style={{ border: `1px solid ${S.line}`, transition: PAINT }}
          >
            {sets.names.map((n) => {
              const on = n === tfName;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => { setTfWanted(n); localStorage.setItem(TF_KEY, n); }}
                  className="relative rounded-[6px] px-1.5 py-[2px] text-[10.5px] font-bold tabular-nums"
                  style={{ fontFamily: T.mono, color: on ? S.text : S.muted, transition: PAINT }}
                >
                  {on && (
                    <motion.span
                      layoutId="chart-tf"
                      className="absolute inset-0 rounded-[6px]"
                      style={{ background: `rgba(${T.accRgb},0.18)` }}
                      transition={{ duration: 0.28, ease: EASE }}
                    />
                  )}
                  <span className="relative">{n}</span>
                </button>
              );
            })}
          </span>
        ) : tfName && tfName !== '—' ? (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums"
            style={{ fontFamily: T.mono, color: S.soft, border: `1px solid ${S.line}`, transition: PAINT }}
          >
            {tfName}
          </span>
        ) : null}

        <span className="ml-auto tabular-nums text-[11.5px]" style={{ fontFamily: T.mono, color: S.muted, transition: PAINT }}>
          {price(entry)} → {price(exit)}
        </span>

        {/* Перемикач манери. Три короткі підписи замість іконок: тут
            вибір не про дію, а про вигляд, і назву прочитати швидше,
            ніж розгадати піктограму. */}
        <span
          className="flex shrink-0 items-center rounded-lg p-0.5"
          style={{ border: `1px solid ${S.line}` }}
        >
          {ORDER.map((id) => {
            const on = id === styleId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setStyleId(id)}
                className="relative rounded-[6px] px-2 py-[3px] text-[10.5px] font-bold"
                style={{ fontFamily: T.sans, color: on ? S.text : S.muted, transition: PAINT }}
              >
                {/* Підсвітка не зʼявляється наново, а переїжджає:
                    спільний layoutId змушує Framer анімувати її як
                    один предмет, що змінив місце. */}
                {on && (
                  <motion.span
                    layoutId="chart-skin"
                    className="absolute inset-0 rounded-[6px]"
                    style={{ background: `rgba(${T.accRgb},0.18)` }}
                    transition={{ duration: 0.32, ease: EASE }}
                  />
                )}
                <span className="relative">{STYLES[id].label}</span>
              </button>
            );
          })}
        </span>
      </div>

      <div className="relative flex-1" style={{ minHeight: 360 }}>
        {/* Перемикання таймфрейму — не морфінг свічок: на M15 і M30
            це фізично різні бари, і вдавати, ніби одна перетікає в
            іншу, означало б малювати рух, якого не було.

            Замість цього графік промальовується зліва направо, як
            стрічка котирувань, що добігає до поточного моменту. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tfName}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {bars && bars.map((c, i) => {
            const up = c.c >= c.o;
            const look = up ? S.up : S.down;
            const wc = S.wick || look.stroke;
            const x = i * step + step / 2;
            const yHi = y(c.h);
            const yLo = y(c.l);
            const yO = y(c.o);
            const yC = y(c.c);

            return (
              <motion.g
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                /* Крихітна затримка на кожен бар і дає ту саму хвилю
                   зліва направо. Ділимо на кількість барів, щоб увесь
                   прохід тривав однаково — і на сорока свічках, і на
                   ста двадцяти. */
                transition={{ delay: (i / bars.length) * 0.34, duration: 0.16 }}
              >
                <rect x={x - wick / 2} y={yHi} width={wick} height={Math.max(yLo - yHi, 0.6)} fill={wc} style={{ transition: SKIN }} />
                <rect
                  x={x - body / 2}
                  y={Math.min(yO, yC)}
                  width={body}
                  height={Math.max(Math.abs(yC - yO), 1.2)}
                  fill={look.fill}
                  stroke={look.stroke}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  style={{ transition: SKIN }}
                />
              </motion.g>
            );
          })}

          {tpIn && (
            <line
              x1="0" x2={VW} y1={y(tp)} y2={y(tp)}
              stroke={S.tp}
              strokeWidth="1"
              strokeDasharray="3 7"
              opacity="0.4"
              vectorEffect="non-scaling-stroke"
              style={{ transition: SKIN }}
            />
          )}

          {/* Пунктир від входу до виходу — той самий жест, що в
              терміналі: видно, куди угода поїхала насправді. */}
          {marks?.out && (
            <line
              x1={(marks.in.x / 100) * VW}
              y1={(marks.in.y / 100) * VH}
              x2={(marks.out.x / 100) * VW}
              y2={(marks.out.y / 100) * VH}
              stroke={link}
              strokeWidth="2"
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
              style={{ transition: SKIN }}
            />
          )}
        </svg>

        {/* Трикутники — звичайним HTML: у розтягнутому по ширині SVG
            вони поїхали б разом із ним і перестали бути трикутниками. */}
        {/* Стрілки й пунктир зʼявляються після того, як хвиля свічок
            добігла: спершу ринок, потім те, що ти на ньому зробив. */}
        {marks && <Arrow x={marks.in.x} y={marks.in.y} up={long} color={arrowIn} delay={0.3} />}
        {marks?.out && <Arrow x={marks.out.x} y={marks.out.y} up={!long} color={S.arrowOut} delay={0.4} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-4 py-3"
        style={{ borderTop: `1px solid ${S.line}`, transition: PAINT }}
      >
        {Number.isFinite(Number(t.volume)) && <Stat S={S} label="Volume" value={`${t.volume} lot`} />}
        {Number.isFinite(Number(t.sl_price)) && (
          <Stat S={S} label="Stop" value={price(Number(t.sl_price))} />
        )}
        {Number.isFinite(Number(t.risk_money)) && (
          <Stat S={S} label="Risked" value={Number(t.risk_money).toFixed(2)} />
        )}
        {Number.isFinite(Number(t.rr)) && (
          <Stat S={S} label="Result" value={`${t.rr > 0 ? '+' : ''}${t.rr}R`} c={t.rr >= 0 ? T.ok : T.bad} />
        )}
        {Number.isFinite(Number(t.profit_money)) && (
          <Stat
            S={S}
            label="P/L"
            value={`${t.profit_money > 0 ? '+' : ''}${Number(t.profit_money).toFixed(2)}`}
            c={t.profit_money >= 0 ? T.ok : T.bad}
          />
        )}
      </div>
    </div>
  );
}

/* Стрілка вказує В бік угоди й стоїть вістрям рівно на ціні — так
   само, як у терміналі, де рівень позначає кінчик, а не центр
   значка. Тому спрямована вгору росте вниз від точки, і навпаки. */
function Arrow({ x, y, up, color, delay = 0 }) {
  return (
    <motion.span
      className="pointer-events-none absolute"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.2 }}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: 0,
        height: 0,
        transform: `translate(-50%, ${up ? '0' : '-100%'})`,
        borderLeft: '7px solid transparent',
        borderRight: '7px solid transparent',
        ...(up
          ? { borderBottom: `13px solid ${color}` }
          : { borderTop: `13px solid ${color}` }),
        /* Трикутник намальований рамками, тож переїзд кольору — це
           перехід border-color, а не background. */
        transition: 'border-color .45s ease',
      }}
    />
  );
}

function Stat({ S, label, value, c }) {
  return (
    <span className="flex items-baseline gap-2">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.1em]"
        style={{ fontFamily: T.sans, color: S.muted, transition: PAINT }}
      >
        {label}
      </span>
      <span
        className="tabular-nums text-[13px] font-bold"
        style={{ fontFamily: T.mono, color: c || S.soft, transition: PAINT }}
      >
        {value}
      </span>
    </span>
  );
}

import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { T } from '../../lib/theme';

/* ==================================================================
   Сцена на замкненому бектесті.

   Раніше тут не було нічого: заголовок, рядок тексту й кнопка посеред
   порожнього екрана. Порожнеча продає гірше за замок — людина не
   бачить, за що платити.

   Тому показуємо саму роботу бектесту: історія прокручується свічка
   за свічкою, стратегія відкриває угоди, кожна закривається в +R або
   −R, а знизу росте крива капіталу й рахуються ті самі метрики, що в
   журналі. Усе генерується на ходу — сцена не повторюється і не
   «перемотується» на початок.

   Характер той самий, що на сторінці 404: сітка з крапок, пляма
   світла за курсором і легкий нахил усієї сцени в 3D. Це одна мова
   для «живих» екранів продукту.

   Числа тут — ілюстрація, а не чиїсь результати: підпис унизу сцени
   це й каже.
================================================================== */

const W = 560;          // логічна ширина SVG; масштабується під контейнер
const H = 250;
const CHART_H = 170;    // висота зони свічок
const EQ_TOP = 184;     // де починається смуга кривої капіталу
const EQ_H = 50;
const VISIBLE = 44;     // свічок у кадрі
const STEP = W / VISIBLE;
const TICK = 320;       // мс на свічку

/* Випадкове блукання з легким трендом, що час від часу міняється, —
   інакше графік виглядає як шум, а не як ринок. */
function makeCandle(prev, drift) {
  const open = prev ? prev.close : 100;
  const move = (Math.random() - 0.5 + drift) * 1.6;
  const close = open + move;
  const high = Math.max(open, close) + Math.random() * 0.7;
  const low = Math.min(open, close) - Math.random() * 0.7;
  return { open, close, high, low };
}

export default function BacktestScene() {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /* Уся симуляція живе в ref і міняється лише в таймері; стан — тільки
     лічильник кадрів, щоб перемалювати. Так побічні дії (нова угода,
     крок кривої) не опиняються всередині оновлювача стану — у
     StrictMode React викликає його двічі, і кожна угода задвоювалась би. */
  const sim = useRef(null);
  if (!sim.current) {
    const candles = [];
    for (let i = 0; i < VISIBLE; i++) candles.push(makeCandle(candles[i - 1], 0.08));
    sim.current = { candles, trades: [], equity: [0], drift: 0.08, tick: 0, open: null, seq: 0 };
  }
  const [, setFrame] = useState(0);

  useEffect(() => {
    if (reduced) return undefined;
    const id = setInterval(() => {
      const s = sim.current;
      s.tick += 1;
      if (s.tick % 18 === 0) s.drift = (Math.random() - 0.5) * 0.3;

      const last = makeCandle(s.candles[s.candles.length - 1], s.drift);
      s.candles = [...s.candles.slice(1), last];

      if (s.open) {
        /* Відкрита угода: чи зачепило стоп або тейк. */
        const o = s.open;
        const hitTp = o.dir > 0 ? last.high >= o.tp : last.low <= o.tp;
        const hitSl = o.dir > 0 ? last.low <= o.sl : last.high >= o.sl;
        if (hitTp || hitSl) {
          const r = hitTp ? o.rr : -1;
          s.trades = [...s.trades.filter((x) => x.id !== o.id), { ...o, done: true, r, closeAt: s.tick }].slice(-8);
          s.equity = [...s.equity, s.equity[s.equity.length - 1] + r].slice(-40);
          s.open = null;
        }
      } else if (s.tick % 7 === 0) {
        /* Нова угода за «сигналом» — у бік поточного руху. */
        const dir = last.close >= last.open ? 1 : -1;
        const risk = 1.4 + Math.random() * 0.8;
        const rr = [1.5, 2, 2.5, 3][Math.floor(Math.random() * 4)];
        s.open = {
          id: ++s.seq, at: s.tick, dir, rr, done: false,
          entry: last.close, sl: last.close - dir * risk, tp: last.close + dir * risk * rr,
        };
        s.trades = [...s.trades, s.open].slice(-8);
      }
      setFrame((n) => n + 1);
    }, TICK);
    return () => clearInterval(id);
  }, [reduced]);

  const { candles, trades, equity } = sim.current;

  /* Масштаб по вертикалі — за видимими свічками й рівнями угод, щоб
     стоп і тейк не вилітали за кадр. */
  const tickNow = sim.current.tick;
  const visibleTrades = trades.filter((t) => tickNow - (t.closeAt ?? tickNow) < VISIBLE);
  const levels = visibleTrades.flatMap((t) => [t.sl, t.tp]);
  const lo = Math.min(...candles.map((c) => c.low), ...levels) - 0.5;
  const hi = Math.max(...candles.map((c) => c.high), ...levels) + 0.5;
  const y = (v) => 8 + ((hi - v) / (hi - lo)) * (CHART_H - 16);
  const xOfTick = (t) => W - (tickNow - t + 0.5) * STEP;

  /* Метрики — ті самі, що в журналі. */
  const closed = trades.filter((t) => t.done);
  const allR = equity.length - 1;
  const wins = equity.slice(1).filter((v, i) => v > equity[i]).length;
  const net = equity[equity.length - 1];
  const winRate = allR ? Math.round((wins / allR) * 100) : 0;

  const eqLo = Math.min(...equity, 0);
  const eqHi = Math.max(...equity, 1);
  const eqPath = equity
    .map((v, i) => {
      const px = (i / Math.max(equity.length - 1, 1)) * W;
      const py = EQ_TOP + EQ_H - ((v - eqLo) / (eqHi - eqLo || 1)) * EQ_H;
      return `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');

  /* Нахил за курсором — як на 404, тільки м'якший: тут поруч текст,
     і сцена не має відбирати на себе всю увагу. */
  const box = useRef(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 90, damping: 18, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 90, damping: 18, mass: 0.6 });
  const rotX = useTransform(sy, [-0.5, 0.5], [7, -7]);
  const rotY = useTransform(sx, [-0.5, 0.5], [-9, 9]);
  const spotX = useMotionValue(50);
  const spotY = useMotionValue(40);
  const spot = useTransform(
    [spotX, spotY],
    ([a, b]) => `radial-gradient(420px circle at ${a}% ${b}%, rgba(139,123,255,0.16), transparent 55%)`,
  );

  const onMove = (e) => {
    if (reduced || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mx.set(nx - 0.5);
    my.set(ny - 0.5);
    spotX.set(nx * 100);
    spotY.set(ny * 100);
  };
  const onLeave = () => { mx.set(0); my.set(0); };

  return (
    <div
      ref={box}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="mx-auto w-full max-w-[580px]"
      style={{ perspective: 1100 }}
    >
      <motion.div
        className="relative overflow-hidden rounded-3xl"
        style={{
          rotateX: reduced ? 0 : rotX,
          rotateY: reduced ? 0 : rotY,
          transformStyle: 'preserve-3d',
          background: 'linear-gradient(180deg, #0c0b14, #08080c)',
          border: `1px solid ${T.lineAcc}`,
          boxShadow: `0 40px 90px -40px rgba(${T.accRgb},0.55), inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
      >
        {/* сітка з крапок і світло за курсором — як на 404 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(rgba(196,181,253,0.22) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(ellipse 80% 70% at 50% 45%, black, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 45%, black, transparent 80%)',
          }}
        />
        <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: spot }} />

        {/* верхня смужка: «програвач історії» */}
        <div className="relative flex items-center justify-between px-5 pt-4" style={{ fontFamily: T.mono }}>
          <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em]" style={{ color: 'rgba(196,181,253,0.75)' }}>
            <span className="relative flex h-2 w-2">
              {!reduced && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: T.acc }} />}
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: T.acc }} />
            </span>
            replay · EURUSD · M15
          </span>
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>×{reduced ? 1 : 64}</span>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="relative block w-full" style={{ height: 'auto' }} aria-hidden>
          <defs>
            <linearGradient id="bt-eq" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#8b7bff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#8b7bff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* зони угод: тейк зеленим, стоп червоним */}
          {visibleTrades.map((t) => {
            const x0 = xOfTick(t.at);
            const x1 = t.done ? xOfTick(t.closeAt) : W - STEP / 2;
            if (x1 < 0) return null;
            const yE = y(t.entry);
            return (
              <g key={t.id} opacity={t.done ? 0.55 : 1}>
                <rect x={x0} width={Math.max(x1 - x0, 2)} y={Math.min(yE, y(t.tp))} height={Math.abs(y(t.tp) - yE)} fill="rgba(52,211,153,0.12)" />
                <rect x={x0} width={Math.max(x1 - x0, 2)} y={Math.min(yE, y(t.sl))} height={Math.abs(y(t.sl) - yE)} fill="rgba(248,113,113,0.12)" />
                <line x1={x0} x2={x1} y1={yE} y2={yE} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
                <circle cx={x0} cy={yE} r="3.5" fill={t.dir > 0 ? '#34d399' : '#f87171'} />
                {t.done && (
                  <text x={x1 + 4} y={y(t.r > 0 ? t.tp : t.sl) + 4} fontSize="11" fontFamily="ui-monospace, monospace" fill={t.r > 0 ? '#34d399' : '#f87171'}>
                    {t.r > 0 ? `+${t.r}R` : '−1R'}
                  </text>
                )}
              </g>
            );
          })}

          {/* свічки */}
          {candles.map((c, i) => {
            const cx = i * STEP + STEP / 2;
            const up = c.close >= c.open;
            const col = up ? '#34d399' : '#f87171';
            return (
              <g key={i}>
                <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeOpacity="0.7" />
                <rect x={cx - STEP * 0.3} width={STEP * 0.6} y={y(Math.max(c.open, c.close))} height={Math.max(Math.abs(y(c.open) - y(c.close)), 1.2)} fill={col} rx="1" />
              </g>
            );
          })}

          {/* «голова» програвача */}
          <line x1={W - STEP / 2} x2={W - STEP / 2} y1="0" y2={CHART_H} stroke="rgba(139,123,255,0.6)" />

          {/* крива капіталу */}
          <line x1="0" x2={W} y1={EQ_TOP - 6} y2={EQ_TOP - 6} stroke="rgba(255,255,255,0.06)" />
          {equity.length > 1 && (
            <>
              <path d={`${eqPath} L${W},${EQ_TOP + EQ_H} L0,${EQ_TOP + EQ_H} Z`} fill="url(#bt-eq)" />
              <path d={eqPath} fill="none" stroke="#8b7bff" strokeWidth="2" strokeLinejoin="round" />
            </>
          )}
        </svg>

        {/* метрики — ті самі, що в журналі */}
        <div className="relative grid grid-cols-3 gap-2 px-5 pb-4 pt-1" style={{ fontFamily: T.mono }}>
          {[
            ['угод', closed.length ? String(allR) : '—'],
            ['win rate', allR ? `${winRate}%` : '—'],
            ['net', allR ? `${net > 0 ? '+' : ''}${net.toFixed(1)}R` : '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.35)' }}>{k}</div>
              <div
                className="mt-0.5 text-[15px] font-semibold tabular-nums"
                style={{ color: k === 'net' ? (net >= 0 ? '#34d399' : '#f87171') : '#EDECF7' }}
              >
                {v}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="mt-2 text-center text-[11px]" style={{ fontFamily: T.mono, color: 'rgba(255,255,255,0.25)' }}>
        приклад прогону · випадкові дані
      </div>
    </div>
  );
}


import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { T, EASE } from '../../lib/theme';
import { fmtR } from '../../lib/backtestStats';
import { ACT, act, actGradient } from './accent';

/* ==================================================================
   Крива еквіті.
   Свій SVG, а не recharts: тут потрібні речі, яких у бібліотеці
   немає задарма — підпис останнього значення прямо на кінці лінії,
   мітка найглибшої просадки і заливка, що міняє колір під нулем.
   Наведення веде вертикальну лінію й показує картку угоди.
================================================================== */

/* Ширину беремо з реального контейнера, а не малюємо в умовний
   viewBox і не масштабуємо: при масштабуванні кожен підпис їде на
   дробову позицію й розмивається. Тепер один користувацький піксель
   дорівнює одному пікселю SVG, і текст лишається чітким. */
const H = 320, PAD_L = 46, PAD_R = 20, PAD_T = 22, PAD_B = 38;

/* Скільки триває промальовування кривої. Решта — сітка, заливка,
   мітки — підв'язана до цієї цифри, щоб уся поява читалась як один
   рух, а не як п'ять окремих. */
const DRAW = 1.1;

/* Розміри підписів — у справжніх пікселях, тому дрібні */
const FS_AXIS = 11.5, FS_TICK = 11.5, FS_LAST = 14, FS_BADGE = 11.5;

const RANGES = [
  { label: 'Усі', keep: Infinity },
  { label: 'Останні 10', keep: 10 },
  { label: 'Останні 5', keep: 5 },
];

/* Приємні для ока рівні сітки навколо наявного діапазону */
function domainOf(values) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = Math.max(1, max - min);
  const step = Math.max(1, Math.ceil(span / 4));
  return { lo: Math.floor(min / step) * step - (min === 0 ? 0 : 0), hi: Math.ceil(max / step) * step, step };
}

export default function EquityCurve({ stats }) {
  const [range, setRange] = useState('Усі');
  const [hover, setHover] = useState(null);
  const plot = useRef(null);
  const [W, setW] = useState(1240);

  useEffect(() => {
    const el = plot.current;
    if (!el) return undefined;
    const measure = () => setW(Math.max(420, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const view = useMemo(() => {
    const eq = stats.equity;
    const cfg = RANGES.find((r) => r.label === range) || RANGES[0];
    const keep = cfg.keep === Infinity ? eq.length - 1 : cfg.keep;
    const from = Math.max(0, eq.length - 1 - keep);
    return { points: eq.slice(from), from };
  }, [stats.equity, range]);

  const pts = view.points;
  const enough = pts.length > 1;

  const geo = useMemo(() => {
    if (!enough) return null;
    const values = pts.map((p) => p.r);
    const { lo, hi, step } = domainOf(values);
    const span = hi - lo || 1;
    const x = (i) => PAD_L + (i * (W - PAD_L - PAD_R)) / (pts.length - 1);
    const y = (v) => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - lo) / span);
    const xy = pts.map((p, i) => [x(i), y(p.r)]);

    let d = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
    for (let i = 0; i < xy.length - 1; i += 1) {
      const p0 = xy[i], p1 = xy[i + 1], mx = (p0[0] + p1[0]) / 2;
      d += ` C${mx.toFixed(1)},${p0[1].toFixed(1)} ${mx.toFixed(1)},${p1[1].toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
    }
    const zero = y(0);
    const area = `${d} L${xy[xy.length - 1][0].toFixed(1)},${zero} L${xy[0][0].toFixed(1)},${zero} Z`;

    const levels = [];
    for (let v = lo; v <= hi + 0.001; v += step) levels.push(Number(v.toFixed(2)));
    if (!levels.includes(0) && lo < 0 && hi > 0) levels.push(0);

    /* Позначаємо дно просадки, а не найнижчу точку кривої. Це різні
       речі: крива могла впасти до −4R, але якщо перед тим вона стояла
       на +1R, просадка склала −5R. Раніше на графіку був мінімум, а в
       KPI і в тултипі — просадка, і два різні числа виглядали як
       помилка. */
    let ddIdx = -1;
    pts.forEach((pt, i) => {
      const dd = pt.dd ?? 0;
      if (dd < 0 && (ddIdx === -1 || dd < (pts[ddIdx].dd ?? 0))) ddIdx = i;
    });
    return { xy, d, area, zero, levels, ddIdx, y };
  }, [pts, enough, W]);

  const onMove = (e) => {
    if (!enough) return;
    const r = e.currentTarget.getBoundingClientRect();
    /* Один до одного з полотном: курсор у пікселях SVG, без часток */
    const t = (e.clientX - r.left - PAD_L) / Math.max(1, W - PAD_L - PAD_R);
    const i = Math.max(1, Math.min(pts.length - 1, Math.round(t * (pts.length - 1))));
    if (i !== hover) setHover(i);
  };

  const up = stats.netR >= 0;
  const line = up ? T.ok : T.bad;
  const tip = hover != null && pts[hover] ? pts[hover] : null;

  /* Картка стає ліворуч від точки, коли та вже близько до правого
     краю — інакше вилазить за межі панелі.

     Переворот іде окремою властивістю `x`, а не CSS-трансформом:
     картка анімована, і framer сам пише transform (там y і scale),
     тому мій translateX він просто затирав — біля останньої точки
     переворот не спрацьовував зовсім. Відступ у 14px закладено
     прямо в left, щоб обидва зсуви жили в одній системі.

     Поріг рахуємо від реальної координати, а не від номера угоди:
     при двох-трьох записах номер нічого не каже про те, де точка. */
  const tipPos = (() => {
    const i = hover || 1;
    const x = geo ? geo.xy[i]?.[0] ?? PAD_L : PAD_L;
    const flip = x > W * 0.62;
    /* 20px — падінг картки: полотно починається саме звідти */
    return { left: 20 + x + (flip ? -14 : 14), flip };
  })();

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="overflow-hidden rounded-[20px]"
      style={{ background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`, border: `1px solid ${T.line}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 pb-4 pt-5">
        <div>
          <div className="text-[16.5px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
            Крива еквіті
          </div>
          <div className="mt-1.5 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            Наростаючий R · просадка −{stats.maxDrawdownR.toFixed(2)}R
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl p-[5px]" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
          {RANGES.map((r) => {
            const on = range === r.label;
            return (
              <button
                key={r.label}
                onClick={() => { setRange(r.label); setHover(null); }}
                className="relative flex h-8 items-center whitespace-nowrap rounded-lg px-3.5 text-[12.5px] font-semibold"
                style={{ fontFamily: T.sans, color: on ? '#ffffff' : T.text3, transition: 'color .25s ease', zIndex: 1 }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
              >
                {on && (
                  <motion.span
                    layoutId="eq-range"
                    transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.8 }}
                    className="absolute inset-0 rounded-lg"
                    style={{ background: actGradient, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)', zIndex: -1 }}
                  />
                )}
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative px-5 pb-[18px]">
        {!enough ? (
          <div ref={plot} className="grid h-[220px] place-items-center text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            Крива зʼявиться після першої угоди.
          </div>
        ) : (
          <>
            <div ref={plot} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width={W}
              height={H}
              style={{ display: 'block', overflow: 'visible', maxWidth: '100%' }}
            >
              <defs>
                <linearGradient id="eqUp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.ok} stopOpacity="0.34" />
                  <stop offset="100%" stopColor={T.ok} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="eqDn" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor={T.warn} stopOpacity="0.26" />
                  <stop offset="100%" stopColor={T.warn} stopOpacity="0" />
                </linearGradient>
                <clipPath id="eqClipUp"><rect x="0" y="0" width={W} height={Math.max(0, geo.zero)} /></clipPath>
                <clipPath id="eqClipDn"><rect x="0" y={geo.zero} width={W} height={Math.max(0, H - geo.zero)} /></clipPath>
              </defs>

              {geo.levels.map((v, li) => (
                <motion.g
                  key={`lvl${v}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.04 * li }}
                >
                  <line
                    x1={PAD_L} x2={W - PAD_R} y1={geo.y(v)} y2={geo.y(v)}
                    stroke={v === 0 ? act(0.32) : T.line} strokeWidth={v === 0 ? 1.4 : 1}
                  />
                  <text
                    x={PAD_L - 10} y={geo.y(v) + 4} textAnchor="end"
                    fill={v === 0 ? ACT.tint : T.text3} fontSize={FS_AXIS} fontWeight="600" fontFamily={T.mono}
                  >
                    {v}R
                  </text>
                </motion.g>
              ))}

              {/* Заливка проявляється слідом за лінією, а не разом із
                  нею: інакше вона стоїть готовою під олівцем, який ще
                  тільки малює криву. */}
              <motion.path
                d={geo.area} fill="url(#eqUp)" clipPath="url(#eqClipUp)"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: DRAW * 0.55 }}
              />
              <motion.path
                d={geo.area} fill="url(#eqDn)" clipPath="url(#eqClipDn)"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: DRAW * 0.55 }}
              />
              <motion.path
                d={geo.d} fill="none" stroke={line} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: DRAW, ease: [0.32, 0.72, 0.35, 1] }}
              />

              {pts.map((p, i) => (
                (i === 0 || i % 3 === 0 || i === pts.length - 1) ? (
                  <motion.text
                    key={`tick${i}`} x={geo.xy[i][0]} y={H - 12} textAnchor="middle"
                    fill={T.text3} fontSize={FS_TICK} fontWeight="500" fontFamily={T.mono}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ duration: 0.35, delay: DRAW * (i / Math.max(1, pts.length - 1)) * 0.9 }}
                  >
                    {p.i === 0 ? 'Start' : `#${p.i}`}
                  </motion.text>
                ) : null
              ))}

              {/* Дно просадки — видно, де було найбільш боляче */}
              {geo.ddIdx > 0 && (() => {
                const [cx, cy] = geo.xy[geo.ddIdx];
                const label = `Max DD ${pts[geo.ddIdx].dd.toFixed(2)}R`;
                /* Моноширинний шрифт дає передбачувану ширину, тому
                   плашку можна порахувати без вимірювання тексту */
                const bw = label.length * 6.9 + 20;
                const bh = 23;
                const bx = Math.max(PAD_L, Math.min(W - PAD_R - bw, cx - bw / 2));
                /* Дно просадки часто лежить біля самої осі, і плашка під
                   ним налазила на підписи угод. Якщо знизу місця немає —
                   вішаємо її над точкою. */
                const below = cy + 16 + bh <= H - PAD_B - 4;
                const by = below ? cy + 16 : cy - 16 - bh;
                return (
                  <motion.g
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35, delay: DRAW * 0.8 }}
                  >
                    <line
                      x1={cx} x2={cx} y1={cy} y2={H - PAD_B}
                      stroke={T.warn} strokeOpacity="0.3" strokeWidth={1} strokeDasharray="3 5"
                    />
                    <circle cx={cx} cy={cy} r={8} fill={T.warn} opacity="0.13" />
                    <circle cx={cx} cy={cy} r={3.4} fill={T.surface} stroke={T.warn} strokeWidth={2} />
                    {/* Непрозора підкладка: без неї крізь плашку
                        просвічували крива й підписи осі */}
                    <rect x={bx} y={by} width={bw} height={bh} rx={9} fill={T.surface} />
                    <rect
                      x={bx} y={by} width={bw} height={bh} rx={9}
                      fill={`rgba(${T.warnRgb},0.16)`} stroke={`rgba(${T.warnRgb},0.34)`} strokeWidth={1}
                    />
                    <text
                      x={bx + bw / 2} y={by + 15.5} textAnchor="middle"
                      fill={T.warn} fontSize={FS_BADGE} fontWeight="700" letterSpacing="0.3"
                      fontFamily={T.mono}
                    >
                      {label}
                    </text>
                  </motion.g>
                );
              })()}

              <motion.g
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26, delay: DRAW }}
                style={{ transformOrigin: `${geo.xy[pts.length - 1][0]}px ${geo.xy[pts.length - 1][1]}px` }}
              >
                <circle cx={geo.xy[pts.length - 1][0]} cy={geo.xy[pts.length - 1][1]} r={8} fill={line} opacity="0.14" />
                <circle cx={geo.xy[pts.length - 1][0]} cy={geo.xy[pts.length - 1][1]} r={3.2} fill={line} stroke={T.surface} strokeWidth={1.8} />
              </motion.g>
              {/* Коли дно просадки припадає на останню угоду, плашка
                  Max DD стоїть рівно тут — два підписи в одній точці
                  накладались. Поточний R у такому разі й так видно
                  у смузі цифр нагорі. */}
              {geo.ddIdx !== pts.length - 1 && (
                <motion.text
                  x={geo.xy[pts.length - 1][0] - 12} y={geo.xy[pts.length - 1][1] - 14} textAnchor="end"
                  fill={line} fontSize={FS_LAST} fontWeight="700" fontFamily={T.mono}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: DRAW }}
                >
                  {fmtR(pts[pts.length - 1].r)}
                </motion.text>
              )}

              {hover != null && hover > 0 && (
                <g>
                  <line
                    x1={geo.xy[hover][0]} x2={geo.xy[hover][0]} y1={PAD_T} y2={H - PAD_B}
                    stroke={act(0.68)} strokeWidth={1.2} strokeDasharray="3 5"
                  />
                  <circle cx={geo.xy[hover][0]} cy={geo.xy[hover][1]} r={8} fill={line} opacity="0.14" />
                  <circle cx={geo.xy[hover][0]} cy={geo.xy[hover][1]} r={3.2} fill={line} stroke={T.surface} strokeWidth={1.8} />
                </g>
              )}
            </svg>
            </div>

            {tip && hover > 0 && (
              /* Картка не зʼявляється ривком і не стрибає між точками:
                 сама поява — коротке проявлення знизу вгору, а зсув
                 по горизонталі йде пружиною, тому при веденні мишею
                 вона ковзає слідом, а не телепортується. */
              <motion.div
                key="eq-tip"
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  left: tipPos.left,
                  x: tipPos.flip ? '-100%' : '0%',
                }}
                transition={{
                  opacity: { duration: 0.18, ease: 'easeOut' },
                  y: { duration: 0.22, ease: EASE },
                  scale: { duration: 0.22, ease: EASE },
                  left: { type: 'spring', stiffness: 420, damping: 38, mass: 0.7 },
                }}
                className="pointer-events-none absolute top-[22px] z-10 min-w-[196px] overflow-hidden rounded-[14px]"
                style={{
                  /* Суцільний фон, а не панельна змінна: --edge-panel
                     напівпрозорий (він розрахований на розмиту бічну
                     панель), і крізь випадайку просвічував вміст під нею. */
                  background: T.surfaceHi,
                  border: `1px solid ${T.lineHi}`,
                  boxShadow: 'var(--edge-panel-shadow, 0 24px 50px -18px rgba(0,0,0,0.9))',
                }}
              >
                <div
                  className="px-4 py-3 text-[14px] font-bold"
                  style={{ fontFamily: T.sans, color: T.text, borderBottom: `1px solid ${T.line}` }}
                >
                  Угода {tip.label}
                </div>
                <div className="flex flex-col gap-[9px] px-4 pb-3.5 pt-3">
                  {[
                    tip.date && { k: 'Дата', v: tip.date, c: T.text },
                    tip.tradeR != null && { k: 'Ця угода', v: fmtR(tip.tradeR), c: tip.tradeR > 0 ? T.ok : tip.tradeR < 0 ? T.bad : T.text3 },
                    { k: 'Накопичено', v: fmtR(tip.r), c: tip.r >= 0 ? T.ok : T.bad },
                    { k: 'Баланс', v: `$${tip.balance.toLocaleString('uk-UA')}`, c: T.text },
                    tip.dd < 0 && { k: 'Просадка', v: `${tip.dd.toFixed(2)}R`, c: T.warn },
                  ].filter(Boolean).map((row) => (
                    <div key={row.k} className="flex items-center justify-between gap-6">
                      <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{row.k}</span>
                      <span className="text-[13.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: row.c }}>{row.v}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </motion.section>
  );
}

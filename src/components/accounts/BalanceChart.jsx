import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { T, EASE } from '../../lib/theme';
import { money } from '../../lib/accountsStore';

/* ==================================================================
   Balance chart.

   Малюється по реальних подіях акаунта: кожна точка — момент, коли
   баланс справді змінився. Лінія ступінчаста, бо баланс не перетікає
   поступово — він стрибає в день виплати.

   Окремо оброблено найчастіший стан: акаунт щойно створено, подія
   одна. Раніше лінія в цьому місці йшла кудись вліво, а заливка
   давала клин на пів екрана.

   Ховер повернутий назад: вертикальна пунктирна лінія й підказка з
   датою/дельтою під курсором — точно як у макеті.
================================================================== */

const W = 620;
const H = 264;
const TOP = 14;
const PADX = 9;

const fmtDay = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/* Проміжні точки — світло-фіолетові, остання (найсвіжіша) — зелена,
   як і сама лінія на своєму кінці. Один узгоджений градієнт на все:
   фіолетовий → лавандовий → зелений, зліва направо. */
const NODE = '#a99bff';

export default function BalanceChart({ events, initial }) {
  const uid = useRef(Math.random().toString(36).slice(2, 8)).current;
  const [hover, setHover] = useState(-1);

  const model = useMemo(() => {
    const pts = events.map((e) => ({
      date: e.happened_at,
      value: Number(e.balance_after) || 0,
      kind: e.kind,
      amount: Number(e.amount) || 0,
      note: e.note,
    }));

    if (!pts.length) return null;

    const values = pts.map((p) => p.value).concat(initial ? [initial] : []);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const pad = span ? span * 0.35 : Math.max(1, max * 0.06);
    const lo = min - pad;
    const hi = max + pad;

    const iw = W - PADX * 2;
    const ih = H - TOP;

    const x = (i) => (pts.length === 1 ? W / 2 : PADX + (iw * i) / (pts.length - 1));
    const y = (v) => TOP + (1 - (v - lo) / (hi - lo)) * ih;

    const nodes = pts.map((p, i) => ({ ...p, cx: x(i), cy: y(p.value) }));

    /* Одна подія — рівна лінія через усе поле, без стрибків і клинів */
    if (nodes.length === 1) {
      const cy = nodes[0].cy;
      nodes[0].cx = W - PADX;
      return {
        nodes,
        flat: cy,
        d: `M${PADX},${cy.toFixed(1)} L${(W - PADX).toFixed(1)},${cy.toFixed(1)}`,
        area: null,
        baseY: initial ? y(initial) : null,
        last: nodes[0],
        lo,
        hi,
      };
    }

    let d = `M${nodes[0].cx.toFixed(1)},${nodes[0].cy.toFixed(1)}`;
    for (let i = 1; i < nodes.length; i += 1) {
      d += ` L${nodes[i].cx.toFixed(1)},${nodes[i - 1].cy.toFixed(1)}`;
      d += ` L${nodes[i].cx.toFixed(1)},${nodes[i].cy.toFixed(1)}`;
    }

    const bottom = H;
    const area = `${d} L${nodes[nodes.length - 1].cx.toFixed(1)},${bottom} L${nodes[0].cx.toFixed(1)},${bottom} Z`;

    return { nodes, flat: null, d, area, baseY: initial ? y(initial) : null, last: nodes[nodes.length - 1], lo, hi };
  }, [events, initial]);

  if (!model) return null;

  const up = model.last.value >= (initial || 0);
  const stroke = up ? T.ok : T.bad;
  const hi = model.flat === null && hover >= 0 && hover < model.nodes.length ? hover : -1;
  const hn = hi >= 0 ? model.nodes[hi] : null;
  const prev = hi > 0 ? model.nodes[hi - 1] : null;
  const hoverLeftSide = hn ? hn.cx > W / 2 : false;

  const onMove = (e) => {
    if (model.flat !== null) return;
    const r = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    model.nodes.forEach((n, i) => { if (Math.abs(n.cx - rel) < Math.abs(model.nodes[best].cx - rel)) best = i; });
    if (best !== hover) setHover(best);
  };

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block w-full cursor-crosshair"
        style={{ height: 'auto' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(-1)}
      >
        <defs>
          <linearGradient id={`fill${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={T.acc} stopOpacity="0.34" />
            <stop offset="70%" stopColor={T.acc} stopOpacity="0.05" />
            <stop offset="100%" stopColor={T.acc} stopOpacity="0" />
          </linearGradient>
          {/* Одна тепла подорож кольору зліва направо: фіолетовий
             старт → лавандова середина → зелений фініш. */}
          <linearGradient id={`line${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4a3fc4" />
            <stop offset="55%" stopColor={NODE} />
            <stop offset="100%" stopColor={T.ok} />
          </linearGradient>
          <filter id={`glow${uid}`} x="-15%" y="-60%" width="130%" height="260%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {[0.27, 0.53, 0.8].map((k) => (
          <line key={k} x1="0" y1={H * k} x2={W} y2={H * k} stroke={T.line} strokeWidth="1" />
        ))}

        {model.area && (
          <motion.path
            d={model.area}
            fill={`url(#fill${uid})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
          />
        )}

        {/* М'яке сяйво позаду лінії — розмита копія того самого шляху */}
        {model.flat === null && (
          <path
            d={model.d}
            fill="none"
            stroke={`url(#line${uid})`}
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.16"
            filter={`url(#glow${uid})`}
          />
        )}

        <motion.path
          d={model.d}
          fill="none"
          stroke={model.flat !== null ? stroke : `url(#line${uid})`}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={model.flat !== null ? '5 6' : undefined}
          strokeOpacity={model.flat !== null ? 0.45 : 1}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: EASE }}
        />

        {/* Дихаюче гало на останній точці — акаунт «живий» */}
        {model.flat === null && (
          <motion.circle
            cx={model.last.cx}
            cy={model.last.cy}
            r={6}
            fill={T.ok}
            initial={{ opacity: 0.45 }}
            animate={{ r: [6, 11, 6], opacity: [0.45, 0.12, 0.45] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {hn && (
          <g>
            <line x1={hn.cx} y1="0" x2={hn.cx} y2={H} stroke={T.lineHi} strokeWidth="1" strokeDasharray="3 4" />
            <circle cx={hn.cx} cy={hn.cy} r="9" fill={`rgba(${T.accRgb},0.16)`} />
            <circle cx={hn.cx} cy={hn.cy} r="4.5" fill={T.text} />
          </g>
        )}

        {model.nodes.map((n, i) => {
          const isLast = i === model.nodes.length - 1;
          const color = isLast ? T.ok : NODE;
          const r = isLast ? 5 : 3.2;
          return (
            <motion.circle
              key={i}
              cx={n.cx}
              cy={n.cy}
              r={r}
              fill={T.bg}
              stroke={color}
              strokeWidth="2"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.45 + i * 0.05, ease: EASE }}
              style={{ transformOrigin: `${n.cx}px ${n.cy}px` }}
            />
          );
        })}
      </svg>

      {/* Мітки дат під графіком — по одній на точку */}
      <div className="relative mt-1.5 h-[16px]">
        {model.nodes.map((n, i) => {
          const isFirst = i === 0;
          const isLast = i === model.nodes.length - 1;
          return (
            <span
              key={i}
              className="absolute whitespace-nowrap text-[10.5px]"
              style={{
                left: `${(n.cx / W) * 100}%`,
                transform: isFirst ? 'none' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                fontFamily: T.mono,
                color: T.text3,
              }}
            >
              {fmtDay(n.date)}
            </span>
          );
        })}
      </div>

      {/* Підказка під курсором — дата, дельта від попередньої точки, баланс */}
      {hn && (
        <div
          className="pointer-events-none absolute top-[10px] flex flex-col gap-0.5 whitespace-nowrap rounded-xl px-3.5 py-2.5"
          style={{
            left: `${(hn.cx / W) * 100}%`,
            /* Точка ліворуч — підказка їде праворуч від неї; точка
               праворуч — ліворуч, інакше вилазить за край графіка
               (саме це й ламалось на першій точці). */
            transform: hoverLeftSide ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
            background: 'rgba(14,14,20,0.95)',
            border: `1px solid ${T.lineAcc}`,
            boxShadow: '0 16px 40px -16px rgba(0,0,0,0.9)',
          }}
        >
          <span
            className="text-[15px] font-semibold tabular-nums"
            style={{
              fontFamily: T.mono,
              color: !prev ? T.text2 : hn.value < prev.value ? NODE : T.ok,
            }}
          >
            {!prev ? 'opening balance' : `${hn.value >= prev.value ? '+' : '−'}${money(Math.abs(hn.value - prev.value))}`}
          </span>
          <span className="text-[11.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {fmtDay(hn.date)} · balance{' '}
            <span style={{ fontFamily: T.mono, color: T.text2 }}>{money(hn.value)}</span>
          </span>
        </div>
      )}

      {/* Порожній стан пояснюємо словами, а не порожнім полем */}
      {model.flat !== null && (
        <div
          className="pointer-events-none absolute left-1/2 rounded-lg px-3 py-1.5 text-[12px]"
          style={{
            top: `${(model.flat / H) * 100}%`,
            transform: 'translate(-50%, -150%)',
            background: 'rgba(10,10,12,0.9)',
            border: `1px solid ${T.line}`,
            fontFamily: T.sans,
            color: T.text3,
            whiteSpace: 'nowrap',
          }}
        >
          No movement yet — log your first payout
        </div>
      )}
    </div>
  );
}

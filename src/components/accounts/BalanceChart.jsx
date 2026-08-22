import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { T, EASE } from '../../lib/theme';
import { KINDS_EN, money, money2 } from '../../lib/accountsStore';

/* ==================================================================
   Balance chart.

   Малюється по реальних подіях акаунта: кожна точка — момент, коли
   баланс справді змінився. Лінія ступінчаста, бо баланс не перетікає
   поступово — він стрибає в день виплати.

   Окремо оброблено найчастіший стан: акаунт щойно створено, подія
   одна. Раніше лінія в цьому місці йшла кудись вліво, а заливка
   давала клин на пів екрана.
================================================================== */

const W = 800;
const H = 210;
const PAD = { l: 58, r: 78, t: 24, b: 30 };

const fmtDay = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const fmtFull = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const DOT = {
  start: T.text3,
  payout: T.warn,
  deposit: T.info,
  adjust: T.text2,
};

export default function BalanceChart({ events, initial }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const uid = useRef(Math.random().toString(36).slice(2, 8)).current;

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

    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;

    const x = (i) => (pts.length === 1 ? PAD.l + iw : PAD.l + (iw * i) / (pts.length - 1));
    const y = (v) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;

    const nodes = pts.map((p, i) => ({ ...p, cx: x(i), cy: y(p.value) }));

    /* Одна подія — рівна лінія через усе поле, без стрибків і клинів */
    if (nodes.length === 1) {
      const cy = nodes[0].cy;
      nodes[0].cx = PAD.l + iw;
      return {
        nodes,
        flat: cy,
        d: `M${PAD.l},${cy.toFixed(1)} L${(PAD.l + iw).toFixed(1)},${cy.toFixed(1)}`,
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

    const bottom = H - PAD.b;
    const area = `${d} L${nodes[nodes.length - 1].cx.toFixed(1)},${bottom} L${nodes[0].cx.toFixed(1)},${bottom} Z`;

    return { nodes, flat: null, d, area, baseY: initial ? y(initial) : null, last: nodes[nodes.length - 1], lo, hi };
  }, [events, initial]);

  if (!model) return null;

  const up = model.last.value >= (initial || 0);
  const stroke = up ? T.ok : T.bad;
  const strokeRgb = up ? T.okRgb : T.badRgb;

  const onMove = (e) => {
    if (model.flat !== null) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    model.nodes.forEach((n, i) => {
      if (Math.abs(n.cx - px) < Math.abs(model.nodes[best].cx - px)) best = i;
    });
    setHover(best);
  };

  const hovered = hover === null ? null : model.nodes[hover];

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[206px] w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fill${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          {/* Лінія розгорається зліва направо — свіже завжди яскравіше */}
          <linearGradient id={`line${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.45" />
            <stop offset="100%" stopColor={stroke} stopOpacity="1" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((k) => {
          const gy = PAD.t + (H - PAD.t - PAD.b) * k;
          return (
            <line
              key={k}
              x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy}
              stroke={T.line} strokeWidth="1"
              strokeDasharray={k === 1 ? '0' : '3 5'}
            />
          );
        })}

        <text x={PAD.l - 10} y={PAD.t + 4} fill={T.text4} fontSize="10.5" textAnchor="end" style={{ fontFamily: T.sans }}>
          {money(model.hi)}
        </text>
        <text x={PAD.l - 10} y={H - PAD.b + 4} fill={T.text4} fontSize="10.5" textAnchor="end" style={{ fontFamily: T.sans }}>
          {money(model.lo)}
        </text>

        {/* Рівень стартового розміру. Підпис винесено в правий край,
            щоб не лягав на саму лінію. */}
        {model.baseY !== null && (
          <>
            <line
              x1={PAD.l} y1={model.baseY} x2={W - PAD.r} y2={model.baseY}
              stroke={T.acc} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="4 5"
            />
            <rect
              x={W - PAD.r + 8} y={model.baseY - 9} width={62} height={18} rx={9}
              fill={T.bg} stroke={T.acc} strokeOpacity="0.32"
            />
            <text
              x={W - PAD.r + 39} y={model.baseY + 4}
              fill={T.acc} fontSize="9.5" fontWeight="700" textAnchor="middle"
              letterSpacing="0.6"
              style={{ fontFamily: T.sans }}
            >
              START
            </text>
          </>
        )}

        {model.area && (
          <motion.path
            d={model.area}
            fill={`url(#fill${uid})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
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
          style={model.flat === null ? { filter: `drop-shadow(0 0 8px rgba(${strokeRgb},0.45))` } : undefined}
        />

        {hovered && (
          <>
            <line
              x1={hovered.cx} y1={PAD.t - 8} x2={hovered.cx} y2={H - PAD.b}
              stroke={T.lineHi} strokeWidth="1"
            />
            <line
              x1={PAD.l} y1={hovered.cy} x2={W - PAD.r} y2={hovered.cy}
              stroke={T.lineHi} strokeWidth="1" strokeDasharray="2 4"
            />
          </>
        )}

        {model.nodes.map((n, i) => (
          <g key={i}>
            {hover === i && (
              <circle cx={n.cx} cy={n.cy} r="11" fill={DOT[n.kind] || stroke} fillOpacity="0.14" />
            )}
            <motion.circle
              cx={n.cx}
              cy={n.cy}
              r={hover === i ? 6 : 4.5}
              fill={T.bg}
              stroke={DOT[n.kind] || stroke}
              strokeWidth="2.5"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.45 + i * 0.05, ease: EASE }}
              style={{ transition: 'r .15s ease' }}
            />
          </g>
        ))}

        <text x={PAD.l} y={H - 8} fill={T.text4} fontSize="10.5" style={{ fontFamily: T.sans }}>
          {fmtDay(model.nodes[0].date)}
        </text>
        {model.nodes.length > 1 && (
          <text x={W - PAD.r} y={H - 8} fill={T.text4} fontSize="10.5" textAnchor="end" style={{ fontFamily: T.sans }}>
            {fmtDay(model.last.date)}
          </text>
        )}
      </svg>

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
            color: T.text4,
            whiteSpace: 'nowrap',
          }}
        >
          No movement yet — log your first payout
        </div>
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 min-w-[152px] rounded-xl px-3 py-2.5"
          style={{
            left: `${(hovered.cx / W) * 100}%`,
            top: `${(hovered.cy / H) * 100}%`,
            transform: `translate(${hovered.cx > W * 0.66 ? '-108%' : '14px'}, -50%)`,
            background: 'rgba(10,10,12,0.94)',
            border: `1px solid ${T.lineHi}`,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 20px 50px -24px rgba(0,0,0,0.95)',
          }}
        >
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: DOT[hovered.kind] || T.text3 }}>
            {KINDS_EN[hovered.kind]?.label || hovered.kind}
          </div>
          <div className="mt-1 text-[16px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>
            {money2(hovered.value)}
          </div>
          {hovered.kind !== 'start' && hovered.amount > 0 && (
            <div className="text-[12.5px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: hovered.kind === 'payout' ? T.warn : T.info }}>
              {hovered.kind === 'payout' ? '−' : '+'}{money2(hovered.amount)}
            </div>
          )}
          <div className="mt-1 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
            {fmtFull(hovered.date)}
          </div>
        </div>
      )}
    </div>
  );
}
